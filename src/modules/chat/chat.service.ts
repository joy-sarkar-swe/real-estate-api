import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SendMessageDto, StartConversationDto } from './dto/chat.dto';
import { MessageType } from '@prisma/client';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Start or find conversation ───────────────────────────────

  async startConversation(senderId: string, dto: StartConversationDto) {
    // Idempotent: find existing 1-on-1 conversation for this property
    const existing = await this.prisma.conversation.findFirst({
      where: {
        propertyId: dto.propertyId ?? null,
        participants: {
          every: {
            userId: { in: [senderId, dto.recipientId] },
          },
        },
      },
      include: { participants: true },
    });

    if (existing && existing.participants.length === 2) {
      // Add initial message to existing conversation
      const message = await this.prisma.message.create({
        data: {
          conversationId: existing.id,
          senderId,
          content: dto.initialMessage,
          type: MessageType.TEXT,
        },
      });
      return { conversation: existing, message };
    }

    // Create new conversation + initial message atomically
    const conversation = await this.prisma.conversation.create({
      data: {
        propertyId: dto.propertyId,
        participants: {
          create: [{ userId: senderId }, { userId: dto.recipientId }],
        },
        messages: {
          create: {
            senderId,
            content: dto.initialMessage,
            type: MessageType.TEXT,
          },
        },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        messages: true,
      },
    });

    this.logger.log(`Conversation started: ${conversation.id}`);
    return { conversation };
  }

  // ─── Send Message ─────────────────────────────────────────────

  async sendMessage(conversationId: string, senderId: string, dto: SendMessageDto) {
    await this.verifyParticipant(conversationId, senderId);

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        content: dto.content,
        type: dto.type ?? MessageType.TEXT,
        metadata: dto.metadata ?? undefined,
        isDelivered: true,
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Update conversation updatedAt for recency sorting
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  // ─── Get Conversations List ───────────────────────────────────

  async getConversations(userId: string) {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1, // last message preview
            },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    return participants.map((p) => {
      const conv = p.conversation;
      const otherParticipants = conv.participants.filter((pp) => pp.userId !== userId);
      const lastMessage = conv.messages[0] ?? null;
      const unreadCount = 0; // Computed via read receipts in production

      return {
        id: conv.id,
        propertyId: conv.propertyId,
        participants: otherParticipants.map((pp) => pp.user),
        lastMessage,
        unreadCount,
        updatedAt: conv.updatedAt,
      };
    });
  }

  // ─── Get Messages ─────────────────────────────────────────────

  async getMessages(
    conversationId: string,
    userId: string,
    limit = 50,
    cursor?: string,
  ) {
    await this.verifyParticipant(conversationId, userId);

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        sender: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Mark messages as read
    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: new Date() },
    });

    const hasMore = messages.length > limit;
    const data = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? data[data.length - 1].id : undefined;

    return { messages: data.reverse(), nextCursor, hasMore };
  }

  // ─── Unread count ─────────────────────────────────────────────

  async getUnreadCount(userId: string): Promise<{ total: number }> {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true, lastReadAt: true },
    });

    let total = 0;
    for (const p of participants) {
      const count = await this.prisma.message.count({
        where: {
          conversationId: p.conversationId,
          senderId: { not: userId },
          ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
        },
      });
      total += count;
    }

    return { total };
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async verifyParticipant(conversationId: string, userId: string) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participant) throw new ForbiddenException('Not a participant in this conversation');
    return participant;
  }
}

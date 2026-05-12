import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/chat.dto';
import { OnEvent } from '@nestjs/event-emitter';

/**
 * WebSocket gateway handling:
 *  - Real-time chat messaging
 *  - Property listing events (created, updated, deleted, price_changed)
 *  - Read receipts
 *  - Reconnection via room re-join
 */
@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/ws',
  transports: ['websocket', 'polling'],
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server): void {
    this.logger.log('WebSocket gateway initialized');
  }

  // ─── Connection / Disconnection ───────────────────────────────

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) throw new WsException('No token provided');

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwt.accessSecret'),
      });

      client.data.userId = payload.sub;
      client.data.role = payload.role;

      // Join personal room for targeted events
      client.join(`user:${payload.sub}`);
      this.logger.log(`Client connected: ${client.id} (user: ${payload.sub})`);
    } catch (err) {
      this.logger.warn(`Connection rejected: ${client.id} - ${err.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ─── Join Conversation Room ───────────────────────────────────

  @SubscribeMessage('join_conversation')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.join(`conversation:${data.conversationId}`);
    return { event: 'joined', data: { conversationId: data.conversationId } };
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.leave(`conversation:${data.conversationId}`);
  }

  // ─── Send Message via WebSocket ───────────────────────────────

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string } & SendMessageDto,
  ) {
    const senderId = client.data.userId;
    if (!senderId) throw new WsException('Unauthorized');

    const message = await this.chatService.sendMessage(
      data.conversationId,
      senderId,
      { content: data.content, type: data.type, metadata: data.metadata },
    );

    // Broadcast to all participants in the room
    this.server
      .to(`conversation:${data.conversationId}`)
      .emit('new_message', message);

    return message;
  }

  // ─── Typing Indicator ─────────────────────────────────────────

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ) {
    client.to(`conversation:${data.conversationId}`).emit('typing', {
      userId: client.data.userId,
      conversationId: data.conversationId,
      isTyping: data.isTyping,
    });
  }

  // ─── Join Property Room (for listing updates) ─────────────────

  @SubscribeMessage('watch_property')
  handleWatchProperty(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { propertyId: string },
  ) {
    client.join(`property:${data.propertyId}`);
  }

  @SubscribeMessage('unwatch_property')
  handleUnwatchProperty(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { propertyId: string },
  ) {
    client.leave(`property:${data.propertyId}`);
  }

  // ─── Property Event Broadcasts ────────────────────────────────

  @OnEvent('property.created')
  handlePropertyCreated(property: any) {
    this.server.emit('property_created', {
      id: property.id,
      title: property.title,
      price: property.price,
      city: property.city,
    });
  }

  @OnEvent('property.updated')
  handlePropertyUpdated(property: any) {
    this.server
      .to(`property:${property.id}`)
      .emit('property_updated', { id: property.id, status: property.status });
  }

  @OnEvent('property.deleted')
  handlePropertyDeleted(data: { propertyId: string }) {
    this.server
      .to(`property:${data.propertyId}`)
      .emit('property_deleted', { id: data.propertyId });
  }

  @OnEvent('property.price_changed')
  handlePriceChanged(data: { propertyId: string; newPrice: number }) {
    this.server
      .to(`property:${data.propertyId}`)
      .emit('price_changed', data);
  }

  @OnEvent('visit.booked')
  handleVisitBooked(visit: any) {
    // Notify the owner
    this.server.to(`user:${visit.ownerId}`).emit('visit_booked', {
      visitId: visit.id,
      scheduledAt: visit.scheduledAt,
      tenant: visit.tenant,
      property: visit.property,
    });
  }

  // ─── Broadcast to user (utility used by other services) ───────

  emitToUser(userId: string, event: string, data: any): void {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}

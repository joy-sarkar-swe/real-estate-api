import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { StartConversationDto, SendMessageDto } from './dto/chat.dto';
import { CurrentUser } from '../../common';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('conversations')
  @ApiOperation({ summary: 'Start or find an existing conversation' })
  startConversation(
    @CurrentUser('id') userId: string,
    @Body() dto: StartConversationDto,
  ) {
    return this.chatService.startConversation(userId, dto);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Get all conversations for authenticated user' })
  getConversations(@CurrentUser('id') userId: string) {
    return this.chatService.getConversations(userId);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Get messages in a conversation (cursor-based pagination)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  getMessages(
    @Param('id', ParseUUIDPipe) conversationId: string,
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.chatService.getMessages(conversationId, userId, limit, cursor);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a message via REST (use WebSocket for real-time)' })
  sendMessage(
    @Param('id', ParseUUIDPipe) conversationId: string,
    @CurrentUser('id') senderId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(conversationId, senderId, dto);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get total unread message count' })
  getUnreadCount(@CurrentUser('id') userId: string) {
    return this.chatService.getUnreadCount(userId);
  }
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { MessageType } from '@prisma/client';

export class StartConversationDto {
  @ApiProperty()
  @IsUUID()
  recipientId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  initialMessage: string;
}

export class SendMessageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ enum: MessageType, default: MessageType.TEXT })
  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType = MessageType.TEXT;

  @ApiPropertyOptional({ description: 'JSON metadata (image URL, property card data, etc.)' })
  @IsOptional()
  metadata?: Record<string, any>;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class BookVisitDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  propertyId: string;

  @ApiProperty({ example: '2024-02-15T10:00:00Z', description: 'Scheduled datetime (ISO 8601)' })
  @IsDateString()
  scheduledAt: string;

  @ApiPropertyOptional({ example: 'Please keep the entry clear' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Idempotency key to prevent duplicate bookings' })
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;
}

export class RescheduleVisitDto {
  @ApiProperty({ example: '2024-02-20T14:00:00Z' })
  @IsDateString()
  scheduledAt: string;
}

export class CancelVisitDto {
  @ApiPropertyOptional({ example: 'Schedule conflict' })
  @IsOptional()
  @IsString()
  reason?: string;
}

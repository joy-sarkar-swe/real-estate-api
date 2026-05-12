import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { Controller, Post, Body, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common';
import { Module } from '@nestjs/common';

export class TrackEventDto {
  @ApiProperty({ enum: EventType })
  @IsEnum(EventType)
  eventType: EventType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, any>;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async track(
    eventType: EventType,
    userId?: string,
    propertyId?: string,
    metadata?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    try {
      await (this.prisma as any).analyticsEvent.create({
        data: {
          eventType,
          userId: userId ?? null,
          propertyId: propertyId ?? null,
          metadata: metadata ?? undefined,
          ipAddress,
          userAgent,
        },
      });
    } catch (err) {
      this.logger.error('Analytics tracking failed', err);
    }
  }

  async getEventStats(eventType?: EventType) {
    return (this.prisma as any).analyticsEvent.groupBy({
      by: ['eventType'],
      _count: { _all: true },
      ...(eventType ? { where: { eventType } } : {}),
    });
  }
}

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('track')
  @ApiOperation({ summary: 'Track a user analytics event' })
  track(
    @Body() dto: TrackEventDto,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    return this.analyticsService.track(
      dto.eventType,
      userId,
      dto.propertyId,
      dto.metadata,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }
}

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}

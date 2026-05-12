import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationType } from '@prisma/client';
import { Controller, Get, Patch, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CurrentUser } from '../../common';
import { Module } from '@nestjs/common';

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Create notification ───────────────────────────────────

  async create(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, any>,
  ) {
    return this.prisma.notification.create({
      data: { userId, type, title, body, data: data ?? undefined },
    });
  }

  // ─── List for user ────────────────────────────────────────

  async findAll(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ─── Mark one as read ─────────────────────────────────────

  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }

  // ─── Mark all as read ─────────────────────────────────────

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  // ─── Unread count ─────────────────────────────────────────

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  // ─── Event listeners ──────────────────────────────────────

  @OnEvent('visit.booked')
  async onVisitBooked(visit: any) {
    try {
      // Notify owner
      await this.create(
        visit.ownerId,
        NotificationType.VISIT_CONFIRMED,
        'New Visit Booking',
        `${visit.tenant?.firstName ?? 'Someone'} booked a visit on ${new Date(visit.scheduledAt).toLocaleString()}`,
        { visitId: visit.id, propertyId: visit.propertyId },
      );
    } catch (e) {
      this.logger.error('Failed to create visit notification', e);
    }
  }

  @OnEvent('visit.cancelled')
  async onVisitCancelled(visit: any) {
    try {
      // Notify the other party
      const notifyId = visit.status === 'CANCELLED' ? visit.ownerId : visit.tenantId;
      await this.create(
        notifyId,
        NotificationType.VISIT_CANCELLED,
        'Visit Cancelled',
        `A visit scheduled for ${new Date(visit.scheduledAt).toLocaleString()} has been cancelled`,
        { visitId: visit.id },
      );
    } catch (e) {
      this.logger.error('Failed to create cancellation notification', e);
    }
  }

  @OnEvent('property.price_changed')
  async onPriceChanged(data: { propertyId: string; newPrice: number }) {
    try {
      // Notify all users who shortlisted this property
      const shortlists = await this.prisma.shortlist.findMany({
        where: { propertyId: data.propertyId },
        select: { userId: true },
      });

      const notifications = shortlists.map((s) =>
        this.create(
          s.userId,
          NotificationType.PRICE_CHANGED,
          'Price Update',
          `A property in your shortlist has a new price: ৳${data.newPrice.toLocaleString()}`,
          { propertyId: data.propertyId, newPrice: data.newPrice },
        ),
      );

      await Promise.allSettled(notifications);
    } catch (e) {
      this.logger.error('Failed to send price change notifications', e);
    }
  }
}

// ─────────────────────────────────────────────
// Controller
// ─────────────────────────────────────────────

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all notifications for authenticated user' })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  findAll(
    @CurrentUser('id') userId: string,
    @Query('unreadOnly') unreadOnly?: boolean,
  ) {
    return this.notificationsService.findAll(userId, unreadOnly);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  unreadCount(@CurrentUser('id') userId: string) {
    return this.notificationsService.unreadCount(userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.notificationsService.markRead(id, userId);
  }

  @Patch('mark-all-read')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllRead(userId);
  }
}

// ─────────────────────────────────────────────
// Module
// ─────────────────────────────────────────────

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

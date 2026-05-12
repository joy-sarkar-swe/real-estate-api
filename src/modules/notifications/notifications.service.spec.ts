import { NotificationsService } from './notifications.module';
import { NotificationType } from '@prisma/client';

const mockPrisma = {
  notification: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
  shortlist: { findMany: jest.fn() },
};

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(() => {
    service = new (NotificationsService as any)(mockPrisma);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a notification', async () => {
      mockPrisma.notification.create.mockResolvedValue({ id: 'notif-1' });

      const result = await service.create(
        'user-1',
        NotificationType.VISIT_CONFIRMED,
        'Title',
        'Body',
      );

      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: NotificationType.VISIT_CONFIRMED,
          title: 'Title',
          body: 'Body',
          data: undefined,
        },
      });
    });
  });

  describe('findAll', () => {
    it('should return all notifications', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([{ id: 'n-1' }, { id: 'n-2' }]);

      const result = await service.findAll('user-1');

      expect(result).toHaveLength(2);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
    });

    it('should filter unread notifications', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([{ id: 'n-1', readAt: null }]);

      await service.findAll('user-1', true);

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', readAt: null },
        }),
      );
    });
  });

  describe('markRead', () => {
    it('should mark notification as read', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

      await service.markRead('notif-1', 'user-1');

      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: 'user-1' },
        data: { readAt: expect.any(Date) },
      });
    });
  });

  describe('markAllRead', () => {
    it('should mark all notifications as read', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });

      await service.markAllRead('user-1');

      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });
  });

  describe('unreadCount', () => {
    it('should return unread count', async () => {
      mockPrisma.notification.count.mockResolvedValue(3);

      const result = await service.unreadCount('user-1');

      expect(result).toEqual({ count: 3 });
    });
  });

  describe('event handlers', () => {
    it('should create notification on visit.booked', async () => {
      mockPrisma.notification.create.mockResolvedValue({ id: 'n-1' });

      await service.onVisitBooked({
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
        propertyId: 'prop-1',
        scheduledAt: new Date(),
        tenant: { firstName: 'John' },
        id: 'visit-1',
      });

      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'owner-1',
            type: NotificationType.VISIT_CONFIRMED,
          }),
        }),
      );
    });

    it('should notify shortlisted users on price change', async () => {
      mockPrisma.shortlist.findMany.mockResolvedValue([
        { userId: 'user-1' },
        { userId: 'user-2' },
      ]);
      mockPrisma.notification.create.mockResolvedValue({ id: 'n-1' });

      await service.onPriceChanged({ propertyId: 'prop-1', newPrice: 30000 });

      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(2);
    });
  });
});

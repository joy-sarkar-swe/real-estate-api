import { VisitsService } from './visits.service';
import {
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { VisitStatus } from '@prisma/client';

const mockProperty = {
  id: 'prop-1',
  ownerId: 'owner-1',
  deletedAt: null,
};

const futureDate = new Date(Date.now() + 86400000 * 3).toISOString(); // 3 days from now

const mockVisit = {
  id: 'visit-1',
  propertyId: 'prop-1',
  tenantId: 'tenant-1',
  ownerId: 'owner-1',
  scheduledAt: new Date(futureDate),
  status: VisitStatus.PENDING,
  idempotencyKey: 'idem-key-1',
  notes: null,
};

const mockPrisma = {
  visit: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  property: { findFirst: jest.fn() },
};

const mockEvents = { emit: jest.fn() };

describe('VisitsService', () => {
  let service: VisitsService;

  beforeEach(() => {
    service = new (VisitsService as any)(mockPrisma, mockEvents);
    jest.clearAllMocks();
  });

  // ── book ────────────────────────────────────────────────────────────

  describe('book', () => {
    const bookDto = {
      propertyId: 'prop-1',
      scheduledAt: futureDate,
      idempotencyKey: 'idem-key-new',
    };

    it('should return existing visit on duplicate idempotency key', async () => {
      mockPrisma.visit.findUnique.mockResolvedValue(mockVisit);

      const result = await service.book('tenant-1', bookDto as any);

      expect(result).toEqual(mockVisit);
      expect(mockPrisma.visit.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when property not found', async () => {
      mockPrisma.visit.findUnique.mockResolvedValue(null);
      mockPrisma.property.findFirst.mockResolvedValue(null);

      await expect(service.book('tenant-1', bookDto as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException on slot conflict', async () => {
      mockPrisma.visit.findUnique.mockResolvedValue(null);
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
      mockPrisma.visit.findFirst.mockResolvedValue(mockVisit); // slot taken

      await expect(service.book('tenant-1', bookDto as any)).rejects.toThrow(ConflictException);
    });

    it('should create visit when slot is free', async () => {
      mockPrisma.visit.findUnique.mockResolvedValue(null);
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
      mockPrisma.visit.findFirst.mockResolvedValue(null); // no conflict
      mockPrisma.visit.create.mockResolvedValue(mockVisit);

      const result = await service.book('tenant-1', bookDto as any);

      expect(result).toEqual(mockVisit);
      expect(mockPrisma.visit.create).toHaveBeenCalledTimes(1);
      expect(mockEvents.emit).toHaveBeenCalledWith('visit.booked', mockVisit);
    });

    it('should throw BadRequestException for past date', async () => {
      mockPrisma.visit.findUnique.mockResolvedValue(null);
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);

      const pastDate = new Date(Date.now() - 86400000).toISOString();
      await expect(
        service.book('tenant-1', { ...bookDto, scheduledAt: pastDate } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── cancel ──────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('should cancel a pending visit', async () => {
      mockPrisma.visit.findUnique.mockResolvedValue(mockVisit);
      mockPrisma.visit.update.mockResolvedValue({ ...mockVisit, status: VisitStatus.CANCELLED });

      const result = await service.cancel('visit-1', 'tenant-1', { reason: 'Schedule conflict' });

      expect(mockPrisma.visit.update).toHaveBeenCalledWith({
        where: { id: 'visit-1' },
        data: {
          status: VisitStatus.CANCELLED,
          cancelledAt: expect.any(Date),
          cancelReason: 'Schedule conflict',
        },
      });
      expect(mockEvents.emit).toHaveBeenCalledWith('visit.cancelled', expect.any(Object));
    });

    it('should throw BadRequestException if already cancelled', async () => {
      mockPrisma.visit.findUnique.mockResolvedValue({
        ...mockVisit,
        status: VisitStatus.CANCELLED,
      });

      await expect(service.cancel('visit-1', 'tenant-1', {})).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if not tenant or owner', async () => {
      mockPrisma.visit.findUnique.mockResolvedValue(mockVisit);

      await expect(service.cancel('visit-1', 'random-user', {})).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── confirm ─────────────────────────────────────────────────────────

  describe('confirm', () => {
    it('should confirm a pending visit', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue(mockVisit);
      mockPrisma.visit.update.mockResolvedValue({ ...mockVisit, status: VisitStatus.CONFIRMED });

      await service.confirm('visit-1', 'owner-1');

      expect(mockPrisma.visit.update).toHaveBeenCalledWith({
        where: { id: 'visit-1' },
        data: { status: VisitStatus.CONFIRMED },
      });
    });

    it('should throw NotFoundException if visit not found', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue(null);

      await expect(service.confirm('visit-1', 'owner-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if visit is not pending', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue({
        ...mockVisit,
        status: VisitStatus.CONFIRMED,
      });

      await expect(service.confirm('visit-1', 'owner-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ── getAvailableSlots ────────────────────────────────────────────────

  describe('getAvailableSlots', () => {
    it('should return 9 hourly slots from 09:00-17:00', async () => {
      mockPrisma.visit.findMany.mockResolvedValue([]);

      const result = await service.getAvailableSlots('prop-1', '2025-06-01');

      expect(result.slots).toHaveLength(9);
      expect(result.slots.every((s: any) => s.available)).toBe(true);
    });

    it('should mark booked slot as unavailable', async () => {
      const bookedTime = new Date('2025-06-01T10:00:00Z');
      mockPrisma.visit.findMany.mockResolvedValue([{ scheduledAt: bookedTime }]);

      const result = await service.getAvailableSlots('prop-1', '2025-06-01');
      const tenSlot = result.slots.find((s: any) => new Date(s.time).getUTCHours() === 10);

      expect(tenSlot?.available).toBe(false);
    });
  });
});

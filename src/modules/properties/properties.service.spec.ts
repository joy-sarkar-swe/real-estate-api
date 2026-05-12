import { Test, TestingModule } from '@nestjs/testing';
import { PropertiesService } from './properties.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PropertyStatus, UserRole } from '@prisma/client';

// ── Fixtures ───────────────────────────────────────────────────────────

const mockProperty = {
  id: 'prop-uuid-1',
  title: 'Test Apartment',
  description: 'A great place',
  price: '25000',
  bhkType: 'TWO_BHK',
  propertyType: 'APARTMENT',
  furnishingType: 'SEMI_FURNISHED',
  status: 'AVAILABLE',
  isVerified: false,
  address: 'Road 5, Gulshan',
  city: 'Dhaka',
  state: 'Dhaka Division',
  pincode: '1212',
  latitude: 23.79,
  longitude: 90.41,
  area: 1200,
  isPetFriendly: false,
  hasParking: true,
  availableFrom: new Date('2024-02-01'),
  amenities: ['WiFi', 'AC'],
  images: [],
  ownerId: 'owner-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const mockPrisma = {
  property: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  priceHistory: { create: jest.fn() },
  $transaction: jest.fn(),
};

const mockEvents = { emit: jest.fn() };

// ──────────────────────────────────────────────────────────────────────

describe('PropertiesService', () => {
  let service: PropertiesService;

  beforeEach(async () => {
    service = new (PropertiesService as any)(mockPrisma, mockEvents);
    jest.clearAllMocks();
  });

  // ── create ──────────────────────────────────────────────────────────

  describe('create', () => {
    const createDto = {
      title: 'New Apartment',
      description: 'Nice place',
      price: 30000,
      bhkType: 'TWO_BHK',
      propertyType: 'APARTMENT',
      furnishingType: 'FULLY_FURNISHED',
      address: 'Test Road',
      city: 'Dhaka',
      state: 'Dhaka',
      pincode: '1212',
      latitude: 23.7,
      longitude: 90.4,
      area: 1000,
      availableFrom: '2024-03-01',
      amenities: ['WiFi'],
      images: [],
    };

    it('should create a property and emit event', async () => {
      mockPrisma.property.create.mockResolvedValue({ ...mockProperty, ...createDto });

      const result = await service.create('owner-1', createDto as any);

      expect(result.title).toBe(createDto.title);
      expect(mockPrisma.property.create).toHaveBeenCalledTimes(1);
      expect(mockEvents.emit).toHaveBeenCalledWith('property.created', expect.any(Object));
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return property with relations', async () => {
      mockPrisma.property.findFirst.mockResolvedValue({
        ...mockProperty,
        owner: { id: 'owner-1', firstName: 'Rahim', lastName: 'Owner' },
        priceHistory: [],
        _count: { shortlists: 0, visits: 0 },
      });

      const result = await service.findOne('prop-uuid-1');

      expect(result.id).toBe('prop-uuid-1');
    });

    it('should throw NotFoundException when property not found', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ──────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update property when owner matches', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
      mockPrisma.property.update.mockResolvedValue({ ...mockProperty, title: 'Updated' });

      const result = await service.update(
        'prop-uuid-1',
        'owner-uuid-1',
        UserRole.OWNER,
        { title: 'Updated' } as any,
      );

      expect(result.title).toBe('Updated');
    });

    it('should allow admin to update any property', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
      mockPrisma.property.update.mockResolvedValue({ ...mockProperty, title: 'Admin Updated' });

      const result = await service.update(
        'prop-uuid-1',
        'different-user-id',
        UserRole.ADMIN,
        { title: 'Admin Updated' } as any,
      );

      expect(result.title).toBe('Admin Updated');
    });

    it('should throw ForbiddenException when non-owner updates', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);

      await expect(
        service.update('prop-uuid-1', 'other-user', UserRole.TENANT, { title: 'Hack' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should track price history when price changes', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty); // price: '25000'
      mockPrisma.priceHistory.create.mockResolvedValue({});
      mockPrisma.property.update.mockResolvedValue({ ...mockProperty, price: '30000' });

      await service.update('prop-uuid-1', 'owner-uuid-1', UserRole.OWNER, { price: 30000 } as any);

      expect(mockPrisma.priceHistory.create).toHaveBeenCalledWith({
        data: {
          propertyId: 'prop-uuid-1',
          oldPrice: mockProperty.price,
          newPrice: 30000,
        },
      });
      expect(mockEvents.emit).toHaveBeenCalledWith('property.price_changed', expect.any(Object));
    });
  });

  // ── remove ──────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should soft-delete property', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
      mockPrisma.property.update.mockResolvedValue({ ...mockProperty, deletedAt: new Date() });

      const result = await service.remove('prop-uuid-1', 'owner-uuid-1', UserRole.OWNER);

      expect(result.message).toContain('deleted');
      expect(mockPrisma.property.update).toHaveBeenCalledWith({
        where: { id: 'prop-uuid-1' },
        data: { deletedAt: expect.any(Date), status: PropertyStatus.INACTIVE },
      });
    });

    it('should throw ForbiddenException when non-owner deletes', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);

      await expect(
        service.remove('prop-uuid-1', 'hacker-id', UserRole.TENANT),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── verify ──────────────────────────────────────────────────────────

  describe('verify', () => {
    it('should mark property as verified', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
      mockPrisma.property.update.mockResolvedValue({ ...mockProperty, isVerified: true });

      const result = await service.verify('prop-uuid-1');

      expect(mockPrisma.property.update).toHaveBeenCalledWith({
        where: { id: 'prop-uuid-1' },
        data: { isVerified: true },
      });
    });
  });

  // ── search ──────────────────────────────────────────────────────────

  describe('search', () => {
    it('should return paginated results', async () => {
      mockPrisma.$transaction.mockResolvedValue([[mockProperty], 1]);

      const result = await service.search({ page: 1, limit: 20 } as any);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should apply city filter', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.search({ city: 'Dhaka', page: 1, limit: 20 } as any);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });
});

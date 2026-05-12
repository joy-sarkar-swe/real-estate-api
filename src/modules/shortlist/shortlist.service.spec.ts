import { ShortlistService } from './shortlist.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

const mockProperty = { id: 'prop-1', title: 'Test', deletedAt: null };

const mockPrisma = {
  property: { findFirst: jest.fn() },
  shortlist: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
};

describe('ShortlistService', () => {
  let service: ShortlistService;

  beforeEach(() => {
    service = new (ShortlistService as any)(mockPrisma);
    jest.clearAllMocks();
  });

  describe('add', () => {
    it('should add property to shortlist', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
      mockPrisma.shortlist.create.mockResolvedValue({ id: 'sl-1', userId: 'u-1', propertyId: 'prop-1' });

      const result = await service.add('u-1', 'prop-1');
      expect(result).toHaveProperty('id', 'sl-1');
    });

    it('should throw NotFoundException for unknown property', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(null);
      await expect(service.add('u-1', 'bad-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for duplicate shortlist', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
      mockPrisma.shortlist.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.add('u-1', 'prop-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should remove from shortlist', async () => {
      mockPrisma.shortlist.findUnique.mockResolvedValue({ id: 'sl-1' });
      mockPrisma.shortlist.delete.mockResolvedValue({});

      const result = await service.remove('u-1', 'prop-1');
      expect(result.message).toContain('Removed');
    });

    it('should throw NotFoundException when entry missing', async () => {
      mockPrisma.shortlist.findUnique.mockResolvedValue(null);
      await expect(service.remove('u-1', 'prop-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all shortlisted properties for user', async () => {
      mockPrisma.shortlist.findMany.mockResolvedValue([
        { id: 'sl-1', property: { id: 'prop-1', title: 'Test' } },
      ]);

      const result = await service.findAll('u-1');
      expect(result).toHaveLength(1);
    });
  });
});

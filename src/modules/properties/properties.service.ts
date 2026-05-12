import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, PropertyStatus, UserRole } from '@prisma/client';
import { CreatePropertyDto, UpdatePropertyDto } from './dto/property.dto';
import { SearchPropertyDto, SortField } from './dto/search.dto';
import { PaginatedResponse } from '../../shared/dto/pagination.dto';

/** Haversine formula constant for km-per-degree approximation */
const KM_PER_DEGREE = 111.32;

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── Create ───────────────────────────────────────────────────

  async create(ownerId: string, dto: CreatePropertyDto) {
    const property = await this.prisma.property.create({
      data: {
        ...dto,
        ownerId,
        price: dto.price,
        availableFrom: new Date(dto.availableFrom),
        amenities: dto.amenities ?? [],
        images: dto.images ?? [],
      },
      include: { owner: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    this.events.emit('property.created', property);
    this.logger.log(`Property created: ${property.id} by owner ${ownerId}`);
    return property;
  }

  // ─── Search ──────────────────────────────────────────────────

  async search(dto: SearchPropertyDto): Promise<PaginatedResponse<any>> {
    const {
      q, city, minPrice, maxPrice, bhkType, propertyType,
      furnishingType, isVerified, isPetFriendly, hasParking,
      lat, lng, radiusKm, sortBy, availableFrom,
      limit = 20, cursor,
    } = dto;

    const where: Prisma.PropertyWhereInput = {
      deletedAt: null,
      status: PropertyStatus.AVAILABLE,
    };

    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { address: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) (where.price as any).gte = minPrice;
      if (maxPrice !== undefined) (where.price as any).lte = maxPrice;
    }
    if (bhkType?.length) where.bhkType = { in: bhkType };
    if (propertyType?.length) where.propertyType = { in: propertyType };
    if (furnishingType?.length) where.furnishingType = { in: furnishingType };
    if (isVerified !== undefined) where.isVerified = isVerified;
    if (isPetFriendly !== undefined) where.isPetFriendly = isPetFriendly;
    if (hasParking !== undefined) where.hasParking = hasParking;
    if (availableFrom) where.availableFrom = { lte: new Date(availableFrom) };

    // Geo bounding box filter (fast index hit before haversine post-filter)
    if (lat !== undefined && lng !== undefined && radiusKm !== undefined) {
      const latDelta = radiusKm / KM_PER_DEGREE;
      const lngDelta = radiusKm / (KM_PER_DEGREE * Math.cos((lat * Math.PI) / 180));
      where.latitude = { gte: lat - latDelta, lte: lat + latDelta };
      where.longitude = { gte: lng - lngDelta, lte: lng + lngDelta };
    }

    // Cursor-based pagination
    const cursorClause = cursor ? { id: cursor } : undefined;

    // Sort order
    let orderBy: Prisma.PropertyOrderByWithRelationInput = { createdAt: 'desc' };
    if (sortBy === SortField.PRICE_ASC) orderBy = { price: 'asc' };
    else if (sortBy === SortField.PRICE_DESC) orderBy = { price: 'desc' };
    else if (sortBy === SortField.RECENCY) orderBy = { createdAt: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        orderBy,
        take: limit + 1,
        ...(cursorClause ? { cursor: cursorClause, skip: 1 } : {}),
        select: {
          id: true,
          title: true,
          price: true,
          bhkType: true,
          propertyType: true,
          furnishingType: true,
          city: true,
          address: true,
          latitude: true,
          longitude: true,
          area: true,
          isVerified: true,
          isPetFriendly: true,
          hasParking: true,
          status: true,
          images: true,
          createdAt: true,
          owner: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.property.count({ where }),
    ]);

    // Precise haversine filter after bounding box (for distance sort too)
    let filtered = items;
    if (lat !== undefined && lng !== undefined && radiusKm !== undefined) {
      filtered = items.filter((p) => {
        const d = this.haversineKm(lat, lng, p.latitude, p.longitude);
        (p as any).distanceKm = Math.round(d * 10) / 10;
        return d <= radiusKm;
      });
      if (sortBy === SortField.DISTANCE) {
        filtered.sort((a, b) => (a as any).distanceKm - (b as any).distanceKm);
      }
    }

    const hasMore = filtered.length > limit;
    const data = hasMore ? filtered.slice(0, limit) : filtered;
    const nextCursor = hasMore ? data[data.length - 1].id : undefined;

    return new PaginatedResponse(data, total, dto, nextCursor);
  }

  // ─── Find One ─────────────────────────────────────────────────

  async findOne(id: string) {
    const property = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, phone: true, email: true },
        },
        priceHistory: { orderBy: { changedAt: 'desc' }, take: 10 },
        _count: { select: { shortlists: true, visits: true } },
      },
    });

    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  // ─── Update ───────────────────────────────────────────────────

  async update(id: string, userId: string, userRole: UserRole, dto: UpdatePropertyDto) {
    const property = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
    });

    if (!property) throw new NotFoundException('Property not found');
    if (property.ownerId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You do not own this property');
    }

    // Track price change
    if (dto.price !== undefined && Number(property.price) !== dto.price) {
      await this.prisma.priceHistory.create({
        data: {
          propertyId: id,
          oldPrice: property.price,
          newPrice: dto.price,
        },
      });
      this.events.emit('property.price_changed', { propertyId: id, newPrice: dto.price });
    }

    const updated = await this.prisma.property.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.availableFrom ? { availableFrom: new Date(dto.availableFrom) } : {}),
      },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    this.events.emit('property.updated', updated);
    return updated;
  }

  // ─── Delete (Soft) ────────────────────────────────────────────

  async remove(id: string, userId: string, userRole: UserRole) {
    const property = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
    });

    if (!property) throw new NotFoundException('Property not found');
    if (property.ownerId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You do not own this property');
    }

    await this.prisma.property.update({
      where: { id },
      data: { deletedAt: new Date(), status: PropertyStatus.INACTIVE },
    });

    this.events.emit('property.deleted', { propertyId: id });
    return { message: 'Property deleted successfully' };
  }

  // ─── Owner's properties ───────────────────────────────────────

  async findByOwner(ownerId: string) {
    return this.prisma.property.findMany({
      where: { ownerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { visits: true, shortlists: true } } },
    });
  }

  // ─── Admin: verify ────────────────────────────────────────────

  async verify(id: string) {
    const property = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
    });
    if (!property) throw new NotFoundException('Property not found');

    return this.prisma.property.update({
      where: { id },
      data: { isVerified: true },
    });
  }

  // ─── Haversine distance helper ────────────────────────────────

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

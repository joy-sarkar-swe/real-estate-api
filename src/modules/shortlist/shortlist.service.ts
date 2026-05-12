import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ShortlistService {
  constructor(private readonly prisma: PrismaService) {}

  async add(userId: string, propertyId: string) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null },
    });
    if (!property) throw new NotFoundException('Property not found');

    try {
      return await this.prisma.shortlist.create({
        data: { userId, propertyId },
        include: {
          property: {
            select: { id: true, title: true, price: true, images: true, city: true },
          },
        },
      });
    } catch {
      throw new ConflictException('Property already in shortlist');
    }
  }

  async remove(userId: string, propertyId: string) {
    const entry = await this.prisma.shortlist.findUnique({
      where: { userId_propertyId: { userId, propertyId } },
    });
    if (!entry) throw new NotFoundException('Shortlist entry not found');

    await this.prisma.shortlist.delete({
      where: { userId_propertyId: { userId, propertyId } },
    });
    return { message: 'Removed from shortlist' };
  }

  async findAll(userId: string) {
    return this.prisma.shortlist.findMany({
      where: { userId },
      include: {
        property: {
          select: {
            id: true, title: true, price: true, images: true,
            city: true, bhkType: true, isVerified: true, status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

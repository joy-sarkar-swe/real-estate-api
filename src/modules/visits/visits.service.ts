import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { VisitStatus } from '@prisma/client';
import { BookVisitDto, CancelVisitDto, RescheduleVisitDto } from './dto/visit.dto';
import dayjs from 'dayjs';

const SLOT_DURATION_MINUTES = 60;

@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async book(tenantId: string, dto: BookVisitDto) {
    const db = this.prisma as any;
    const existing = await db.visit.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) return existing;

    const property = await db.property.findFirst({ where: { id: dto.propertyId, deletedAt: null } });
    if (!property) throw new NotFoundException('Property not found');

    const scheduledAt = new Date(dto.scheduledAt);
    if (dayjs(scheduledAt).isBefore(dayjs())) {
      throw new BadRequestException('Cannot book a visit in the past');
    }

    const slotStart = dayjs(scheduledAt).subtract(SLOT_DURATION_MINUTES, 'minute').toDate();
    const slotEnd = dayjs(scheduledAt).add(SLOT_DURATION_MINUTES, 'minute').toDate();

    const conflict = await db.visit.findFirst({
      where: {
        propertyId: dto.propertyId,
        status: { notIn: [VisitStatus.CANCELLED] },
        scheduledAt: { gte: slotStart, lte: slotEnd },
      },
    });
    if (conflict) throw new ConflictException('This time slot is already booked. Please choose another time.');

    const visit = await db.visit.create({
      data: {
        propertyId: dto.propertyId,
        tenantId,
        ownerId: property.ownerId,
        scheduledAt,
        notes: dto.notes,
        idempotencyKey: dto.idempotencyKey,
        status: VisitStatus.PENDING,
      },
      include: {
        property: { select: { id: true, title: true, address: true } },
        tenant: { select: { id: true, firstName: true, lastName: true, email: true } },
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    this.events.emit('visit.booked', visit);
    this.logger.log(`Visit booked: ${visit.id}`);
    return visit;
  }

  async getAvailableSlots(propertyId: string, date: string) {
    const db = this.prisma as any;
    const day = dayjs(date);
    const start = day.startOf('day').toDate();
    const end = day.endOf('day').toDate();

    const booked = await db.visit.findMany({
      where: { propertyId, status: { notIn: [VisitStatus.CANCELLED] }, scheduledAt: { gte: start, lte: end } },
      select: { scheduledAt: true },
    });

    const slots: { time: string; available: boolean }[] = [];
    for (let hour = 9; hour < 18; hour++) {
      const slotTime = day.hour(hour).minute(0).second(0);
      const isBooked = booked.some((b: any) =>
        Math.abs(dayjs(b.scheduledAt).diff(slotTime, 'minute')) < SLOT_DURATION_MINUTES,
      );
      slots.push({ time: slotTime.toISOString(), available: !isBooked });
    }

    return { date, slots };
  }

  async cancel(id: string, userId: string, dto: CancelVisitDto) {
    const visit = await this.findAndVerifyAccess(id, userId);
    if (visit.status === VisitStatus.CANCELLED) throw new BadRequestException('Visit is already cancelled');
    if (visit.status === VisitStatus.COMPLETED) throw new BadRequestException('Cannot cancel a completed visit');

    const updated = await (this.prisma as any).visit.update({
      where: { id },
      data: { status: VisitStatus.CANCELLED, cancelledAt: new Date(), cancelReason: dto.reason },
    });

    this.events.emit('visit.cancelled', updated);
    return updated;
  }

  async reschedule(id: string, userId: string, dto: RescheduleVisitDto) {
    const visit = await this.findAndVerifyAccess(id, userId);
    if ([VisitStatus.CANCELLED, VisitStatus.COMPLETED].includes(visit.status)) {
      throw new BadRequestException('Cannot reschedule this visit');
    }

    const scheduledAt = new Date(dto.scheduledAt);
    if (dayjs(scheduledAt).isBefore(dayjs())) throw new BadRequestException('Cannot schedule a visit in the past');

    const updated = await (this.prisma as any).visit.update({
      where: { id },
      data: { scheduledAt, status: VisitStatus.PENDING },
    });

    this.events.emit('visit.rescheduled', updated);
    return updated;
  }

  async findMyVisits(tenantId: string) {
    return (this.prisma as any).visit.findMany({
      where: { tenantId },
      orderBy: { scheduledAt: 'desc' },
      include: { property: { select: { id: true, title: true, address: true, images: true } } },
    });
  }

  async findOwnerVisits(ownerId: string) {
    return (this.prisma as any).visit.findMany({
      where: { ownerId },
      orderBy: { scheduledAt: 'desc' },
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true, phone: true } },
        property: { select: { id: true, title: true } },
      },
    });
  }

  async confirm(id: string, ownerId: string) {
    const db = this.prisma as any;
    const visit = await db.visit.findFirst({ where: { id, ownerId } });
    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.status !== VisitStatus.PENDING) throw new BadRequestException('Only pending visits can be confirmed');
    return db.visit.update({ where: { id }, data: { status: VisitStatus.CONFIRMED } });
  }

  private async findAndVerifyAccess(id: string, userId: string) {
    const visit = await (this.prisma as any).visit.findUnique({ where: { id } });
    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.tenantId !== userId && visit.ownerId !== userId) throw new ForbiddenException('Access denied');
    return visit;
  }
}

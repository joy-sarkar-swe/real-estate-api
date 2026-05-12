import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { VisitsService } from './visits.service';
import { BookVisitDto, CancelVisitDto, RescheduleVisitDto } from './dto/visit.dto';
import { CurrentUser, Roles } from '../../common';

@ApiTags('Visits')
@ApiBearerAuth()
@Controller('visits')
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Post()
  @Roles(UserRole.TENANT)
  @ApiOperation({ summary: 'Book a property visit (Tenant only)' })
  @ApiResponse({ status: 201, description: 'Visit booked' })
  @ApiResponse({ status: 409, description: 'Time slot conflict' })
  book(
    @CurrentUser('id') tenantId: string,
    @Body() dto: BookVisitDto,
  ) {
    return this.visitsService.book(tenantId, dto);
  }

  @Get('available-slots')
  @ApiOperation({ summary: 'Get available visit slots for a property on a date' })
  @ApiQuery({ name: 'propertyId', type: String })
  @ApiQuery({ name: 'date', type: String, example: '2024-02-15' })
  getAvailableSlots(
    @Query('propertyId', ParseUUIDPipe) propertyId: string,
    @Query('date') date: string,
  ) {
    return this.visitsService.getAvailableSlots(propertyId, date);
  }

  @Get('my-visits')
  @Roles(UserRole.TENANT)
  @ApiOperation({ summary: 'Get all visits for authenticated tenant' })
  findMyVisits(@CurrentUser('id') tenantId: string) {
    return this.visitsService.findMyVisits(tenantId);
  }

  @Get('owner-visits')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all visits for authenticated owner' })
  findOwnerVisits(@CurrentUser('id') ownerId: string) {
    return this.visitsService.findOwnerVisits(ownerId);
  }

  @Patch(':id/confirm')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Confirm a visit (Owner only)' })
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') ownerId: string,
  ) {
    return this.visitsService.confirm(id, ownerId);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a visit' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CancelVisitDto,
  ) {
    return this.visitsService.cancel(id, userId, dto);
  }

  @Patch(':id/reschedule')
  @Roles(UserRole.TENANT)
  @ApiOperation({ summary: 'Reschedule a visit (Tenant only)' })
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RescheduleVisitDto,
  ) {
    return this.visitsService.reschedule(id, userId, dto);
  }
}

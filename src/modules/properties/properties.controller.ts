import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
  ApiParam,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto, UpdatePropertyDto } from './dto/property.dto';
import { SearchPropertyDto } from './dto/search.dto';
import { CurrentUser, Public, Roles } from '../../common';

@ApiTags('Properties')
@ApiBearerAuth()
@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new property listing (Owner only)' })
  @ApiResponse({ status: 201, description: 'Property created' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePropertyDto,
  ) {
    return this.propertiesService.create(userId, dto);
  }

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Advanced property search with filters' })
  @ApiResponse({ status: 200, description: 'Paginated property results' })
  search(@Query() dto: SearchPropertyDto) {
    return this.propertiesService.search(dto);
  }

  @Get('my-listings')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all properties by the authenticated owner' })
  getMyListings(@CurrentUser('id') ownerId: string) {
    return this.propertiesService.findByOwner(ownerId);
  }

  @Public()
  @Get(':id')
  @ApiParam({ name: 'id', type: String })
  @ApiOperation({ summary: 'Get a single property by ID' })
  @ApiResponse({ status: 200, description: 'Property details' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.propertiesService.findOne(id);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', type: String })
  @ApiOperation({ summary: 'Update property details (Owner/Admin)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
    @Body() dto: UpdatePropertyDto,
  ) {
    return this.propertiesService.update(id, userId, userRole, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String })
  @ApiOperation({ summary: 'Soft-delete a property (Owner/Admin)' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.propertiesService.remove(id, userId, userRole);
  }

  @Patch(':id/verify')
  @Roles(UserRole.ADMIN)
  @ApiParam({ name: 'id', type: String })
  @ApiOperation({ summary: 'Verify a property (Admin only)' })
  verify(@Param('id', ParseUUIDPipe) id: string) {
    return this.propertiesService.verify(id);
  }
}

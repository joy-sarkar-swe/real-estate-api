import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ShortlistService } from './shortlist.service';
import { CurrentUser } from '../../common';

@ApiTags('Shortlist')
@ApiBearerAuth()
@Controller('shortlist')
export class ShortlistController {
  constructor(private readonly shortlistService: ShortlistService) {}

  @Get()
  @ApiOperation({ summary: 'Get all shortlisted properties' })
  findAll(@CurrentUser('id') userId: string) {
    return this.shortlistService.findAll(userId);
  }

  @Post(':propertyId')
  @ApiOperation({ summary: 'Add a property to shortlist' })
  add(
    @CurrentUser('id') userId: string,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
  ) {
    return this.shortlistService.add(userId, propertyId);
  }

  @Delete(':propertyId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a property from shortlist' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
  ) {
    return this.shortlistService.remove(userId, propertyId);
  }
}

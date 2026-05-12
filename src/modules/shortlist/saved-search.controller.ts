import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SavedSearchService, CreateSavedSearchDto } from './saved-search.service';
import { CurrentUser } from '../../common';

@ApiTags('Saved Searches')
@ApiBearerAuth()
@Controller('saved-searches')
export class SavedSearchController {
  constructor(private readonly savedSearchService: SavedSearchService) {}

  @Post()
  @ApiOperation({ summary: 'Save a search with filters for alerts' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSavedSearchDto,
  ) {
    return this.savedSearchService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all saved searches' })
  findAll(@CurrentUser('id') userId: string) {
    return this.savedSearchService.findAll(userId);
  }

  @Patch(':id/toggle-alert')
  @ApiOperation({ summary: 'Toggle alert on/off for a saved search' })
  toggleAlert(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.savedSearchService.toggleAlert(id, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a saved search' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.savedSearchService.remove(id, userId);
  }
}

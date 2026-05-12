import { Module } from '@nestjs/common';
import { ShortlistService } from './shortlist.service';
import { ShortlistController } from './shortlist.controller';
import { SavedSearchService } from './saved-search.service';
import { SavedSearchController } from './saved-search.controller';

@Module({
  controllers: [ShortlistController, SavedSearchController],
  providers: [ShortlistService, SavedSearchService],
})
export class ShortlistModule {}

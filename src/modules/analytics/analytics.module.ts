import { Module } from '@nestjs/common';
import { AnalyticsService, AnalyticsController } from './analytics.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}

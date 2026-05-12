import { Module } from '@nestjs/common';
import { UsersService, UsersController } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

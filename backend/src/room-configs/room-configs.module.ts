import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RoomConfigsController } from './room-configs.controller';
import { RoomConfigsService } from './room-configs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [RoomConfigsController],
  providers: [RoomConfigsService, JwtAuthGuard, RolesGuard],
  exports: [RoomConfigsService],
})
export class RoomConfigsModule {}

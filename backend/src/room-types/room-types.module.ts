import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RoomTypesController } from './room-types.controller';
import { RoomTypesService } from './room-types.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [RoomTypesController],
  providers: [RoomTypesService, JwtAuthGuard, RolesGuard],
  exports: [RoomTypesService],
})
export class RoomTypesModule {}

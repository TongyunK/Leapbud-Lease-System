import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [RoomsController],
  providers: [RoomsService, JwtAuthGuard, RolesGuard],
  exports: [RoomsService],
})
export class RoomsModule {}

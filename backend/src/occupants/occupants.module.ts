import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OccupantsController } from './occupants.controller';
import { OccupantsService } from './occupants.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [OccupantsController],
  providers: [OccupantsService, JwtAuthGuard, RolesGuard],
  exports: [OccupantsService],
})
export class OccupantsModule {}

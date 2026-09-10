import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MenusController } from './menus.controller';
import { MenusService } from './menus.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [MenusController],
  providers: [MenusService, JwtAuthGuard, RolesGuard],
  exports: [MenusService],
})
export class MenusModule {}

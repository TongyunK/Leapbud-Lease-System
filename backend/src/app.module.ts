import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { BuildingsModule } from './buildings/buildings.module';
import { RoomsModule } from './rooms/rooms.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RoomConfigsModule } from './room-configs/room-configs.module';
import { RoomTypesModule } from './room-types/room-types.module';
import { CustomerSourcesModule } from './customer-sources/customer-sources.module';
import { CustomersModule } from './customers/customers.module';
import { OccupantsModule } from './occupants/occupants.module';
import { RolesModule } from './roles/roles.module';
import { MenusModule } from './menus/menus.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    BuildingsModule,
    RoomsModule,
    RoomConfigsModule,
    RoomTypesModule,
    CustomerSourcesModule,
    CustomersModule,
    OccupantsModule,
    RolesModule,
    MenusModule,
  ],
})
export class AppModule {}

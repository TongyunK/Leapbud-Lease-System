import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { BuildingAccessModule } from './building-access/building-access.module';
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
import { CustomerRequirementsModule } from './customer-requirements/customer-requirements.module';
import { ContractsModule } from './contracts/contracts.module';
import { ContractConfigsModule } from './contract-configs/contract-configs.module';
import { ContractPeriodsModule } from './contract-periods/contract-periods.module';
import { LeaseTerminationsModule } from './lease-terminations/lease-terminations.module';
import { ContractOtherFeesModule } from './contract-other-fees/contract-other-fees.module';
import { DepositRefundsModule } from './deposit-refunds/deposit-refunds.module';
import { InvoicesModule } from './invoices/invoices.module';
import { InvoiceServiceDetailsModule } from './invoice-service-details/invoice-service-details.module';
import { ReceivablesModule } from './receivables/receivables.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { DocumentTemplatesModule } from './document-templates/document-templates.module';
import { NumberingRulesModule } from './numbering-rules/numbering-rules.module';
import { PermissionsModule } from './permissions/permissions.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    BuildingAccessModule,
    HealthModule,
    AuthModule,
    PermissionsModule,
    UploadsModule,
    UsersModule,
    BuildingsModule,
    RoomsModule,
    RoomConfigsModule,
    RoomTypesModule,
    CustomerSourcesModule,
    CustomersModule,
    OccupantsModule,
    CustomerRequirementsModule,
    ContractsModule,
    ContractConfigsModule,
    ContractPeriodsModule,
    LeaseTerminationsModule,
    ContractOtherFeesModule,
    DepositRefundsModule,
    InvoicesModule,
    InvoiceServiceDetailsModule,
    ReceivablesModule,
    ReceiptsModule,
    DocumentTemplatesModule,
    NumberingRulesModule,
    RolesModule,
    MenusModule,
  ],
})
export class AppModule {}

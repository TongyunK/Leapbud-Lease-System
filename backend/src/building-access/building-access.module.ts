import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BuildingAccessService } from './building-access.service';
import { BuildingContextInterceptor } from './building-context.interceptor';

@Global()
@Module({
  providers: [
    BuildingAccessService,
    { provide: APP_INTERCEPTOR, useClass: BuildingContextInterceptor },
  ],
  exports: [BuildingAccessService],
})
export class BuildingAccessModule {}

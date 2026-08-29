import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { OwnersModule } from '../owners/owners.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PropertiesModule } from '../properties/properties.module';
import { StaffModule } from '../staff/staff.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

/**
 * Exports own no data. Every entity is read through the module that already
 * owns it, so a filter or a tenant rule is defined in exactly one place.
 */
@Module({
  imports: [
    OwnersModule,
    PropertiesModule,
    StaffModule,
    SubscriptionsModule,
    BillingModule,
    AuditModule,
    PermissionsModule,
  ],
  controllers: [ExportController],
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}

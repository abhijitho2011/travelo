import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { PropertyConfigService } from './property-config.service';
import { StaffPropertyConfigController } from './staff-property-config.controller';

/**
 * Property configuration — settings, taxes, policies, add-ons, booking
 * sources. Exported so the folio (tax), reservations (holds, policies) and the
 * booking engine (branding, slug) read the same rows through one service.
 */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule, AuditModule],
  controllers: [StaffPropertyConfigController],
  providers: [PropertyConfigService],
  exports: [PropertyConfigService],
})
export class PropertyConfigModule {}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { DirectBillingService } from './direct-billing.service';
import { StaffDirectBillingController } from './staff-direct-billing.controller';

@Module({
  imports: [JwtModule.register({}), SharedAuthModule, AuditModule],
  controllers: [StaffDirectBillingController],
  providers: [DirectBillingService],
  exports: [DirectBillingService],
})
export class DirectBillingModule {}

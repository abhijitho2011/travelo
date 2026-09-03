import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { CashService } from './cash.service';
import { StaffCashController } from './staff-cash.controller';

@Module({
  imports: [JwtModule.register({}), SharedAuthModule, AuditModule],
  controllers: [StaffCashController],
  providers: [CashService],
  exports: [CashService],
})
export class CashModule {}

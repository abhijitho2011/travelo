import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import { StaffAccountsController } from './staff-accounts.controller';
import { ExpensesService } from './expenses.service';
import { AccountsSummaryService } from './accounts-summary.service';

/**
 * Accounts — one staff surface under `/api/v1/staff/accounts/*`: the finance
 * summary and the expense register. Reservations and restaurant orders are read
 * (never written) for the revenue rollup.
 */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule],
  controllers: [StaffAccountsController],
  providers: [ExpensesService, AccountsSummaryService, StaffJwtGuard, StaffPermissionsGuard],
  exports: [ExpensesService, AccountsSummaryService],
})
export class AccountsModule {}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { AuditService } from '../audit/audit.service';
import { ExpensesService } from './expenses.service';
import { AccountsSummaryService } from './accounts-summary.service';
import { CreateExpenseDto, ExpenseFilterDto, ExpenseStatusDto, UpdateExpenseDto } from './dto';

/**
 * Accounts, per property. The summary is the read-heavy finance view (revenue
 * rolled up read-only from reservations and restaurant orders); the expense
 * register is the one place accounts writes. Every route resolves against the
 * caller's own propertyId, so a foreign id 404s.
 */
@ApiTags('Staff Accounts')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/accounts', version: VERSION_NEUTRAL })
export class StaffAccountsController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly summarySvc: AccountsSummaryService,
    private readonly audit: AuditService,
  ) {}

  @Get('summary')
  @RequireStaffPermissions('finance.read')
  summary(@CurrentStaff() me: AuthenticatedStaff) {
    return this.summarySvc.summary(me.propertyId);
  }

  // ---------- Expenses ----------

  @Get('expenses')
  @RequireStaffPermissions('expense.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query() q: ExpenseFilterDto) {
    return this.expenses.list(me.propertyId, q);
  }

  @Get('expenses/:id')
  @RequireStaffPermissions('expense.read')
  get(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.expenses.get(me.propertyId, id);
  }

  @Post('expenses')
  @RequireStaffPermissions('expense.create')
  async create(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateExpenseDto) {
    const row = await this.expenses.create(me.propertyId, dto, me.id);
    await this.audit.record({
      action: 'staff.accounts.expense.created',
      entity: 'expense',
      entityId: row.id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Patch('expenses/:id')
  @RequireStaffPermissions('expense.update')
  async update(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    const { before, after } = await this.expenses.update(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.accounts.expense.updated',
      entity: 'expense',
      entityId: id,
      before,
      after,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }

  @Patch('expenses/:id/status')
  @RequireStaffPermissions('expense.update')
  async setStatus(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: ExpenseStatusDto,
  ) {
    const { before, after } = await this.expenses.setStatus(me.propertyId, id, dto.status);
    await this.audit.record({
      action: 'staff.accounts.expense.status_changed',
      entity: 'expense',
      entityId: id,
      before,
      after,
      reason: `${before.status} → ${after.status}`,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }

  @Delete('expenses/:id')
  @RequireStaffPermissions('expense.update')
  async remove(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const res = await this.expenses.remove(me.propertyId, id);
    await this.audit.record({
      action: 'staff.accounts.expense.deleted',
      entity: 'expense',
      entityId: id,
      before: res.before,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
  }
}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import { ApprovalsService } from './approvals.service';
import { AlertsService } from './alerts.service';
import {
  StaffApprovalsController,
  StaffAlertsController,
} from './staff-management.controller';

/**
 * The GM/AGM management surface: the approval queue (expenses + purchase orders)
 * and the dashboard alert strip. Both were expected by the staff app and are
 * built here in one place rather than scattered across accounts/inventory.
 */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule],
  controllers: [StaffApprovalsController, StaffAlertsController],
  providers: [ApprovalsService, AlertsService, StaffJwtGuard, StaffPermissionsGuard],
})
export class ManagementModule {}

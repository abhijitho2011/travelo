import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import {
  StaffSecurityGateController,
  StaffSecurityIncidentsController,
  StaffSecurityLostFoundController,
  StaffSecurityManagerController,
  StaffSecurityVisitorsController,
} from './staff-security.controller';
import { SecurityLogsService } from './logs.service';
import { IncidentsService } from './incidents.service';
import { SecurityShiftsService } from './shifts.service';

/**
 * Security — one module, one staff surface under `/api/v1/staff/security/*`.
 * Backs the already-shipped security STAFF screens (gate, visitors, incidents,
 * lost-&-found) and adds the MANAGER oversight (roster, dashboard, incident
 * assign/resolve) on top. Nothing here touches money.
 */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule],
  controllers: [
    StaffSecurityGateController,
    StaffSecurityVisitorsController,
    StaffSecurityLostFoundController,
    StaffSecurityIncidentsController,
    StaffSecurityManagerController,
  ],
  providers: [
    SecurityLogsService,
    IncidentsService,
    SecurityShiftsService,
    StaffJwtGuard,
    StaffPermissionsGuard,
  ],
  exports: [SecurityLogsService, IncidentsService, SecurityShiftsService],
})
export class SecurityModule {}

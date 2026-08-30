import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import { StaffSalesController } from './staff-sales.controller';
import { LeadsService } from './leads.service';

/**
 * Sales CRM — one staff surface under `/api/v1/staff/sales/*`: the pipeline
 * board, leads, stage moves and the activity timeline.
 */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule],
  controllers: [StaffSalesController],
  providers: [LeadsService, StaffJwtGuard, StaffPermissionsGuard],
  exports: [LeadsService],
})
export class SalesModule {}

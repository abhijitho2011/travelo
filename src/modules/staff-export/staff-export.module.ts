import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import { StaffExportService } from './staff-export.service';
import { StaffExportController } from './staff-export.controller';

@Module({
  imports: [JwtModule.register({}), SharedAuthModule],
  controllers: [StaffExportController],
  providers: [StaffExportService, StaffJwtGuard, StaffPermissionsGuard],
})
export class StaffExportModule {}

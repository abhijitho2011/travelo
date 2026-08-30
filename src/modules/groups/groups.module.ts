import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import { GroupsService } from './groups.service';
import { StaffGroupsController } from './staff-groups.controller';

/** Group bookings — a master that ties many reservations together. */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule],
  controllers: [StaffGroupsController],
  providers: [GroupsService, StaffJwtGuard, StaffPermissionsGuard],
})
export class GroupsModule {}

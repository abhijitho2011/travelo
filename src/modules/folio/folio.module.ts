import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import { FolioService } from './folio.service';
import { FolioListService } from './folio-list.service';
import { FolioReceiptService } from './folio-receipt.service';
import { StaffFoliosController } from './staff-folios.controller';

/**
 * The guest folio — the running bill for a stay. Exported so reservations
 * (checkout gate + receipt), restaurant and spa (ROOM_CHARGE posting) all read
 * and write exactly one folio implementation.
 *
 * Owns one staff surface of its own: /api/v1/staff/folios, the property-wide
 * list the cashier works from.
 */
@Module({
  imports: [JwtModule.register({}), SharedAuthModule],
  controllers: [StaffFoliosController],
  providers: [
    FolioService,
    FolioListService,
    FolioReceiptService,
    StaffJwtGuard,
    StaffPermissionsGuard,
  ],
  exports: [FolioService, FolioReceiptService],
})
export class FolioModule {}

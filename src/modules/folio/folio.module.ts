import { Module } from '@nestjs/common';
import { FolioService } from './folio.service';
import { FolioReceiptService } from './folio-receipt.service';

/**
 * The guest folio — the running bill for a stay. Exported so reservations
 * (checkout gate + receipt), restaurant and spa (ROOM_CHARGE posting) all read
 * and write exactly one folio implementation.
 */
@Module({
  providers: [FolioService, FolioReceiptService],
  exports: [FolioService, FolioReceiptService],
})
export class FolioModule {}

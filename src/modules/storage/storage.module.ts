import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * Global so any module that holds binaries (property photos, invoice
 * documents) can inject the same store without re-importing it.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}

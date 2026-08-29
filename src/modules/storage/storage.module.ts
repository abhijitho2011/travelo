import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * Global so any module that holds binaries (property photos, invoice
 * documents) can inject the same store without re-importing it.
 *
 * StorageService reads its configuration from `process.env` via a constructor
 * parameter (kept for unit-test injection). Nest's DI ignores default parameter
 * values and would try to resolve that parameter as a provider, so the service
 * is instantiated through an explicit factory instead of class auto-wiring.
 */
@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      useFactory: () => new StorageService(process.env),
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}

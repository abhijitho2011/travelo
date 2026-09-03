import { Module } from '@nestjs/common';
import { FolioModule } from '../folio/folio.module';
import { PropertyConfigModule } from '../property-config/property-config.module';
import { RatesModule } from '../rates/rates.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { RoomsModule } from '../rooms/rooms.module';
import { StorageModule } from '../storage/storage.module';
import { BookingEngineService } from './booking-engine.service';
import { PublicBookingController } from './public-booking.controller';

/** The hotel's own booking channel: hosted page + widget API. */
@Module({
  imports: [
    PropertyConfigModule,
    RoomsModule,
    ReservationsModule,
    RatesModule,
    FolioModule,
    StorageModule,
  ],
  controllers: [PublicBookingController],
  providers: [BookingEngineService],
})
export class BookingEngineModule {}

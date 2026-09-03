import { Body, Controller, Get, Param, Post, Query, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BookingEngineService } from './booking-engine.service';
import { PublicAvailabilityQueryDto, PublicReservationDto } from './dto';

/**
 * The public booking API. No guard: a guest is not a user. Scoped by slug,
 * rate-limited harder than the app, and every write lands as a hold the desk
 * confirms — a bot cannot fill a hotel with confirmed rooms.
 */
@ApiTags('Public Booking')
@Controller({ path: 'api/v1/public/booking', version: VERSION_NEUTRAL })
export class PublicBookingController {
  constructor(private readonly engine: BookingEngineService) {}

  @Get(':slug')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  page(@Param('slug') slug: string) {
    return this.engine.page(slug);
  }

  @Get(':slug/availability')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  availability(@Param('slug') slug: string, @Query() q: PublicAvailabilityQueryDto) {
    return this.engine.availability(slug, q);
  }

  @Post(':slug/reservations')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  book(@Param('slug') slug: string, @Body() dto: PublicReservationDto) {
    return this.engine.book(slug, dto);
  }
}

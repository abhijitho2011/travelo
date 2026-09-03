import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  properties,
  propertyPhotos,
  roomTypes,
  type PropertySettings,
} from '../../database/schema';
import { FolioService } from '../folio/folio.service';
import { PropertyConfigService } from '../property-config/property-config.service';
import { RatesService } from '../rates/rates.service';
import { DeskService } from '../reservations/desk.service';
import { assertDateOrder, nightsBetween } from '../reservations/reservation-rules';
import { ReservationsService } from '../reservations/reservations.service';
import { RoomTypePhotosService } from '../rooms/room-type-photos.service';
import { RoomTypesService } from '../rooms/room-types.service';
import { StorageService } from '../storage/storage.service';
import { PublicAvailabilityQueryDto, PublicReservationDto } from './dto';

/** How far ahead the public page may look or book. */
const MAX_ADVANCE_DAYS = 365;
const MAX_NIGHTS = 30;

/**
 * The hotel's own booking channel: a hosted page per property at its slug,
 * and the same API behind the embeddable widget.
 *
 * Everything here is scoped by the SLUG, never by an id a caller could guess,
 * and only a property that switched its page on resolves at all. Nothing
 * written here bypasses the booking rules: the reservation goes through the
 * same create() the desk uses, so the rates grid, restrictions and capacity
 * apply to a guest exactly as they apply to a receptionist.
 *
 * Payment is at the property (the platform gateways are for owners' Tavelo
 * subscriptions only), so a web booking is a hold the desk confirms.
 */
@Injectable()
export class BookingEngineService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: PropertyConfigService,
    private readonly roomTypes: RoomTypesService,
    private readonly photos: RoomTypePhotosService,
    private readonly desk: DeskService,
    private readonly rates: RatesService,
    private readonly reservations: ReservationsService,
    private readonly folio: FolioService,
    private readonly storage: StorageService,
  ) {}

  /** The property behind a slug, or a 404 that does not say whether it exists. */
  async resolve(slug: string): Promise<{ propertyId: string; settings: PropertySettings }> {
    const settings = await this.config.settingsBySlug(slug);
    if (!settings)
      throw new NotFoundException({
        error: 'BOOKING_PAGE_NOT_FOUND',
        message: 'No booking page here',
      });
    return { propertyId: settings.propertyId, settings };
  }

  /** What the page renders before dates are chosen: the hotel and its rooms. */
  async page(slug: string) {
    const { propertyId, settings } = await this.resolve(slug);
    const [prop] = await this.db
      .select({
        name: properties.name,
        city: properties.city,
        state: properties.state,
        starRating: properties.starRating,
        contact: properties.contact,
        address: properties.address,
      })
      .from(properties)
      .where(and(eq(properties.id, propertyId), isNull(properties.deletedAt)))
      .limit(1);
    if (!prop)
      throw new NotFoundException({
        error: 'BOOKING_PAGE_NOT_FOUND',
        message: 'No booking page here',
      });

    const coverRows = await this.db
      .select({ storageKey: propertyPhotos.storageKey })
      .from(propertyPhotos)
      .where(eq(propertyPhotos.propertyId, propertyId))
      .limit(6);
    const gallery = await Promise.all(
      coverRows.map((r) => this.storage.getSignedUrl(r.storageKey, 3600).catch(() => null)),
    );

    const types = await this.roomTypes.list(propertyId, { limit: 50 });
    const rooms = await Promise.all(
      types.items
        .filter((t) => t.status === 'ACTIVE')
        .map(async (t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          maxOccupancy: t.maxOccupancy,
          maxAdults: t.maxAdults,
          maxChildren: t.maxChildren,
          bedType: t.bedType,
          sizeValue: t.sizeValue,
          sizeUnit: t.sizeUnit,
          amenities: t.amenities,
          fromPricePaise: t.baseRate,
          photos: (await this.photos.list(propertyId, t.id)).map((p) => ({
            url: p.url,
            category: p.category,
          })),
        })),
    );

    const addons = (await this.config.listAddons(propertyId)).filter(
      (a) => a.isActive && a.sellOnline,
    );
    const policies = (await this.config.listPolicies(propertyId)).filter((p) => p.isActive);
    const brandLogoUrl = settings.brandLogoKey
      ? await this.storage.getSignedUrl(settings.brandLogoKey, 3600).catch(() => null)
      : null;

    return {
      slug,
      property: { ...prop, gallery: gallery.filter(Boolean) },
      branding: { color: settings.brandColor, logoUrl: brandLogoUrl },
      terms: settings.bookingTerms,
      checkinTime: settings.checkinTime,
      checkoutTime: settings.checkoutTime,
      currency: settings.currency,
      pricesIncludeTax: settings.pricesIncludeTax,
      paysAtProperty: true,
      holdExpiryMinutes: settings.holdExpiryMinutes,
      roomTypes: rooms,
      addons: addons.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        pricePaise: a.pricePaise,
        unit: a.unit,
      })),
      policies: policies.map((p) => ({
        kind: p.kind,
        name: p.name,
        description: p.description,
        isDefault: p.isDefault,
      })),
    };
  }

  /**
   * Rooms and prices for a stay. Per type: rooms left after caps and stop-
   * sells, the nightly prices, the total, and any restriction that would
   * refuse the stay — said up front, not at the last step.
   */
  async availability(slug: string, q: PublicAvailabilityQueryDto) {
    const { propertyId } = await this.resolve(slug);
    BookingEngineService.assertStay(q.checkIn, q.checkOut);
    const nights = nightsBetween(q.checkIn, q.checkOut);
    const base = await this.desk.availability(propertyId, {
      checkIn: q.checkIn,
      checkOut: q.checkOut,
    });
    const guests = (q.adults ?? 1) + (q.children ?? 0);

    const items = await Promise.all(
      base.items.map(async (t) => {
        const nightly = await this.rates.nightlyPrices(
          propertyId,
          t.roomTypeId,
          q.checkIn,
          q.checkOut,
        );
        const rules = await this.rates.dayRules(propertyId, t.roomTypeId, q.checkIn, q.checkOut);
        let restriction: string | null = null;
        try {
          ReservationsService.assertRules(
            [
              ...rules,
              ...(await this.rates.dayRules(propertyId, t.roomTypeId, q.checkOut, q.checkOut)),
            ],
            q.checkIn,
            q.checkOut,
          );
        } catch (err) {
          restriction =
            (err as { response?: { message?: string } }).response?.message ?? 'Not available';
        }
        // The lowest day cap across the stay bounds what can be sold.
        const caps = rules.map((r) => r.cap).filter((c): c is number => c != null);
        const capped = caps.length ? Math.min(...caps) : Number.POSITIVE_INFINITY;
        const available = Math.max(0, Math.min(t.availableRooms, capped));
        const totalPaise = nightly.reduce((s, n) => s + n.pricePaise, 0);
        return {
          roomTypeId: t.roomTypeId,
          name: t.name,
          maxOccupancy: t.maxOccupancy,
          fitsGuests: guests <= t.maxOccupancy,
          available,
          nights,
          nightly: nightly.map((n) => ({ date: n.date, pricePaise: n.pricePaise })),
          totalPaise,
          averageNightPaise: nights ? Math.round(totalPaise / nights) : 0,
          restriction,
          bookable: available > 0 && restriction === null && guests <= t.maxOccupancy,
        };
      }),
    );
    return { checkIn: q.checkIn, checkOut: q.checkOut, nights, items };
  }

  /**
   * Book. A hold when the property expires holds, otherwise confirmed — in
   * both cases through the desk's own create(), so every rule applies. Add-ons
   * are posted to the folio immediately so the guest's total is the folio's.
   */
  async book(slug: string, dto: PublicReservationDto) {
    const { propertyId, settings } = await this.resolve(slug);
    BookingEngineService.assertStay(dto.checkIn, dto.checkOut);
    const availability = await this.availability(slug, {
      checkIn: dto.checkIn,
      checkOut: dto.checkOut,
      adults: dto.adults,
      children: dto.children,
    });
    const chosen = availability.items.find((i) => i.roomTypeId === dto.roomTypeId);
    if (!chosen)
      throw new NotFoundException({
        error: 'ROOM_TYPE_NOT_FOUND',
        message: 'That room is not on sale',
      });
    if (!chosen.bookable) {
      throw new BadRequestException({
        error: 'NOT_BOOKABLE',
        message: chosen.restriction ?? 'No rooms left for those dates',
      });
    }

    if (dto.couponCode) {
      const pre = await this.config.redeemableCoupon(propertyId, dto.couponCode, {
        checkIn: dto.checkIn,
        nights: nightsBetween(dto.checkIn, dto.checkOut),
        subtotalPaise: chosen.totalPaise,
      });
      if (!pre.coupon || pre.reason) {
        throw new BadRequestException({
          error: 'COUPON_INVALID',
          message: pre.reason ?? 'That code is not valid',
        });
      }
    }
    const holds = (settings.holdExpiryMinutes ?? 0) > 0;
    const created = await this.reservations.create(
      propertyId,
      {
        roomTypeId: dto.roomTypeId,
        ratePlanId: dto.ratePlanId,
        guestName: dto.guestName,
        guestPhone: dto.guestPhone,
        guestEmail: dto.guestEmail,
        adults: dto.adults,
        children: dto.children ?? 0,
        checkIn: dto.checkIn,
        checkOut: dto.checkOut,
        source: 'BOOKING_ENGINE',
        notes: dto.notes,
        status: holds ? 'PENDING' : 'CONFIRMED',
        holdMinutes: holds ? settings.holdExpiryMinutes! : 0,
      },
      null,
    );

    // Add-ons post to the folio now, priced the way the catalogue says.
    const addons = dto.addons?.length ? await this.config.listAddons(propertyId) : [];
    for (const pick of dto.addons ?? []) {
      const a = addons.find((x) => x.id === pick.id && x.isActive && x.sellOnline);
      if (!a) continue;
      const qty = pick.quantity ?? 1;
      const nights = nightsBetween(dto.checkIn, dto.checkOut);
      const guests = dto.adults + (dto.children ?? 0);
      const units =
        a.unit === 'PER_NIGHT'
          ? nights
          : a.unit === 'PER_GUEST'
            ? guests
            : a.unit === 'PER_GUEST_NIGHT'
              ? nights * guests
              : 1;
      await this.folio.postCharge({
        reservationId: created.id,
        propertyId,
        kind: 'MISC',
        description: a.name,
        amountPaise: a.pricePaise * units * qty,
        quantity: qty,
        taxCategory: a.taxCategory as 'accommodation' | 'restaurant' | 'other',
        hsnCode: a.hsnCode,
        sourceType: 'ADDON',
        sourceId: `${created.id}:${a.id}`,
      });
    }

    // A coupon is a discount line on the folio, reasoned with its code, and
    // counted against the code's uses. An invalid code refuses the booking
    // rather than silently charging full price to a guest who expected less.
    if (dto.couponCode) {
      const nights = nightsBetween(dto.checkIn, dto.checkOut);
      const verdict = await this.config.redeemableCoupon(propertyId, dto.couponCode, {
        checkIn: dto.checkIn,
        nights,
        subtotalPaise: chosen.totalPaise,
      });
      if (!verdict.coupon || verdict.reason) {
        throw new BadRequestException({
          error: 'COUPON_INVALID',
          message: verdict.reason ?? 'That code is not valid',
        });
      }
      if (verdict.discountPaise > 0) {
        await this.folio.applyDiscount({
          reservationId: created.id,
          propertyId,
          amountPaise: verdict.discountPaise,
          reason: `Coupon ${verdict.coupon.code}`,
          actorStaffId: null,
        });
        await this.config.consumeCoupon(verdict.coupon.id);
      }
    }

    const summary = await this.folio.summary(created.id);
    return {
      reservationNumber: created.reservationNumber,
      status: created.status,
      holdExpiresAt: created.holdExpiresAt,
      checkIn: created.checkIn,
      checkOut: created.checkOut,
      nights: created.nights,
      roomTypeName: created.roomTypeName,
      guestName: created.guestName,
      subtotalPaise: summary.subtotalPaise,
      taxPaise: summary.taxPaise,
      totalPaise: summary.chargesPaise,
      paysAtProperty: true,
      checkinTime: settings.checkinTime,
    };
  }

  static assertStay(checkIn: string, checkOut: string): void {
    assertDateOrder(checkIn, checkOut);
    const today = new Date().toISOString().slice(0, 10);
    if (checkIn < today) throw new BadRequestException('Check-in cannot be in the past');
    const ahead = Math.round((Date.parse(checkIn) - Date.parse(today)) / 86_400_000);
    if (ahead > MAX_ADVANCE_DAYS)
      throw new BadRequestException(`Bookings open up to ${MAX_ADVANCE_DAYS} days ahead`);
    if (nightsBetween(checkIn, checkOut) > MAX_NIGHTS) {
      throw new BadRequestException(`Stays of up to ${MAX_NIGHTS} nights can be booked online`);
    }
  }
}

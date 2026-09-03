import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  pricingRules,
  propertySettings,
  rateInventoryDays,
  roomTypes,
  type PricingRule,
} from '../../database/schema';
import { RatesService } from '../rates/rates.service';
import { addDays, type IsoDate } from '../reservations/reservation-rules';

/** How far ahead a rule is applied on the grid. */
export const RULE_HORIZON_DAYS = 90;

export interface RuleRunResult {
  propertyId: string;
  roomTypes: number;
  rulesEvaluated: number;
  daysPriced: number;
  daysReverted: number;
  dryRun: boolean;
  /** Per day per type, for preview: what the engine would write and why. */
  plan: {
    roomTypeId: string;
    date: IsoDate;
    fromPaise: number;
    toPaise: number | null;
    ruleId: string | null;
    ruleName: string | null;
  }[];
}

/**
 * The revenue engine: applies a property's pricing rules to the rates grid.
 *
 * Runs on a schedule (hourly) and on demand. For every active room type and
 * every night in the horizon it takes the BASE price — the day's hand-set
 * price if a person typed one, else the seasonal override, else the room
 * type's rate — evaluates the enabled rules in priority order, and writes the
 * first match through RatesService.bulkUpdate tagged with the rule. A rule
 * never compounds on its own output: a day the engine priced earlier is
 * re-derived from the base every run, so switching a rule off auto-reverts
 * that day the next time the engine passes. A hand-typed price is never
 * overwritten by a rule — the person wins.
 *
 * Booking-time triggers (LENGTH_OF_STAY, ADVANCE_BOOKING) do not describe a
 * night, so they are evaluated at quote time by `quoteAdjustment`, not here.
 */
@Injectable()
export class RevenueEngineService {
  private readonly log = new Logger(RevenueEngineService.name);
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly rates: RatesService,
  ) {}

  async run(
    propertyId: string,
    opts: { roomTypeId?: string; days?: number; dryRun?: boolean } = {},
  ): Promise<RuleRunResult> {
    const days = Math.min(opts.days ?? RULE_HORIZON_DAYS, 400);
    const from = new Date().toISOString().slice(0, 10) as IsoDate;
    const to = addDays(from, days);

    const [settings] = await this.db
      .select({ floor: propertySettings.minRoomPricePaise })
      .from(propertySettings)
      .where(eq(propertySettings.propertyId, propertyId))
      .limit(1);
    const floor = settings?.floor ?? 0;

    const typeConds = [
      eq(roomTypes.propertyId, propertyId),
      isNull(roomTypes.deletedAt),
      eq(roomTypes.status, 'ACTIVE'),
    ];
    if (opts.roomTypeId) typeConds.push(eq(roomTypes.id, opts.roomTypeId));
    const types = await this.db
      .select({ id: roomTypes.id })
      .from(roomTypes)
      .where(and(...typeConds));
    if (types.length === 0)
      return {
        propertyId,
        roomTypes: 0,
        rulesEvaluated: 0,
        daysPriced: 0,
        daysReverted: 0,
        dryRun: !!opts.dryRun,
        plan: [],
      };
    const typeIds = types.map((t) => t.id);

    const rules = await this.db
      .select()
      .from(pricingRules)
      .where(
        and(
          eq(pricingRules.propertyId, propertyId),
          inArray(pricingRules.roomTypeId, typeIds),
          eq(pricingRules.enabled, true),
          isNull(pricingRules.deletedAt),
        ),
      );
    const nightRules = rules.filter(
      (r) => r.trigger !== 'LENGTH_OF_STAY' && r.trigger !== 'ADVANCE_BOOKING',
    );
    const byPriority = [...nightRules].sort((a, b) => b.priority - a.priority);

    const grid = await this.rates.grid(propertyId, from, to);
    const dayRows = await this.db
      .select()
      .from(rateInventoryDays)
      .where(
        and(
          eq(rateInventoryDays.propertyId, propertyId),
          inArray(rateInventoryDays.roomTypeId, typeIds),
          isNull(rateInventoryDays.ratePlanId),
        ),
      );

    const plan: RuleRunResult['plan'] = [];
    let priced = 0;
    let reverted = 0;

    for (const row of grid.roomTypes) {
      if (!typeIds.includes(row.id)) continue;
      const typeRules = byPriority.filter((r) => r.roomTypeId === row.id);
      for (const cell of row.days) {
        const day = dayRows.find((d) => d.roomTypeId === row.id && d.date === cell.date);
        const handTyped = day?.pricePaise != null && day.pricingRuleId == null;
        if (handTyped) continue; // the person wins

        // Base = what the day would be with no rule: override or room-type rate.
        const base =
          cell.priceSource === 'day'
            ? await this.baseWithoutRule(propertyId, row.id, cell.date)
            : cell.pricePaise;
        const match = typeRules.find((r) =>
          RevenueEngineService.matches(
            r,
            cell.date,
            cell.physical > 0 ? Math.round((cell.sold / cell.physical) * 100) : 0,
          ),
        );
        const target = match ? Math.max(floor, RevenueEngineService.apply(base, match)) : null;
        const current = day?.pricingRuleId ? day.pricePaise : null;

        if (match && target !== current) {
          plan.push({
            roomTypeId: row.id,
            date: cell.date,
            fromPaise: cell.pricePaise,
            toPaise: target,
            ruleId: match.id,
            ruleName: match.name ?? match.trigger,
          });
          if (!opts.dryRun) {
            await this.rates.bulkUpdate(propertyId, {
              roomTypeIds: [row.id],
              ranges: [{ from: cell.date, to: cell.date }],
              set: { pricePaise: target },
              actorKind: 'RULE',
              pricingRuleId: match.id,
            });
          }
          priced += 1;
        } else if (!match && day?.pricingRuleId) {
          // A rule priced this day and no rule matches now: auto-revert.
          plan.push({
            roomTypeId: row.id,
            date: cell.date,
            fromPaise: cell.pricePaise,
            toPaise: null,
            ruleId: null,
            ruleName: null,
          });
          if (!opts.dryRun) {
            await this.rates.bulkUpdate(propertyId, {
              roomTypeIds: [row.id],
              ranges: [{ from: cell.date, to: cell.date }],
              set: { pricePaise: null },
              actorKind: 'RULE',
            });
          }
          reverted += 1;
        }
      }
    }

    if (!opts.dryRun && rules.length) {
      await this.db
        .update(pricingRules)
        .set({ lastRunAt: new Date() })
        .where(
          inArray(
            pricingRules.id,
            rules.map((r) => r.id),
          ),
        );
    }
    if (priced || reverted)
      this.log.log(
        `Revenue rules for ${propertyId}: ${priced} priced, ${reverted} reverted${opts.dryRun ? ' (dry run)' : ''}`,
      );
    return {
      propertyId,
      roomTypes: typeIds.length,
      rulesEvaluated: nightRules.length,
      daysPriced: priced,
      daysReverted: reverted,
      dryRun: !!opts.dryRun,
      plan,
    };
  }

  /** The price a day would resolve to if the rule-written row were absent. */
  private async baseWithoutRule(
    propertyId: string,
    roomTypeId: string,
    date: IsoDate,
  ): Promise<number> {
    const [n] = await this.rates.nightlyPrices(propertyId, roomTypeId, date, addDays(date, 1));
    // nightlyPrices reads the day row first; when that row is the rule's own
    // price we need the layer below it, so ask for the override/base directly.
    if (n.source !== 'day') return n.pricePaise;
    const [type] = await this.db
      .select({ baseRate: roomTypes.baseRate })
      .from(roomTypes)
      .where(eq(roomTypes.id, roomTypeId))
      .limit(1);
    const overrides = await this.rates.list(propertyId);
    const ov = overrides.find(
      (o) => o.roomTypeId === roomTypeId && o.startDate <= date && o.endDate >= date,
    );
    return ov?.ratePaise ?? type?.baseRate ?? n.pricePaise;
  }

  /** Does a night-level rule apply to this date at this occupancy? Pure. */
  static matches(rule: PricingRule, date: IsoDate, occupancyPct: number): boolean {
    switch (rule.trigger) {
      case 'OCCUPANCY':
        return (
          RevenueEngineService.compare(occupancyPct, rule.comparator, rule.threshold ?? 0) &&
          RevenueEngineService.inRange(rule, date)
        );
      case 'DAY_OF_WEEK': {
        const iso = ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = Monday
        return iso === (rule.threshold ?? 0) && RevenueEngineService.inRange(rule, date);
      }
      case 'SEASON':
      case 'SPECIAL_DATE':
        return RevenueEngineService.inRange(rule, date, true);
      default:
        return false;
    }
  }

  private static inRange(rule: PricingRule, date: IsoDate, required = false): boolean {
    if (!rule.startDate && !rule.endDate) return !required;
    if (rule.startDate && date < rule.startDate) return false;
    if (rule.endDate && date > rule.endDate) return false;
    return true;
  }

  static compare(value: number, cmp: PricingRule['comparator'], threshold: number): boolean {
    switch (cmp) {
      case 'GT':
        return value > threshold;
      case 'GTE':
        return value >= threshold;
      case 'LT':
        return value < threshold;
      case 'LTE':
        return value <= threshold;
      default:
        return value === threshold;
    }
  }

  /** Basis points for PERCENT (may be negative), paise for FIXED. Never below zero. */
  static apply(
    basePaise: number,
    rule: Pick<PricingRule, 'adjustmentKind' | 'adjustmentValue'>,
  ): number {
    const next =
      rule.adjustmentKind === 'PERCENT'
        ? Math.round((basePaise * (10_000 + rule.adjustmentValue)) / 10_000)
        : basePaise + rule.adjustmentValue;
    return Math.max(0, next);
  }

  /**
   * Booking-time adjustment for one stay: the best-priority LENGTH_OF_STAY or
   * ADVANCE_BOOKING rule that matches, as basis points on the quote. Pure.
   */
  static quoteAdjustment(
    rules: PricingRule[],
    nights: number,
    daysAhead: number,
  ): PricingRule | null {
    const candidates = rules
      .filter(
        (r) => r.enabled && (r.trigger === 'LENGTH_OF_STAY' || r.trigger === 'ADVANCE_BOOKING'),
      )
      .filter((r) =>
        RevenueEngineService.compare(
          r.trigger === 'LENGTH_OF_STAY' ? nights : daysAhead,
          r.comparator,
          r.threshold ?? 0,
        ),
      )
      .sort((a, b) => b.priority - a.priority);
    return candidates[0] ?? null;
  }
}

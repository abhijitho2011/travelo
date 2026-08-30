import type { LeadStage } from '../../database/schema';
import { SalesErrors } from './sales-errors';

/**
 * The correctness core of the sales CRM: the pipeline state machine.
 *
 * A lead advances one stage at a time — LEAD → CONTACTED → PROPOSAL →
 * NEGOTIATION → CONFIRMED — and can drop to LOST from any active stage. CONFIRMED
 * (won) and LOST are terminal. PROPOSAL may jump straight to CONFIRMED because a
 * proposal is sometimes accepted on the spot without a negotiation round.
 *
 * Deliberately forward-only: moving a lost or won deal back into the pipeline is
 * a new lead, not a stage edit, so the funnel numbers stay honest.
 */
export const LEAD_STAGE_TRANSITIONS: Readonly<Record<LeadStage, readonly LeadStage[]>> = {
  LEAD: ['CONTACTED', 'LOST'],
  CONTACTED: ['PROPOSAL', 'LOST'],
  PROPOSAL: ['NEGOTIATION', 'CONFIRMED', 'LOST'],
  NEGOTIATION: ['CONFIRMED', 'LOST'],
  CONFIRMED: [],
  LOST: [],
};

export function canTransitionLead(from: LeadStage, to: LeadStage): boolean {
  return LEAD_STAGE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertLeadTransition(from: LeadStage, to: LeadStage): void {
  if (!canTransitionLead(from, to)) throw SalesErrors.invalidStageTransition(from, to);
}

/** Stages that count as won, for the conversion metric. */
export const WON_STAGES: readonly LeadStage[] = ['CONFIRMED'];

/** Stages a lead is still actively worked in (not won, not lost). */
export const OPEN_STAGES: readonly LeadStage[] = ['LEAD', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION'];

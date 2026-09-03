import { hotelStaffRoleValues, type HotelStaffRole } from '../../database/schema';

/**
 * Server-side source of truth for what each staff role may do.
 *
 * The mobile app renders its navigation from `/api/v1/staff/auth/me`, but it is
 * NEVER the authority: every protected endpoint re-checks the resolved list
 * through `StaffPermissionsGuard`, so a tampered client gains nothing.
 *
 * Naming follows the existing admin catalogue style — `<resource>.<action>`,
 * lower-case, dot-namespaced.
 *
 * Deliberate exclusions, applied throughout:
 *   - Security, housekeeping, kitchen, cleaning, driving and attendant roles
 *     receive NO `finance.*`, `revenue.*`, `payroll.*`, `payment.*`,
 *     `procurement.*` or `owner.*` permission. They see operational work, not
 *     the money or the hotel's ownership.
 *   - Only management (GM/AGM) and the finance-facing roles see revenue.
 *   - Only the GM sees payroll and owner information.
 */

/** Everything the General Manager can do — the widest staff-side surface. */
const GENERAL_MANAGER: readonly string[] = [
  // Oversight
  'approval.read',
  'approval.act',
  'reports.read',
  'reports.export',
  'audit.read',
  'dashboard.read',
  // Money (GM only, in full)
  'finance.read',
  'finance.export',
  'revenue.read',
  'payroll.read',
  'payment.read',
  'payment.collect',
  'payment.refund',
  'invoice.read',
  // The hotel's owner/organisation record
  'owner.read',
  // Team
  'staff.read',
  'staff.create',
  'staff.update',
  'staff.approve',
  'staff.delete',
  'staff.attendance.read',
  'staff.roster.update',
  // Front office
  'reservation.read',
  'reservation.create',
  'reservation.update',
  'reservation.cancel',
  'checkin.perform',
  'checkout.perform',
  // Management can work the desk end to end, key cards included. Not in
  // AGM_WITHHELD, so the AGM issues cards too.
  'keycard.issue',
  'guest.read',
  'guest.create',
  'guest.update',
  // The rooms/room-types foundation. Management owns the inventory: only GM and
  // AGM create, rename or retire a room or a room type. Operational roles get
  // `room.read` and, where they actually turn rooms over, `room.status.update`
  // — never `room.update`, which would let a room attendant renumber a floor.
  'roomtype.read',
  'roomtype.create',
  'roomtype.update',
  'roomtype.delete',
  // Property configuration: taxes, policies, add-ons, booking sources, the
  // folio format and the booking engine. Read is wide (the folio and booking
  // screens need it); update is management's alone — a cancellation policy or
  // a tax rate is not something the desk edits between check-ins.
  'property.settings.read',
  'property.settings.update',
  // The per-day rates & inventory grid. Read for anyone quoting a price;
  // update for management and revenue.
  'rates.read',
  'rates.update',
  // Discounts, tax exemptions, voids and price edits on a folio — the money
  // moves that need a name of their own beyond `folio.update`.
  'folio.adjust',
  // Assign, auto-allocate, swap, lock — placing bookings into rooms.
  'reservation.allocate',
  // Guest messaging and reviews.
  'conversation.read',
  'conversation.send',
  'review.read',
  'review.respond',
  'room.read',
  'room.create',
  'room.update',
  'room.delete',
  'room.status.update',
  'rate.read',
  'rate.update',
  // Operations
  'housekeeping.read',
  'housekeeping.assign',
  'maintenance.read',
  'maintenance.assign',
  'task.read',
  'task.create',
  'task.assign',
  'task.start',
  'task.complete',
  'task.inspect',
  // Maintenance work orders — management oversees the full lifecycle.
  'workorder.read',
  'workorder.accept',
  'workorder.start',
  'workorder.pause',
  'workorder.resume',
  'workorder.complete',
  'workorder.cancel',
  'inventory.read',
  'inventory.approve',
  'procurement.read',
  'procurement.approve',
  'vendor.read',
  // Outlets
  'restaurant.read',
  'spa.read',
  'event.read',
  'event.approve',
  // Safety
  'incident.read',
  'incident.create',
  'lostfound.read',
];

/**
 * The AGM shares the GM's portal but not the GM's reach: no data export, no
 * payroll, no owner record, and no irreversible team or spend actions.
 */
const AGM_WITHHELD = new Set<string>([
  'finance.export',
  'reports.export',
  'payroll.read',
  'owner.read',
  'staff.delete',
  'payment.refund',
  'procurement.approve',
  'audit.read',
]);

const ASSISTANT_GENERAL_MANAGER: readonly string[] = GENERAL_MANAGER.filter(
  (p) => !AGM_WITHHELD.has(p),
);

export const STAFF_ROLE_PERMISSIONS: Readonly<Record<HotelStaffRole, readonly string[]>> = {
  GENERAL_MANAGER,
  ASSISTANT_GENERAL_MANAGER,

  /**
   * HR staffs the hotel; it does not run it.
   *
   * The list is deliberately four keys long. HR reads the directory, raises a
   * new account and corrects a record — and stops there:
   *   - NO `staff.approve`: every account HR raises waits for a GM/AGM. This is
   *     the whole point of the role, and the reason the `activate: true`
   *     shortcut in `StaffTeamService.create` is inert for HR.
   *   - NO `staff.delete`: removing a colleague is a GM decision.
   *   - NOTHING matching finance/revenue/payroll/payment/procurement/owner.
   *     HR handles people, never their pay or the hotel's money.
   */
  HR: ['staff.read', 'staff.create', 'staff.update', 'profile.read'],

  ACCOUNTS: [
    'finance.read',
    'finance.export',
    'revenue.read',
    'expense.read',
    'expense.create',
    'expense.update',
    'invoice.read',
    'invoice.create',
    'invoice.update',
    'payment.read',
    'payment.collect',
    'payment.refund',
    'folio.read',
    'folio.update',
    'folio.adjust',
    'property.settings.read',
    'rates.read',
    'tax.read',
    'reports.read',
    'reports.export',
    'reservation.read',
    'guest.read',
    'vendor.read',
    'procurement.read',
    'dashboard.read',
  ],

  RECEPTIONIST: [
    'reservation.read',
    'reservation.create',
    'reservation.update',
    // Cancelling is the one front-office act that destroys revenue, so it is
    // named separately from `reservation.update`. Reception genuinely needs it
    // — a guest who rings to cancel cannot be told to wait for the GM — but
    // sales and the travel desk, who can raise bookings, deliberately cannot.
    'reservation.cancel',
    // The desk places arrivals into rooms and quotes tonight's price; it does
    // not edit the price or the hotel's policies.
    'reservation.allocate',
    'rates.read',
    'property.settings.read',
    'folio.read',
    'conversation.read',
    'conversation.send',
    'review.read',
    'checkin.perform',
    'checkout.perform',
    'guest.read',
    'guest.create',
    'room.read',
    // Reception flips a room to OCCUPIED on check-in and to DIRTY on check-out.
    // That is `room.status.update` — the narrow endpoint — and NOT `room.update`,
    // so the desk can never renumber a room or change its rate.
    'room.status.update',
    // Reception is often first to hear of a fault ("the AC in 204 is dead") and
    // may raise a maintenance work order — the same report right attendants get.
    'maintenance.report',
    'keycard.issue',
    'payment.collect',
  ],

  SALES_MANAGER: [
    'lead.read',
    'lead.create',
    'lead.update',
    // The activity timeline logged against a lead.
    'activity.read',
    'activity.create',
    'corporate.read',
    'corporate.create',
    'corporate.update',
    'sales.target.read',
    'sales.report.read',
    'rate.read',
    'reservation.read',
    'reservation.create',
    'guest.read',
    'event.read',
    'reports.read',
    'dashboard.read',
  ],

  TRAVEL_DESK: [
    'trip.read',
    'trip.create',
    'trip.update',
    'tour.read',
    'tour.book',
    'transport.read',
    'transport.book',
    // The transport-request lifecycle the desk owns: raise it, assign a driver
    // and vehicle, and cancel/complete it. NOT `transport.drive` — the desk
    // dispatches, the driver drives.
    'transport.create',
    'transport.update',
    'transport.assign',
    // The vehicle fleet.
    'vehicle.read',
    'vehicle.create',
    'vehicle.update',
    'guest.read',
    'reservation.read',
    'vendor.read',
    'task.read',
    'dashboard.read',
  ],

  HOUSEKEEPING_SUPERVISOR: [
    'housekeeping.read',
    'housekeeping.assign',
    'task.read',
    'task.create',
    'task.assign',
    'task.start',
    'task.complete',
    // The supervisor closes the loop: they inspect a finished clean and pass or
    // fail it. `task.assign` also marks them as the actor who may act on ANY
    // task at the property, not only their own.
    'task.inspect',
    'room.read',
    'room.status.update',
    'maintenance.read',
    'maintenance.report',
    // Reads the maintenance queue and may cancel a raised work order.
    'workorder.read',
    'workorder.cancel',
    'laundry.read',
    'laundry.update',
    'inventory.read',
    'inventory.request',
    'lostfound.read',
    'lostfound.create',
    'staff.attendance.read',
  ],

  ROOM_ATTENDANT: [
    'task.read',
    'task.start',
    'task.complete',
    'maintenance.report',
    'room.read',
    // Marks a room CLEANING then INSPECTED as they work through it.
    'room.status.update',
  ],

  CLEANING_STAFF: ['task.read', 'task.start', 'task.complete', 'maintenance.report', 'area.read'],

  TECHNICIAN: [
    'maintenance.read',
    'maintenance.start',
    'maintenance.complete',
    'maintenance.report',
    // The work-order lifecycle the technician drives: accept a job, work it,
    // pause and resume, and complete it with a resolution.
    'workorder.read',
    'workorder.accept',
    'workorder.start',
    'workorder.pause',
    'workorder.resume',
    'workorder.complete',
    'task.read',
    'task.start',
    'task.complete',
    'room.read',
    'asset.read',
    'inventory.request',
  ],

  SPA_MANAGER: [
    'spa.read',
    'spa.booking.read',
    'spa.booking.create',
    'spa.booking.update',
    'spa.booking.cancel',
    'spa.service.read',
    // The manager owns the service catalogue end to end.
    'spa.service.create',
    'spa.service.update',
    'spa.service.delete',
    'spa.staff.read',
    'spa.roster.update',
    // Reads the outlet's own takings — scoped to spa, not the `revenue.*`
    // namespace the invariants forbid operational roles. The manager sees bills
    // read-only; raising and settling them is the spa-accounts desk's job.
    'spa.bill.read',
    'spa.revenue.read',
    'guest.read',
    'task.read',
    'task.assign',
    'inventory.read',
    'inventory.request',
    'reports.read',
  ],

  SPA_ACCOUNTS: [
    'spa.read',
    'spa.booking.read',
    'spa.invoice.read',
    'spa.invoice.create',
    // The billing desk: raise a bill for a completed treatment, settle it
    // (CASH/CARD/UPI/ROOM_CHARGE) and record a refund.
    'spa.bill.read',
    'spa.bill.create',
    'spa.bill.settle',
    'spa.bill.refund',
    'spa.revenue.read',
    'finance.read',
    'payment.read',
    'payment.collect',
    'guest.read',
    'reports.read',
  ],

  SPA_STAFF: [
    'spa.booking.read',
    // A therapist advances their OWN appointments (start, complete, add notes);
    // the service restricts every write to appointments assigned to them, and
    // assigning a therapist is a manager act (`spa.roster.update`) they lack.
    'spa.booking.update',
    'spa.service.read',
    'task.read',
    'task.start',
    'task.complete',
    'guest.read',
  ],

  // The manager owns the outlet end to end: the floor (tables), the menu, the
  // orders and the money that closes them. `restaurant.revenue.read` is not in
  // the `finance|revenue|...` namespace the invariants forbid operational roles
  // — it is scoped to this outlet — and the manager is not an operational role.
  RESTAURANT_MANAGER: [
    'restaurant.read',
    'restaurant.revenue.read',
    'menu.read',
    'menu.manage',
    'table.read',
    'table.assign',
    'table.manage',
    'order.read',
    'order.create',
    'order.update',
    'order.void',
    'kot.read',
    'kot.update',
    'bill.read',
    'bill.generate',
    'bill.settle',
    'pos.read',
    'pos.operate',
    'inventory.read',
    'inventory.request',
    'staff.attendance.read',
    'task.read',
    'task.assign',
    'guest.read',
    'reports.read',
  ],

  // The cashier closes bills. Settling is `bill.settle` — deliberately NOT a
  // `finance.*`/`payment.*` grant that would imply the till belongs to a
  // finance role; it is the outlet action of taking payment and freeing a table.
  CASHIER: [
    'restaurant.read',
    'pos.read',
    'pos.operate',
    'order.read',
    'order.update',
    'bill.read',
    'bill.generate',
    'bill.settle',
    'payment.read',
    'payment.collect',
    'shift.close',
    'table.read',
    'guest.read',
  ],

  WAITER: [
    'table.read',
    'table.assign',
    'order.read',
    'order.create',
    'order.update',
    'kot.create',
    // Sends items to the kitchen and marks them SERVED. The chef/waiter split
    // on WHICH kot moves each may make is enforced in the service, not here.
    'kot.update',
    // Requests the bill (OPEN → BILLED). Settling it is the cashier's job.
    'bill.generate',
    'menu.read',
    'guest.read',
    'task.read',
    'task.complete',
  ],

  CHEF: [
    'kot.read',
    'kot.update',
    'kot.complete',
    // Reads the menu to cook from it; managing the menu is the manager's, not
    // the kitchen's — so no `menu.manage`/`menu.update` here.
    'menu.read',
    'order.read',
    'kitchen.stock.read',
    'inventory.read',
    'inventory.request',
    'task.read',
    'task.complete',
  ],

  CLEANER: [
    'task.read',
    'task.start',
    'task.complete',
    'maintenance.report',
    'area.read',
    'table.read',
  ],

  INVENTORY_STORE_MANAGER: [
    'inventory.read',
    'inventory.create',
    'inventory.update',
    'inventory.issue',
    'inventory.receive',
    'inventory.audit',
    'stock.read',
    'stock.adjust',
    'grn.read',
    'grn.create',
    'purchase.request.read',
    'purchase.request.create',
    // Suppliers and the purchase-order lifecycle the store manager owns.
    'supplier.read',
    'supplier.create',
    'supplier.update',
    'po.read',
    'po.create',
    'po.update',
    'po.receive',
    'procurement.read',
    'vendor.read',
    'reports.read',
  ],

  SECURITY_MANAGER: [
    'gate.read',
    // Writes the gate feed (vehicle + staff movements) — a scoped operational
    // key, nothing in the forbidden finance/revenue/... namespaces.
    'gate.record',
    'vehicle.entry',
    'vehicle.exit',
    'staff.entry',
    'visitor.read',
    'visitor.record',
    'lostfound.read',
    'lostfound.create',
    'lostfound.update',
    'incident.read',
    'incident.create',
    'incident.update',
    // The manager owns the roster: read it and assign shifts.
    'shift.read',
    'shift.assign',
    'patrol.read',
    'patrol.assign',
    'cctv.read',
    'task.read',
    'task.assign',
    'staff.attendance.read',
    'reports.read',
  ],

  SECURITY_STAFF: [
    'gate.read',
    // The guard on the gate writes the gate feed and browses the visitor book
    // they manage. Deliberately NO `incident.read`: a guard reports an incident,
    // the manager browses them. And nothing in the finance/revenue/... family.
    'gate.record',
    'vehicle.entry',
    'vehicle.exit',
    'staff.entry',
    'visitor.read',
    'visitor.record',
    'lostfound.read',
    'lostfound.create',
    'incident.create',
  ],

  DRIVER: [
    'trip.read',
    'trip.start',
    'trip.complete',
    'transport.read',
    // Drive an assigned trip through its doorstep steps (accept → on-the-way →
    // arrived → picked-up → completed). Dispatch stays with the travel desk.
    'transport.drive',
    'vehicle.log.read',
    'vehicle.log.create',
    'task.read',
    'task.complete',
    'guest.read',
  ],

  EVENT_MANAGER: [
    'event.read',
    'event.create',
    'event.update',
    'event.cancel',
    'banquet.read',
    'banquet.book',
    'banquet.update',
    'guest.read',
    'reservation.read',
    'lead.read',
    'menu.read',
    'vendor.read',
    'task.read',
    'task.assign',
    'reports.read',
  ],
};

/** Resolve a role's permissions. Unknown roles resolve to none, never to all. */
export function permissionsForRole(role: string): string[] {
  const perms = STAFF_ROLE_PERMISSIONS[role as HotelStaffRole];
  return perms ? [...perms] : [];
}

export function roleHasPermission(role: string, permission: string): boolean {
  return permissionsForRole(role).includes(permission);
}

/** Every role the map covers — used by tests to prove no role is missing. */
export const STAFF_ROLES_WITH_PERMISSIONS = hotelStaffRoleValues;

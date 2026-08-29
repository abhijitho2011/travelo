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
  'task.assign',
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
    'invoice.read',
    'invoice.create',
    'invoice.update',
    'payment.read',
    'payment.collect',
    'payment.refund',
    'folio.read',
    'folio.update',
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
    'checkin.perform',
    'checkout.perform',
    'guest.read',
    'guest.create',
    'room.read',
    // Reception flips a room to OCCUPIED on check-in and to DIRTY on check-out.
    // That is `room.status.update` — the narrow endpoint — and NOT `room.update`,
    // so the desk can never renumber a room or change its rate.
    'room.status.update',
    'keycard.issue',
    'payment.collect',
  ],

  SALES_MANAGER: [
    'lead.read',
    'lead.create',
    'lead.update',
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
    'guest.read',
    'reservation.read',
    'vendor.read',
    'task.read',
  ],

  HOUSEKEEPING_SUPERVISOR: [
    'housekeeping.read',
    'housekeeping.assign',
    'task.read',
    'task.create',
    'task.assign',
    'task.complete',
    'room.read',
    'room.status.update',
    'maintenance.read',
    'maintenance.report',
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
    'spa.service.update',
    'spa.staff.read',
    'spa.roster.update',
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
    'spa.revenue.read',
    'finance.read',
    'payment.read',
    'payment.collect',
    'guest.read',
    'reports.read',
  ],

  SPA_STAFF: [
    'spa.booking.read',
    'spa.service.read',
    'task.read',
    'task.start',
    'task.complete',
    'guest.read',
  ],

  RESTAURANT_MANAGER: [
    'restaurant.read',
    'restaurant.revenue.read',
    'menu.read',
    'menu.update',
    'table.read',
    'table.assign',
    'order.read',
    'order.create',
    'order.update',
    'order.void',
    'kot.read',
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

  CASHIER: [
    'pos.read',
    'pos.operate',
    'order.read',
    'order.update',
    'bill.read',
    'bill.generate',
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
    'menu.read',
    'guest.read',
    'task.read',
    'task.complete',
  ],

  CHEF: [
    'kot.read',
    'kot.update',
    'kot.complete',
    'menu.read',
    'menu.update',
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
    'procurement.read',
    'vendor.read',
    'reports.read',
  ],

  SECURITY_MANAGER: [
    'gate.read',
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
    'vehicle.entry',
    'vehicle.exit',
    'staff.entry',
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

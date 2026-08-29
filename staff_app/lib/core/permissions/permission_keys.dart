/// The permission catalogue, mirroring the server's source of truth in
/// `src/modules/staff-auth/role-permissions.ts`.
///
/// The server is always the authority — `StaffPermissionsGuard` re-checks every
/// protected route. These constants exist so no screen hard-codes a magic
/// string, and so a typo is a compile error rather than a silently hidden
/// button.
///
/// Only the keys this client actually uses are listed. Anything the server
/// grants that is not here simply goes unused; nothing breaks.
class P {
  P._();

  // ------------------------------------------------------------ oversight --
  static const dashboardRead = 'dashboard.read';
  static const approvalRead = 'approval.read';
  static const approvalAct = 'approval.act';
  static const reportsRead = 'reports.read';
  static const reportsExport = 'reports.export';
  static const auditRead = 'audit.read';

  // ---------------------------------------------------------------- money --
  static const financeRead = 'finance.read';
  static const revenueRead = 'revenue.read';
  static const payrollRead = 'payroll.read';
  static const paymentRead = 'payment.read';
  static const paymentCollect = 'payment.collect';
  static const paymentRefund = 'payment.refund';
  static const invoiceRead = 'invoice.read';

  // ----------------------------------------------------------------- team --
  static const staffRead = 'staff.read';
  static const staffCreate = 'staff.create';
  static const staffUpdate = 'staff.update';
  static const staffApprove = 'staff.approve';
  static const staffDelete = 'staff.delete';
  static const staffAttendanceRead = 'staff.attendance.read';

  // --------------------------------------------------------- front office --
  static const reservationRead = 'reservation.read';
  static const reservationCreate = 'reservation.create';
  static const reservationUpdate = 'reservation.update';
  static const reservationCancel = 'reservation.cancel';
  static const checkInPerform = 'checkin.perform';
  static const checkOutPerform = 'checkout.perform';
  static const guestRead = 'guest.read';
  static const guestCreate = 'guest.create';
  static const roomRead = 'room.read';
  static const roomStatusUpdate = 'room.status.update';

  // --------------------------------------------------------------- rooms --
  // The inventory itself, as opposed to the front-office view of it. The
  // server grants the write half to GM and AGM only; every other role that can
  // see a room holds `room.read` and, at most, `room.status.update`.
  static const roomCreate = 'room.create';
  static const roomUpdate = 'room.update';
  static const roomDelete = 'room.delete';
  static const roomTypeRead = 'roomtype.read';
  static const roomTypeCreate = 'roomtype.create';
  static const roomTypeUpdate = 'roomtype.update';
  static const roomTypeDelete = 'roomtype.delete';
  static const keyCardIssue = 'keycard.issue';
  static const rateRead = 'rate.read';

  // ----------------------------------------------------------- operations --
  static const housekeepingRead = 'housekeeping.read';
  static const housekeepingAssign = 'housekeeping.assign';
  static const taskRead = 'task.read';
  static const taskStart = 'task.start';
  static const taskComplete = 'task.complete';
  static const taskAssign = 'task.assign';
  static const maintenanceRead = 'maintenance.read';
  static const maintenanceReport = 'maintenance.report';
  static const inventoryRead = 'inventory.read';
  static const inventoryRequest = 'inventory.request';

  // -------------------------------------------------------------- outlets --
  static const restaurantRead = 'restaurant.read';
  static const posRead = 'pos.read';
  static const posOperate = 'pos.operate';
  static const tableRead = 'table.read';
  static const kotRead = 'kot.read';
  static const spaRead = 'spa.read';
  static const spaBookingRead = 'spa.booking.read';
  static const eventRead = 'event.read';

  // --------------------------------------------------------- safety / gate --
  static const gateRead = 'gate.read';
  static const vehicleEntry = 'vehicle.entry';
  static const vehicleExit = 'vehicle.exit';
  static const staffEntry = 'staff.entry';
  static const visitorRead = 'visitor.read';
  static const visitorRecord = 'visitor.record';
  static const lostFoundRead = 'lostfound.read';
  static const lostFoundCreate = 'lostfound.create';
  static const incidentRead = 'incident.read';
  static const incidentCreate = 'incident.create';

  // ------------------------------------------------------------ transport --
  static const tripRead = 'trip.read';
  static const transportRead = 'transport.read';

  // ---------------------------------------------------------------- other --
  static const leadRead = 'lead.read';
  static const tourRead = 'tour.read';
  static const areaRead = 'area.read';
}

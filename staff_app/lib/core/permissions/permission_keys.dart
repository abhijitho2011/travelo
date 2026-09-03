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
  // Property configuration, the rates grid, folio adjustments, allocation.
  static const propertySettingsRead = 'property.settings.read';
  static const propertySettingsUpdate = 'property.settings.update';
  static const ratesRead = 'rates.read';
  static const ratesUpdate = 'rates.update';
  static const folioRead = 'folio.read';
  static const folioAdjust = 'folio.adjust';
  static const reservationAllocate = 'reservation.allocate';
  static const conversationRead = 'conversation.read';
  static const conversationSend = 'conversation.send';
  static const reviewRead = 'review.read';
  static const reviewRespond = 'review.respond';
  static const corporateRead = 'corporate.read';

  // ----------------------------------------------------------- operations --
  static const housekeepingRead = 'housekeeping.read';
  static const housekeepingAssign = 'housekeeping.assign';
  static const taskRead = 'task.read';
  static const taskCreate = 'task.create';
  static const taskStart = 'task.start';
  static const taskComplete = 'task.complete';
  static const taskAssign = 'task.assign';
  static const taskInspect = 'task.inspect';
  static const maintenanceRead = 'maintenance.read';
  static const maintenanceReport = 'maintenance.report';
  // Maintenance work orders — the technician's lifecycle plus supervisor cancel.
  static const workOrderRead = 'workorder.read';
  static const workOrderAccept = 'workorder.accept';
  static const workOrderStart = 'workorder.start';
  static const workOrderPause = 'workorder.pause';
  static const workOrderResume = 'workorder.resume';
  static const workOrderComplete = 'workorder.complete';
  static const workOrderCancel = 'workorder.cancel';
  static const inventoryRead = 'inventory.read';
  static const inventoryRequest = 'inventory.request';
  static const inventoryCreate = 'inventory.create';
  static const inventoryUpdate = 'inventory.update';
  static const stockRead = 'stock.read';
  static const stockAdjust = 'stock.adjust';
  static const supplierRead = 'supplier.read';
  static const supplierCreate = 'supplier.create';
  static const supplierUpdate = 'supplier.update';
  static const poRead = 'po.read';
  static const poCreate = 'po.create';
  static const poUpdate = 'po.update';
  static const poReceive = 'po.receive';

  // -------------------------------------------------------------- outlets --
  static const restaurantRead = 'restaurant.read';
  static const posRead = 'pos.read';
  static const posOperate = 'pos.operate';
  static const tableRead = 'table.read';
  // Restaurant floor + menu management (manager), orders (waiter), the KOT
  // (kitchen + floor, split by role in-service) and the bill (request vs settle).
  static const tableManage = 'table.manage';
  static const menuManage = 'menu.manage';
  static const orderRead = 'order.read';
  static const orderCreate = 'order.create';
  static const orderUpdate = 'order.update';
  static const orderVoid = 'order.void';
  static const kotRead = 'kot.read';
  static const kotUpdate = 'kot.update';
  static const billGenerate = 'bill.generate';
  static const billSettle = 'bill.settle';
  static const spaRead = 'spa.read';
  static const spaBookingRead = 'spa.booking.read';
  static const spaBookingCreate = 'spa.booking.create';
  static const spaBookingUpdate = 'spa.booking.update';
  static const spaRosterUpdate = 'spa.roster.update';
  static const spaServiceRead = 'spa.service.read';
  static const spaServiceCreate = 'spa.service.create';
  static const spaServiceUpdate = 'spa.service.update';
  static const spaServiceDelete = 'spa.service.delete';
  static const spaBillRead = 'spa.bill.read';
  static const spaBillCreate = 'spa.bill.create';
  static const spaBillSettle = 'spa.bill.settle';
  static const spaBillRefund = 'spa.bill.refund';
  static const spaRevenueRead = 'spa.revenue.read';
  static const eventRead = 'event.read';
  static const eventCreate = 'event.create';
  static const eventUpdate = 'event.update';
  static const eventCancel = 'event.cancel';

  // --------------------------------------------------------- safety / gate --
  static const gateRead = 'gate.read';
  static const gateRecord = 'gate.record';
  static const vehicleEntry = 'vehicle.entry';
  static const vehicleExit = 'vehicle.exit';
  static const staffEntry = 'staff.entry';
  static const visitorRead = 'visitor.read';
  static const visitorRecord = 'visitor.record';
  static const lostFoundRead = 'lostfound.read';
  static const lostFoundCreate = 'lostfound.create';
  static const lostFoundUpdate = 'lostfound.update';
  static const incidentRead = 'incident.read';
  static const incidentCreate = 'incident.create';
  static const incidentUpdate = 'incident.update';
  static const shiftRead = 'shift.read';
  static const shiftAssign = 'shift.assign';

  // ------------------------------------------------------------ transport --
  static const tripRead = 'trip.read';
  static const transportRead = 'transport.read';
  static const transportCreate = 'transport.create';
  static const transportUpdate = 'transport.update';
  static const transportAssign = 'transport.assign';
  static const transportDrive = 'transport.drive';
  static const vehicleRead = 'vehicle.read';
  static const vehicleCreate = 'vehicle.create';
  static const vehicleUpdate = 'vehicle.update';

  // -------------------------------------------------------------- accounts --
  static const expenseRead = 'expense.read';
  static const expenseCreate = 'expense.create';
  static const expenseUpdate = 'expense.update';

  // ---------------------------------------------------------------- other --
  static const leadRead = 'lead.read';
  static const leadCreate = 'lead.create';
  static const leadUpdate = 'lead.update';
  static const activityRead = 'activity.read';
  static const activityCreate = 'activity.create';
  static const tourRead = 'tour.read';
  static const areaRead = 'area.read';
}

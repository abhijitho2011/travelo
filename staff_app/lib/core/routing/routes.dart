/// Every route path in the app, in one place. `RoleConfig` and the router both
/// reference these constants, so a nav item can never point at a path the
/// router does not serve.
class Routes {
  Routes._();

  // --- unauthenticated ---
  static const splash = '/';
  static const login = '/login';
  static const otp = '/otp';
  static const accountStatus = '/account-status';
  static const sessionExpired = '/session-expired';

  // --- post-auth interstitials ---
  static const welcome = '/welcome';
  static const accessDenied = '/access-denied';

  // --- common ---
  static const notifications = '/notifications';
  static const profile = '/profile';
  static const support = '/support';

  // --- management (GM / AGM) — built ---
  static const management = '/management';
  static const approvals = '/management/approvals';
  static const team = '/management/team';
  static const teamNew = '/management/team/new';

  /// Read-only queue of colleagues still waiting on a manager's decision. HR's
  /// second tab: it may raise an account but never sign one off, so this is
  /// where it watches what it submitted.
  ///
  /// Deliberately NOT a nav destination for GM/AGM — they act on the same rows
  /// from `approvals`, and adding a route to any role's config also adds it to
  /// the guard's canonicalisation set.
  static const teamPending = '/management/team/pending';

  // --- reception — built ---
  static const reception = '/reception';
  static const reservations = '/reception/reservations';

  /// Declared — and, in the router, registered — BEFORE the `:id` pattern, or
  /// "new" is matched as a reservation whose id is the word "new".
  static const reservationNew = '/reception/reservations/new';
  static String reservation(String id) => '/reception/reservations/$id';
  static const reservationPattern = '/reception/reservations/:id';
  static const checkIn = '/reception/check-in';

  // --- rooms & room types — built ---
  //
  // Both live at the top level rather than under `/management` or
  // `/reception`, because four different roles reach them and none of them
  // owns the inventory. The guard canonicalises by longest matching nav route,
  // so `/rooms/new` and `/rooms/:id` inherit `/rooms`, and `/room-types/...`
  // inherits `/room-types` — the two never collide because `/room-types` does
  // not start with `/rooms`.
  static const rooms = '/rooms';
  static const roomNew = '/rooms/new';
  static const roomBulk = '/rooms/bulk';
  static const roomPattern = '/rooms/:id';
  static String room(String id) => '/rooms/$id';

  static const roomTypes = '/room-types';
  static const roomTypeNew = '/room-types/new';
  static const roomTypePattern = '/room-types/:id';
  static String roomType(String id) => '/room-types/$id';

  // --- room attendant — built ---
  static const myTasks = '/my-tasks';
  static String task(String id) => '/my-tasks/$id';
  static const taskPattern = '/my-tasks/:id';

  // --- security staff / gate — built ---
  static const securityGate = '/security';
  static const securityVehicles = '/security/vehicles';
  static const securityStaffMovement = '/security/staff-movement';
  static const securityVisitors = '/security/visitors';
  static const securityLostFound = '/security/lost-found';
  static const securityIncidents = '/security/incidents';

  // --- deferred modules (honest placeholders) ---
  static const accounts = '/accounts';
  static const accountsExpenses = '/accounts/expenses';
  static const sales = '/sales';
  static const salesLeadPattern = '/sales/leads/:id';
  static String salesLead(String id) => '/sales/leads/$id';
  static const travelDesk = '/travel-desk';
  static const travelDeskVehicles = '/travel-desk/vehicles';
  static const housekeeping = '/housekeeping';
  static const housekeepingTasks = '/housekeeping/tasks';
  static const maintenance = '/maintenance';
  static const myWorkOrders = '/maintenance/my-work-orders';
  static const workOrders = '/work-orders';
  static const workOrderPattern = '/work-orders/:id';
  static String workOrder(String id) => '/work-orders/$id';
  static const spa = '/spa';
  static const spaAppointments = '/spa/my-appointments';
  static const spaBookings = '/spa/bookings';
  static const restaurant = '/restaurant';
  static const pos = '/restaurant/pos';
  static const myTables = '/restaurant/my-tables';
  static const kitchen = '/restaurant/kitchen';
  static const restaurantCleaning = '/restaurant/cleaning';
  // Menu and floor management (manager). Declared as top-level restaurant
  // sub-paths; the order screen takes an :id, registered after the static ones.
  static const restaurantMenu = '/restaurant/menu';
  static const restaurantTables = '/restaurant/tables';
  static const restaurantOrders = '/restaurant/orders';
  static const restaurantOrderPattern = '/restaurant/orders/:id';
  static String restaurantOrder(String id) => '/restaurant/orders/$id';
  static const inventory = '/inventory';
  static const inventoryItems = '/inventory/items';
  static const inventoryMovements = '/inventory/movements';
  static const inventoryPurchaseOrders = '/inventory/purchase-orders';
  static const inventoryPoPattern = '/inventory/purchase-orders/:id';
  static String inventoryPo(String id) => '/inventory/purchase-orders/$id';
  static const securityManager = '/security/manager';
  static const driver = '/driver';
  static const driverTripPattern = '/driver/trips/:id';
  static String driverTrip(String id) => '/driver/trips/$id';
  static const events = '/events';
}

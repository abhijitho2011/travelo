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

  // --- management (GM / AGM) — built ---
  static const management = '/management';
  static const approvals = '/management/approvals';
  static const team = '/management/team';
  static const teamNew = '/management/team/new';

  // --- reception — built ---
  static const reception = '/reception';
  static const reservations = '/reception/reservations';
  static String reservation(String id) => '/reception/reservations/$id';
  static const reservationPattern = '/reception/reservations/:id';
  static const checkIn = '/reception/check-in';

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
  static const sales = '/sales';
  static const travelDesk = '/travel-desk';
  static const housekeeping = '/housekeeping';
  static const maintenance = '/maintenance';
  static const myWorkOrders = '/maintenance/my-work-orders';
  static const spa = '/spa';
  static const spaAppointments = '/spa/my-appointments';
  static const spaBookings = '/spa/bookings';
  static const restaurant = '/restaurant';
  static const pos = '/restaurant/pos';
  static const myTables = '/restaurant/my-tables';
  static const kitchen = '/restaurant/kitchen';
  static const restaurantCleaning = '/restaurant/cleaning';
  static const inventory = '/inventory';
  static const securityManager = '/security/manager';
  static const driver = '/driver';
  static const events = '/events';
}

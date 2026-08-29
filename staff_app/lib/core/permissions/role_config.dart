import 'package:flutter/material.dart';

import '../routing/routes.dart';
import 'permission_keys.dart';
import 'permission_set.dart';

/// The 23 operational roles the unified staff app can sign in as.
///
/// [wire] matches `hotelStaffRoleValues` in `src/database/schema/owner.ts`
/// exactly — it is the string `GET /auth/me` returns. An unrecognised value
/// (a newer backend) resolves to [unknown], which routes to a clean
/// placeholder rather than crashing.
enum StaffRole {
  generalManager('GENERAL_MANAGER', 'General Manager', 'Management'),
  assistantGeneralManager(
    'ASSISTANT_GENERAL_MANAGER',
    'Assistant General Manager',
    'Management',
  ),
  accounts('ACCOUNTS', 'Accounts', 'Accounts'),
  receptionist('RECEPTIONIST', 'Receptionist', 'Front Office'),
  salesManager('SALES_MANAGER', 'Sales Manager', 'Sales'),
  travelDesk('TRAVEL_DESK', 'Travel Desk', 'Travel Desk'),
  housekeepingSupervisor(
    'HOUSEKEEPING_SUPERVISOR',
    'Housekeeping Supervisor',
    'Housekeeping',
  ),
  roomAttendant('ROOM_ATTENDANT', 'Room Attendant', 'Housekeeping'),
  cleaningStaff('CLEANING_STAFF', 'Cleaning Staff', 'Housekeeping'),
  technician('TECHNICIAN', 'Technician', 'Maintenance'),
  spaManager('SPA_MANAGER', 'Spa Manager', 'Spa'),
  spaAccounts('SPA_ACCOUNTS', 'Spa Accounts', 'Spa'),
  spaStaff('SPA_STAFF', 'Spa Therapist', 'Spa'),
  restaurantManager('RESTAURANT_MANAGER', 'Restaurant Manager', 'Restaurant'),
  cashier('CASHIER', 'Cashier', 'Restaurant'),
  waiter('WAITER', 'Waiter', 'Restaurant'),
  chef('CHEF', 'Chef', 'Kitchen'),
  cleaner('CLEANER', 'Cleaner', 'Restaurant'),
  inventoryStoreManager(
    'INVENTORY_STORE_MANAGER',
    'Inventory & Store Manager',
    'Inventory',
  ),
  securityManager('SECURITY_MANAGER', 'Security Manager', 'Security'),
  securityStaff('SECURITY_STAFF', 'Security Staff', 'Security'),
  driver('DRIVER', 'Driver', 'Transport'),
  eventManager('EVENT_MANAGER', 'Event Manager', 'Events'),
  unknown('UNKNOWN', 'Staff', 'General');

  const StaffRole(this.wire, this.label, this.department);

  final String wire;
  final String label;
  final String department;

  static StaffRole fromWire(String? value) {
    if (value == null) return StaffRole.unknown;
    final normalised = value.trim().toUpperCase().replaceAll(' ', '_');
    for (final r in StaffRole.values) {
      if (r.wire == normalised) return r;
    }
    return StaffRole.unknown;
  }

  /// Roles a GM/AGM may create from inside the property. Hotel management is
  /// appointed by the Owner, so both management roles are excluded — this
  /// mirrors `staffCreatableRoleValues` on the server, which rejects them.
  static List<StaffRole> get creatableByManagement => StaffRole.values
      .where(
        (r) =>
            r != StaffRole.generalManager &&
            r != StaffRole.assistantGeneralManager &&
            r != StaffRole.unknown,
      )
      .toList(growable: false);

  /// Every real role, for filter dropdowns.
  static List<StaffRole> get all =>
      StaffRole.values.where((r) => r != StaffRole.unknown).toList(growable: false);
}

/// One entry in the bottom navigation or the "More" sheet.
@immutable
class NavItem {
  const NavItem({
    required this.label,
    required this.icon,
    required this.route,
    this.requires = const <String>[],
  });

  final String label;
  final IconData icon;
  final String route;

  /// ALL of these permissions must be granted for the item to appear. An empty
  /// list means the item is available to anyone holding the role.
  final List<String> requires;

  bool isVisibleTo(PermissionSet permissions) => permissions.hasAll(requires);
}

/// The complete description of what a role's app looks like.
///
/// This is the single source of truth: home route, bottom navigation, More
/// menu, and the permissions each destination needs. No screen anywhere in the
/// app branches on `role == ...`; they ask [RoleConfig] instead.
@immutable
class RoleConfig {
  const RoleConfig({
    required this.role,
    required this.homeRoute,
    required this.homeModuleLabel,
    this.bottomNav = const <NavItem>[],
    this.moreMenu = const <NavItem>[],
    this.built = false,
  });

  final StaffRole role;

  /// Where the user lands after sign-in.
  final String homeRoute;

  /// Human name of the home module, used by the placeholder so a role whose
  /// module is not built yet still gets an honest, specific message.
  final String homeModuleLabel;

  final List<NavItem> bottomNav;
  final List<NavItem> moreMenu;

  /// False when the home module is still a placeholder in this build.
  final bool built;

  List<NavItem> visibleNav(PermissionSet permissions) =>
      bottomNav.where((i) => i.isVisibleTo(permissions)).toList(growable: false);

  List<NavItem> visibleMore(PermissionSet permissions) =>
      moreMenu.where((i) => i.isVisibleTo(permissions)).toList(growable: false);

  /// Every route this role may reach, permissions ignored. The RoleGuard uses
  /// it; the PermissionGuard then re-checks the keys.
  Set<String> get allowedRoutes => {
    homeRoute,
    for (final i in bottomNav) i.route,
    for (final i in moreMenu) i.route,
    ..._alwaysAllowed,
  };

  static const Set<String> _alwaysAllowed = {
    Routes.profile,
    Routes.notifications,
    Routes.accessDenied,
    Routes.welcome,
  };

  /// Permissions required by whichever nav item serves [route], or null when
  /// the route is not permission-gated for this role.
  List<String>? requirementsFor(String route) {
    for (final i in [...bottomNav, ...moreMenu]) {
      if (i.route == route) return i.requires;
    }
    return null;
  }

  static RoleConfig of(StaffRole role) => _configs[role] ?? _fallback(role);

  static RoleConfig _fallback(StaffRole role) => RoleConfig(
    role: role,
    homeRoute: Routes.profile,
    homeModuleLabel: '${role.label} home',
  );

  // ---------------------------------------------------------------------
  // Shared fragments
  // ---------------------------------------------------------------------

  static const _profileItem = NavItem(
    label: 'Profile',
    icon: Icons.person_outline,
    route: Routes.profile,
  );
  static const _notificationsItem = NavItem(
    label: 'Alerts',
    icon: Icons.notifications_none,
    route: Routes.notifications,
  );

  /// Every role's More menu ends with these two.
  static const List<NavItem> _commonMore = [_notificationsItem, _profileItem];

  /// A one-destination role: its module plus the common items.
  static RoleConfig _simple(
    StaffRole role,
    String route,
    String moduleLabel,
    String navLabel,
    IconData icon, {
    List<String> requires = const [],
  }) => RoleConfig(
    role: role,
    homeRoute: route,
    homeModuleLabel: moduleLabel,
    bottomNav: [
      NavItem(label: navLabel, icon: icon, route: route, requires: requires),
    ],
    moreMenu: _commonMore,
  );

  // ---------------------------------------------------------------------
  // The map. All 23 roles.
  // ---------------------------------------------------------------------

  static final Map<StaffRole, RoleConfig> _configs = {
    // ========================= Management (BUILT) =========================
    StaffRole.generalManager: RoleConfig(
      role: StaffRole.generalManager,
      homeRoute: Routes.management,
      homeModuleLabel: 'Management Dashboard',
      built: true,
      bottomNav: const [
        NavItem(
          label: 'Dashboard',
          icon: Icons.space_dashboard_outlined,
          route: Routes.management,
          requires: [P.dashboardRead],
        ),
        NavItem(
          label: 'Approvals',
          icon: Icons.fact_check_outlined,
          route: Routes.approvals,
          requires: [P.approvalRead],
        ),
        NavItem(
          label: 'Team',
          icon: Icons.groups_outlined,
          route: Routes.team,
          requires: [P.staffRead],
        ),
        NavItem(
          label: 'Front desk',
          icon: Icons.room_service_outlined,
          route: Routes.reception,
          requires: [P.reservationRead],
        ),
      ],
      moreMenu: const [
        NavItem(
          label: 'Bookings',
          icon: Icons.event_note_outlined,
          route: Routes.reservations,
          requires: [P.reservationRead],
        ),
        NavItem(
          label: 'Housekeeping',
          icon: Icons.cleaning_services_outlined,
          route: Routes.housekeeping,
          requires: [P.housekeepingRead],
        ),
        NavItem(
          label: 'Maintenance',
          icon: Icons.build_outlined,
          route: Routes.maintenance,
          requires: [P.maintenanceRead],
        ),
        NavItem(
          label: 'Restaurant',
          icon: Icons.restaurant_outlined,
          route: Routes.restaurant,
          requires: [P.restaurantRead],
        ),
        NavItem(
          label: 'Inventory',
          icon: Icons.inventory_2_outlined,
          route: Routes.inventory,
          requires: [P.inventoryRead],
        ),
        NavItem(
          label: 'Accounts',
          icon: Icons.account_balance_outlined,
          route: Routes.accounts,
          requires: [P.financeRead],
        ),
        NavItem(
          label: 'Spa',
          icon: Icons.spa_outlined,
          route: Routes.spa,
          requires: [P.spaRead],
        ),
        NavItem(
          label: 'Events',
          icon: Icons.celebration_outlined,
          route: Routes.events,
          requires: [P.eventRead],
        ),
        NavItem(
          label: 'Security',
          icon: Icons.shield_outlined,
          route: Routes.securityManager,
          requires: [P.incidentRead],
        ),
        ..._commonMore,
      ],
    ),

    // The AGM shares the GM's map entirely. What narrows the app is the
    // permission set the server returns (no staff.delete, no reports.export,
    // no payroll.read, no owner.read) — not a single `if (role == AGM)`.
    StaffRole.assistantGeneralManager: RoleConfig(
      role: StaffRole.assistantGeneralManager,
      homeRoute: Routes.management,
      homeModuleLabel: 'Management Dashboard',
      built: true,
      bottomNav: const [
        NavItem(
          label: 'Dashboard',
          icon: Icons.space_dashboard_outlined,
          route: Routes.management,
          requires: [P.dashboardRead],
        ),
        NavItem(
          label: 'Approvals',
          icon: Icons.fact_check_outlined,
          route: Routes.approvals,
          requires: [P.approvalRead],
        ),
        NavItem(
          label: 'Team',
          icon: Icons.groups_outlined,
          route: Routes.team,
          requires: [P.staffRead],
        ),
        NavItem(
          label: 'Front desk',
          icon: Icons.room_service_outlined,
          route: Routes.reception,
          requires: [P.reservationRead],
        ),
      ],
      moreMenu: const [
        NavItem(
          label: 'Bookings',
          icon: Icons.event_note_outlined,
          route: Routes.reservations,
          requires: [P.reservationRead],
        ),
        NavItem(
          label: 'Housekeeping',
          icon: Icons.cleaning_services_outlined,
          route: Routes.housekeeping,
          requires: [P.housekeepingRead],
        ),
        NavItem(
          label: 'Maintenance',
          icon: Icons.build_outlined,
          route: Routes.maintenance,
          requires: [P.maintenanceRead],
        ),
        NavItem(
          label: 'Restaurant',
          icon: Icons.restaurant_outlined,
          route: Routes.restaurant,
          requires: [P.restaurantRead],
        ),
        NavItem(
          label: 'Inventory',
          icon: Icons.inventory_2_outlined,
          route: Routes.inventory,
          requires: [P.inventoryRead],
        ),
        NavItem(
          label: 'Spa',
          icon: Icons.spa_outlined,
          route: Routes.spa,
          requires: [P.spaRead],
        ),
        NavItem(
          label: 'Events',
          icon: Icons.celebration_outlined,
          route: Routes.events,
          requires: [P.eventRead],
        ),
        NavItem(
          label: 'Security',
          icon: Icons.shield_outlined,
          route: Routes.securityManager,
          requires: [P.incidentRead],
        ),
        ..._commonMore,
      ],
    ),

    // ========================== Reception (BUILT) =========================
    StaffRole.receptionist: RoleConfig(
      role: StaffRole.receptionist,
      homeRoute: Routes.reception,
      homeModuleLabel: 'Reception',
      built: true,
      bottomNav: const [
        NavItem(
          label: 'Front desk',
          icon: Icons.room_service_outlined,
          route: Routes.reception,
          requires: [P.reservationRead],
        ),
        NavItem(
          label: 'Bookings',
          icon: Icons.event_note_outlined,
          route: Routes.reservations,
          requires: [P.reservationRead],
        ),
        NavItem(
          label: 'Check-in',
          icon: Icons.login_outlined,
          route: Routes.checkIn,
          requires: [P.checkInPerform],
        ),
      ],
      moreMenu: _commonMore,
    ),

    // ======================= Room attendant (BUILT) =======================
    // Deliberately minimal: two destinations, nothing financial, nothing that
    // needs a decision the attendant is not empowered to make.
    StaffRole.roomAttendant: RoleConfig(
      role: StaffRole.roomAttendant,
      homeRoute: Routes.myTasks,
      homeModuleLabel: 'My Tasks',
      built: true,
      bottomNav: const [
        NavItem(
          label: 'My tasks',
          icon: Icons.checklist_outlined,
          route: Routes.myTasks,
          requires: [P.taskRead],
        ),
        NavItem(
          label: 'Profile',
          icon: Icons.person_outline,
          route: Routes.profile,
        ),
      ],
      moreMenu: const [_notificationsItem],
    ),

    // Same permission shape as the attendant (`task.read/start/complete`), so
    // the same built task list serves it honestly.
    StaffRole.cleaningStaff: RoleConfig(
      role: StaffRole.cleaningStaff,
      homeRoute: Routes.myTasks,
      homeModuleLabel: 'My Tasks',
      built: true,
      bottomNav: const [
        NavItem(
          label: 'My tasks',
          icon: Icons.checklist_outlined,
          route: Routes.myTasks,
          requires: [P.taskRead],
        ),
        NavItem(
          label: 'Profile',
          icon: Icons.person_outline,
          route: Routes.profile,
        ),
      ],
      moreMenu: const [_notificationsItem],
    ),

    // ====================== Security staff / gate (BUILT) =================
    // A restricted surface: there is no route here that can reach a folio, a
    // rate, revenue or an owner record — the role simply has no nav item
    // pointing at one, and `allowedRoutes` is derived from this list.
    StaffRole.securityStaff: RoleConfig(
      role: StaffRole.securityStaff,
      homeRoute: Routes.securityGate,
      homeModuleLabel: 'Gate',
      built: true,
      bottomNav: const [
        NavItem(
          label: 'Gate',
          icon: Icons.sensor_door_outlined,
          route: Routes.securityGate,
          requires: [P.gateRead],
        ),
        NavItem(
          label: 'Visitors',
          icon: Icons.badge_outlined,
          route: Routes.securityVisitors,
          requires: [P.visitorRecord],
        ),
        NavItem(
          label: 'Incidents',
          icon: Icons.report_gmailerrorred_outlined,
          route: Routes.securityIncidents,
          requires: [P.incidentCreate],
        ),
      ],
      moreMenu: const [
        NavItem(
          label: 'Vehicle log',
          icon: Icons.directions_car_outlined,
          route: Routes.securityVehicles,
          requires: [P.vehicleEntry],
        ),
        NavItem(
          label: 'Staff movement',
          icon: Icons.transfer_within_a_station_outlined,
          route: Routes.securityStaffMovement,
          requires: [P.staffEntry],
        ),
        NavItem(
          label: 'Lost & found',
          icon: Icons.travel_explore_outlined,
          route: Routes.securityLostFound,
          requires: [P.lostFoundRead],
        ),
        ..._commonMore,
      ],
    ),

    // ===================== Deferred modules (placeholders) ================
    StaffRole.accounts: _simple(
      StaffRole.accounts,
      Routes.accounts,
      'Accounts & Finance',
      'Accounts',
      Icons.account_balance_outlined,
      requires: [P.financeRead],
    ),
    StaffRole.salesManager: _simple(
      StaffRole.salesManager,
      Routes.sales,
      'Sales CRM',
      'Sales',
      Icons.trending_up_outlined,
      requires: [P.leadRead],
    ),
    StaffRole.travelDesk: _simple(
      StaffRole.travelDesk,
      Routes.travelDesk,
      'Travel Desk',
      'Travel desk',
      Icons.map_outlined,
      requires: [P.tripRead],
    ),
    StaffRole.housekeepingSupervisor: RoleConfig(
      role: StaffRole.housekeepingSupervisor,
      homeRoute: Routes.housekeeping,
      homeModuleLabel: 'Housekeeping Board',
      bottomNav: const [
        NavItem(
          label: 'Board',
          icon: Icons.dashboard_customize_outlined,
          route: Routes.housekeeping,
          requires: [P.housekeepingRead],
        ),
        NavItem(
          label: 'Tasks',
          icon: Icons.checklist_outlined,
          route: Routes.myTasks,
          requires: [P.taskRead],
        ),
      ],
      moreMenu: _commonMore,
    ),
    StaffRole.technician: _simple(
      StaffRole.technician,
      Routes.myWorkOrders,
      'My Work Orders',
      'My work',
      Icons.handyman_outlined,
      requires: [P.maintenanceRead],
    ),
    StaffRole.spaManager: _simple(
      StaffRole.spaManager,
      Routes.spa,
      'Spa Dashboard',
      'Spa',
      Icons.spa_outlined,
      requires: [P.spaRead],
    ),
    StaffRole.spaAccounts: _simple(
      StaffRole.spaAccounts,
      Routes.spaBookings,
      'Spa Accounts',
      'Spa billing',
      Icons.receipt_long_outlined,
      requires: [P.spaBookingRead],
    ),
    StaffRole.spaStaff: _simple(
      StaffRole.spaStaff,
      Routes.spaAppointments,
      'My Appointments',
      'Appointments',
      Icons.event_available_outlined,
      requires: [P.spaBookingRead],
    ),
    StaffRole.restaurantManager: _simple(
      StaffRole.restaurantManager,
      Routes.restaurant,
      'Restaurant Dashboard',
      'Restaurant',
      Icons.restaurant_outlined,
      requires: [P.restaurantRead],
    ),
    StaffRole.cashier: _simple(
      StaffRole.cashier,
      Routes.pos,
      'Point of Sale',
      'POS',
      Icons.point_of_sale_outlined,
      requires: [P.posOperate],
    ),
    StaffRole.waiter: _simple(
      StaffRole.waiter,
      Routes.myTables,
      'My Tables',
      'My tables',
      Icons.table_restaurant_outlined,
      requires: [P.tableRead],
    ),
    StaffRole.chef: _simple(
      StaffRole.chef,
      Routes.kitchen,
      'Kitchen Display',
      'Kitchen',
      Icons.soup_kitchen_outlined,
      requires: [P.kotRead],
    ),
    StaffRole.cleaner: _simple(
      StaffRole.cleaner,
      Routes.restaurantCleaning,
      'Cleaning Tasks',
      'Cleaning',
      Icons.cleaning_services_outlined,
      requires: [P.taskRead],
    ),
    StaffRole.inventoryStoreManager: _simple(
      StaffRole.inventoryStoreManager,
      Routes.inventory,
      'Inventory & Store',
      'Stock',
      Icons.inventory_2_outlined,
      requires: [P.inventoryRead],
    ),
    StaffRole.securityManager: _simple(
      StaffRole.securityManager,
      Routes.securityManager,
      'Security Dashboard',
      'Security',
      Icons.shield_outlined,
      requires: [P.incidentRead],
    ),
    StaffRole.driver: _simple(
      StaffRole.driver,
      Routes.driver,
      'My Trips',
      'Trips',
      Icons.local_taxi_outlined,
      requires: [P.tripRead],
    ),
    StaffRole.eventManager: _simple(
      StaffRole.eventManager,
      Routes.events,
      'Events & Banquets',
      'Events',
      Icons.celebration_outlined,
      requires: [P.eventRead],
    ),

    // ============================== Fallback ==============================
    StaffRole.unknown: RoleConfig(
      role: StaffRole.unknown,
      homeRoute: Routes.profile,
      homeModuleLabel: 'Home',
      bottomNav: const [
        NavItem(
          label: 'Profile',
          icon: Icons.person_outline,
          route: Routes.profile,
        ),
      ],
      moreMenu: const [_notificationsItem],
    ),
  };
}

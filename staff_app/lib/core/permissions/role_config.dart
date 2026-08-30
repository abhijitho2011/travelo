import 'package:flutter/material.dart';

import '../routing/routes.dart';
import 'permission_keys.dart';
import 'permission_set.dart';

/// The 24 operational roles the unified staff app can sign in as.
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
  hr('HR', 'HR', 'Human Resources'),
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

  /// Hotel management is appointed by the Owner, so nobody inside the property
  /// may create either management role.
  static const Set<StaffRole> _managementRoles = {
    StaffRole.generalManager,
    StaffRole.assistantGeneralManager,
  };

  /// Roles the server grants `staff.create`. Mirrors the permission map in
  /// `src/modules/staff-auth/role-permissions.ts`.
  static const Set<StaffRole> _roleCreators = {
    StaffRole.generalManager,
    StaffRole.assistantGeneralManager,
    StaffRole.hr,
  };

  /// Actors that may not create their own role. HR is a hiring authority;
  /// letting it clone itself would grow that authority with no manager
  /// deciding to.
  static const Set<StaffRole> _selfExcludingActors = {StaffRole.hr};

  /// Every role [actor] may create — the client mirror of `creatableRolesFor`
  /// in `src/modules/staff-auth/role-creation.ts`.
  ///
  /// The server is the authority and rejects anything outside this set with
  /// `ROLE_NOT_ASSIGNABLE` / `ROLE_NOT_PERMITTED`. This exists so the Add-staff
  /// dropdown never offers a choice the API will refuse.
  ///
  ///   GM / AGM → everything except GM and AGM (HR included)
  ///   HR       → everything except GM, AGM and HR itself
  ///   anyone else → nothing
  static List<StaffRole> creatableRolesFor(StaffRole actor) {
    if (!_roleCreators.contains(actor)) return const <StaffRole>[];
    return StaffRole.values
        .where(
          (r) =>
              r != StaffRole.unknown &&
              !_managementRoles.contains(r) &&
              !(_selfExcludingActors.contains(actor) && r == actor),
        )
        .toList(growable: false);
  }

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
    this.extraRoutes = const <String>{},
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

  /// Routes reachable by this role that are NOT nav destinations — detail
  /// screens and management pages opened from a button. They widen
  /// [allowedRoutes] (so the RoleGuard admits them) without adding a tab; each
  /// screen still gates its own actions with a PermissionGate.
  final Set<String> extraRoutes;

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
    ...extraRoutes,
    ..._alwaysAllowed,
  };

  static const Set<String> _alwaysAllowed = {
    Routes.profile,
    Routes.notifications,
    Routes.support,
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
  static const _supportItem = NavItem(
    label: 'Help & support',
    icon: Icons.help_outline,
    route: Routes.support,
  );

  /// The tail every More menu ends with. No role may have an empty More list —
  /// the shell hides the More destination entirely rather than opening an
  /// empty sheet, and these three make sure it never has to.
  static const List<NavItem> _commonMore = [
    _notificationsItem,
    _profileItem,
    _supportItem,
  ];

  /// The same tail minus Profile, for roles that already carry Profile as a
  /// primary destination — a duplicate entry in the sheet only confuses.
  static const List<NavItem> _commonMoreNoProfile = [
    _notificationsItem,
    _supportItem,
  ];

  /// A one-destination role: its module, any secondary modules its permissions
  /// already reach, and the common items.
  static RoleConfig _simple(
    StaffRole role,
    String route,
    String moduleLabel,
    String navLabel,
    IconData icon, {
    List<String> requires = const [],
    List<NavItem> more = const <NavItem>[],
    bool built = false,
    Set<String> extraRoutes = const <String>{},
  }) => RoleConfig(
    role: role,
    homeRoute: route,
    homeModuleLabel: moduleLabel,
    built: built,
    extraRoutes: extraRoutes,
    bottomNav: [
      NavItem(label: navLabel, icon: icon, route: route, requires: requires),
    ],
    moreMenu: [...more, ..._commonMore],
  );

  // Secondary destinations reused across several roles' More menus. Each one
  // is gated on the permission its owning role actually holds, so a role that
  // loses the permission loses the entry without any edit here.
  static const _bookingsMore = NavItem(
    label: 'Bookings',
    icon: Icons.event_note_outlined,
    route: Routes.reservations,
    requires: [P.reservationRead],
  );
  /// The room inventory. Every role the server grants `room.read` carries this
  /// entry; the gate on the item, not a role list, is what decides who sees it.
  static const _roomsMore = NavItem(
    label: 'Rooms',
    icon: Icons.meeting_room_outlined,
    route: Routes.rooms,
    requires: [P.roomRead],
  );

  /// The catalogue behind the rooms. Only GM and AGM hold `roomtype.read`, so
  /// only they ever see it — no role check needed to arrange that.
  static const _roomTypesMore = NavItem(
    label: 'Room types',
    icon: Icons.bed_outlined,
    route: Routes.roomTypes,
    requires: [P.roomTypeRead],
  );
  static const _myTasksMore = NavItem(
    label: 'My tasks',
    icon: Icons.checklist_outlined,
    route: Routes.myTasks,
    requires: [P.taskRead],
  );
  static const _inventoryMore = NavItem(
    label: 'Inventory',
    icon: Icons.inventory_2_outlined,
    route: Routes.inventory,
    requires: [P.inventoryRead],
  );
  static const _lostFoundMore = NavItem(
    label: 'Lost & found',
    icon: Icons.travel_explore_outlined,
    route: Routes.securityLostFound,
    requires: [P.lostFoundRead],
  );
  static const _eventsMore = NavItem(
    label: 'Events',
    icon: Icons.celebration_outlined,
    route: Routes.events,
    requires: [P.eventRead],
  );
  static const _spaBookingsMore = NavItem(
    label: 'Spa bookings',
    icon: Icons.event_available_outlined,
    route: Routes.spaBookings,
    requires: [P.spaBookingRead],
  );
  static const _spaMore = NavItem(
    label: 'Spa',
    icon: Icons.spa_outlined,
    route: Routes.spa,
    requires: [P.spaRead],
  );
  static const _posMore = NavItem(
    label: 'POS',
    icon: Icons.point_of_sale_outlined,
    route: Routes.pos,
    requires: [P.posOperate],
  );
  static const _myTablesMore = NavItem(
    label: 'Tables',
    icon: Icons.table_restaurant_outlined,
    route: Routes.myTables,
    requires: [P.tableRead],
  );
  static const _kitchenMore = NavItem(
    label: 'Kitchen',
    icon: Icons.soup_kitchen_outlined,
    route: Routes.kitchen,
    requires: [P.kotRead],
  );

  // ---------------------------------------------------------------------
  // The map. All 24 roles.
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
        _roomsMore,
        _roomTypesMore,
        NavItem(
          label: 'Housekeeping',
          icon: Icons.cleaning_services_outlined,
          route: Routes.housekeeping,
          requires: [P.housekeepingRead],
        ),
        NavItem(
          label: 'Maintenance',
          icon: Icons.build_outlined,
          route: Routes.workOrders,
          requires: [P.workOrderRead],
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
        _roomsMore,
        _roomTypesMore,
        NavItem(
          label: 'Housekeeping',
          icon: Icons.cleaning_services_outlined,
          route: Routes.housekeeping,
          requires: [P.housekeepingRead],
        ),
        NavItem(
          label: 'Maintenance',
          icon: Icons.build_outlined,
          route: Routes.workOrders,
          requires: [P.workOrderRead],
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

    // ============================== HR (BUILT) ============================
    // HR reuses the management Team module wholesale — same screen, same
    // widgets. What differs is the permission set the server returns: HR holds
    // staff.read/create/update but NOT staff.approve, so the Approve button in
    // TeamScreen simply never renders, and every account HR raises waits in
    // "Submitted" until a GM or AGM signs it off.
    StaffRole.hr: RoleConfig(
      role: StaffRole.hr,
      homeRoute: Routes.team,
      homeModuleLabel: 'Staff Directory',
      built: true,
      bottomNav: const [
        NavItem(
          label: 'Team',
          icon: Icons.groups_outlined,
          route: Routes.team,
          requires: [P.staffRead],
        ),
        NavItem(
          label: 'Submitted',
          icon: Icons.hourglass_top_outlined,
          route: Routes.teamPending,
          requires: [P.staffRead],
        ),
        NavItem(
          label: 'Profile',
          icon: Icons.person_outline,
          route: Routes.profile,
        ),
      ],
      moreMenu: _commonMoreNoProfile,
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
      // The desk sees the board and may move a room's status; it holds none of
      // room.create/update/delete, so every other control on that screen gates
      // itself away without this config saying a word about it.
      moreMenu: const [_roomsMore, ..._commonMore],
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
      moreMenu: const [_roomsMore, ..._commonMoreNoProfile],
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
      moreMenu: _commonMoreNoProfile,
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

    // ===================== Operations domains (BUILT) =====================
    StaffRole.accounts: _simple(
      StaffRole.accounts,
      Routes.accounts,
      'Accounts & Finance',
      'Accounts',
      Icons.account_balance_outlined,
      built: true,
      requires: [P.financeRead],
      more: const [_bookingsMore],
      // The expense register, reached from the dashboard.
      extraRoutes: const {Routes.accountsExpenses},
    ),
    StaffRole.salesManager: _simple(
      StaffRole.salesManager,
      Routes.sales,
      'Sales CRM',
      'Sales',
      Icons.trending_up_outlined,
      built: true,
      requires: [P.leadRead],
      more: const [_bookingsMore, _eventsMore],
      // A lead opened from the pipeline board.
      extraRoutes: const {Routes.salesLeadPattern},
    ),
    StaffRole.travelDesk: _simple(
      StaffRole.travelDesk,
      Routes.travelDesk,
      'Travel Desk',
      'Travel desk',
      Icons.map_outlined,
      built: true,
      requires: [P.transportRead],
      more: const [_bookingsMore, _myTasksMore],
      // The vehicle fleet, reached from the dashboard.
      extraRoutes: const {Routes.travelDeskVehicles},
    ),
    StaffRole.housekeepingSupervisor: RoleConfig(
      role: StaffRole.housekeepingSupervisor,
      homeRoute: Routes.housekeeping,
      homeModuleLabel: 'Housekeeping Board',
      built: true,
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
          route: Routes.housekeepingTasks,
          requires: [P.taskRead],
        ),
        NavItem(
          label: 'Maintenance',
          icon: Icons.build_outlined,
          route: Routes.workOrders,
          requires: [P.workOrderRead],
        ),
      ],
      moreMenu: const [
        _roomsMore,
        _inventoryMore,
        _lostFoundMore,
        ..._commonMore,
      ],
    ),
    // The technician drives the maintenance queue: their own jobs first, the
    // whole queue behind it. Every lifecycle control gates itself on its
    // workorder.* permission, so the surface never offers an action the API
    // would refuse.
    StaffRole.technician: RoleConfig(
      role: StaffRole.technician,
      homeRoute: Routes.myWorkOrders,
      homeModuleLabel: 'My Work Orders',
      built: true,
      bottomNav: const [
        NavItem(
          label: 'My work',
          icon: Icons.handyman_outlined,
          route: Routes.myWorkOrders,
          requires: [P.workOrderRead],
        ),
        NavItem(
          label: 'Work orders',
          icon: Icons.build_outlined,
          route: Routes.workOrders,
          requires: [P.workOrderRead],
        ),
      ],
      moreMenu: const [_roomsMore, _myTasksMore, ..._commonMore],
    ),
    StaffRole.spaManager: _simple(
      StaffRole.spaManager,
      Routes.spa,
      'Spa Dashboard',
      'Spa',
      Icons.spa_outlined,
      requires: [P.spaRead],
      more: const [_spaBookingsMore, _myTasksMore, _inventoryMore],
    ),
    StaffRole.spaAccounts: _simple(
      StaffRole.spaAccounts,
      Routes.spaBookings,
      'Spa Accounts',
      'Spa billing',
      Icons.receipt_long_outlined,
      requires: [P.spaBookingRead],
      more: const [_spaMore],
    ),
    StaffRole.spaStaff: _simple(
      StaffRole.spaStaff,
      Routes.spaAppointments,
      'My Appointments',
      'Appointments',
      Icons.event_available_outlined,
      requires: [P.spaBookingRead],
      more: const [_myTasksMore],
    ),
    StaffRole.restaurantManager: _simple(
      StaffRole.restaurantManager,
      Routes.restaurant,
      'Restaurant Dashboard',
      'Restaurant',
      Icons.restaurant_outlined,
      built: true,
      requires: [P.restaurantRead],
      more: const [_posMore, _myTablesMore, _kitchenMore, _inventoryMore],
      // Menu, tables and any order the manager drills into — reached from
      // buttons on the dashboard, not from a tab.
      extraRoutes: const {
        Routes.restaurantMenu,
        Routes.restaurantTables,
        Routes.restaurantOrders,
      },
    ),
    StaffRole.cashier: _simple(
      StaffRole.cashier,
      Routes.pos,
      'Point of Sale',
      'POS',
      Icons.point_of_sale_outlined,
      built: true,
      requires: [P.posOperate],
      more: const [_myTablesMore],
      // The bill detail the cashier opens to settle an order.
      extraRoutes: const {Routes.restaurantOrders},
    ),
    StaffRole.waiter: _simple(
      StaffRole.waiter,
      Routes.myTables,
      'My Tables',
      'My tables',
      Icons.table_restaurant_outlined,
      built: true,
      requires: [P.tableRead],
      more: const [_kitchenMore, _myTasksMore],
      // The running order screen a waiter opens from a table.
      extraRoutes: const {Routes.restaurantOrders},
    ),
    StaffRole.chef: _simple(
      StaffRole.chef,
      Routes.kitchen,
      'Kitchen Display',
      'Kitchen',
      Icons.soup_kitchen_outlined,
      built: true,
      requires: [P.kotRead],
      more: const [_inventoryMore, _myTasksMore],
    ),
    StaffRole.cleaner: _simple(
      StaffRole.cleaner,
      Routes.restaurantCleaning,
      'Cleaning Tasks',
      'Cleaning',
      Icons.cleaning_services_outlined,
      requires: [P.taskRead],
      more: const [_myTasksMore],
    ),
    StaffRole.inventoryStoreManager: _simple(
      StaffRole.inventoryStoreManager,
      Routes.inventory,
      'Inventory & Store',
      'Stock',
      Icons.inventory_2_outlined,
      built: true,
      requires: [P.inventoryRead],
      // Items, movements and the PO lifecycle, reached from the dashboard.
      extraRoutes: const {
        Routes.inventoryItems,
        Routes.inventoryMovements,
        Routes.inventoryPurchaseOrders,
      },
    ),
    StaffRole.securityManager: _simple(
      StaffRole.securityManager,
      Routes.securityManager,
      'Security Dashboard',
      'Security',
      Icons.shield_outlined,
      requires: [P.incidentRead],
      more: const [
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
          requires: [P.visitorRead],
        ),
        NavItem(
          label: 'Incidents',
          icon: Icons.report_gmailerrorred_outlined,
          route: Routes.securityIncidents,
          requires: [P.incidentRead],
        ),
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
        _lostFoundMore,
      ],
    ),
    StaffRole.driver: _simple(
      StaffRole.driver,
      Routes.driver,
      'My Trips',
      'Trips',
      Icons.local_taxi_outlined,
      built: true,
      requires: [P.transportRead],
      more: const [_myTasksMore],
      // A trip opened from the list.
      extraRoutes: const {Routes.driverTripPattern},
    ),
    StaffRole.eventManager: _simple(
      StaffRole.eventManager,
      Routes.events,
      'Events & Banquets',
      'Events',
      Icons.celebration_outlined,
      requires: [P.eventRead],
      more: const [_bookingsMore, _myTasksMore],
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
      moreMenu: _commonMoreNoProfile,
    ),
  };
}

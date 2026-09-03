import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/accounts/presentation/accounts_screen.dart';
import '../../features/accounts/presentation/expenses_screen.dart';
import '../../features/auth/presentation/access_denied_screen.dart';
import '../../features/auth/presentation/account_status_screen.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/otp_screen.dart';
import '../../features/auth/presentation/session_expired_screen.dart';
import '../../features/auth/presentation/welcome_screen.dart';
import '../../features/dashboard/presentation/home_redirect.dart';
import '../../features/driver/presentation/driver_screen.dart';
import '../../features/driver/presentation/driver_trip_screen.dart';
import '../../features/events/presentation/events_screen.dart';
import '../../features/events/presentation/event_detail_screen.dart';
import '../../features/housekeeping/presentation/housekeeping_board_screen.dart';
import '../../features/housekeeping/presentation/housekeeping_tasks_screen.dart';
import '../../features/housekeeping/presentation/my_tasks_screen.dart';
import '../../features/housekeeping/presentation/task_detail_screen.dart';
import '../../features/inventory/presentation/inventory_screen.dart';
import '../../features/inventory/presentation/inventory_items_screen.dart';
import '../../features/inventory/presentation/stock_movements_screen.dart';
import '../../features/inventory/presentation/suppliers_screen.dart';
import '../../features/inventory/presentation/purchase_orders_screen.dart';
import '../../features/inventory/presentation/purchase_order_detail_screen.dart';
import '../../features/maintenance/presentation/my_work_orders_screen.dart';
import '../../features/maintenance/presentation/work_orders_screen.dart';
import '../../features/maintenance/presentation/work_order_detail_screen.dart';
import '../../features/management/presentation/add_staff_screen.dart';
import '../../features/management/presentation/approvals_screen.dart';
import '../../features/management/presentation/management_dashboard_screen.dart';
import '../../features/management/presentation/pending_approvals_screen.dart';
import '../../features/management/presentation/team_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';
import '../../features/reception/presentation/check_in_screen.dart';
import '../../features/reception/presentation/reception_dashboard_screen.dart';
import '../../features/reception/data/reception_models.dart'
    show NewBookingSeed;
import '../../features/reception/presentation/reservation_calendar_screen.dart';
import '../../features/reception/presentation/reservation_detail_screen.dart';
import '../../features/reception/presentation/reservation_form_screen.dart';
import '../../features/reception/presentation/reservations_screen.dart';
import '../../features/restaurant/presentation/kitchen_screen.dart';
import '../../features/restaurant/presentation/my_tables_screen.dart';
import '../../features/restaurant/presentation/pos_screen.dart';
import '../../features/restaurant/presentation/restaurant_cleaning_screen.dart';
import '../../features/restaurant/presentation/restaurant_screen.dart';
import '../../features/restaurant/presentation/order_screen.dart';
import '../../features/restaurant/presentation/orders_screen.dart';
import '../../features/restaurant/presentation/menu_management_screen.dart';
import '../../features/restaurant/presentation/tables_management_screen.dart';
import '../../features/rooms/presentation/bulk_rooms_screen.dart';
import '../../features/rooms/presentation/room_type_workspace_screen.dart';
import '../../features/rooms/presentation/units_screen.dart';
import '../../features/rooms/presentation/rooms_screen.dart';
import '../../features/property_settings/presentation/property_settings_screen.dart';
import '../../features/property_settings/presentation/catalogue_screens.dart';
import '../../features/rates/presentation/rates_grid_screen.dart';
import '../../features/reports/presentation/reports_screen.dart';
import '../../features/accounts/presentation/ledger_screens.dart';
import '../../features/sales/presentation/sales_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../../features/sales/presentation/lead_detail_screen.dart';
import '../../features/security/presentation/gate_log_screen.dart';
import '../../features/security/presentation/gate_screen.dart';
import '../../features/security/presentation/incidents_screen.dart';
import '../../features/security/presentation/lost_found_screen.dart';
import '../../features/security/presentation/security_manager_screen.dart';
import '../../features/security/presentation/security_roster_screen.dart';
import '../../features/security/presentation/visitors_screen.dart';
import '../../features/spa/presentation/spa_appointments_screen.dart';
import '../../features/spa/presentation/spa_bookings_screen.dart';
import '../../features/spa/presentation/spa_screen.dart';
import '../../features/spa/presentation/spa_services_screen.dart';
import '../../features/support/presentation/support_screen.dart';
import '../../features/travel_desk/presentation/travel_desk_screen.dart';
import '../../features/travel_desk/presentation/vehicles_screen.dart';
import '../providers.dart';
import '../widgets/app_shell.dart';
import 'guards.dart';
import 'routes.dart';

/// Re-runs the router's redirect whenever the session changes.
class _AuthRefresh extends ChangeNotifier {
  _AuthRefresh(this._ref) {
    _ref.listen(authControllerProvider, (_, _) => notifyListeners());
  }

  final Ref _ref;
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _AuthRefresh(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: Routes.splash,
    refreshListenable: refresh,
    debugLogDiagnostics: kDebugMode,

    // The one and only guard chain: AuthGuard → AccountStatusGuard →
    // FirstLoginGuard → RoleGuard → PermissionGuard. No screen repeats it.
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      return applyGuards(
        GuardContext(
          location: state.uri.path,
          auth: auth,
          config: ref.read(roleConfigProvider),
          permissions: ref.read(permissionsProvider),
        ),
      );
    },

    routes: [
      // ------------------------------------------------ unauthenticated ---
      GoRoute(path: Routes.splash, builder: (_, _) => const HomeRedirect()),
      GoRoute(path: Routes.login, builder: (_, _) => const LoginScreen()),
      GoRoute(path: Routes.otp, builder: (_, _) => const OtpScreen()),
      GoRoute(
        path: Routes.accountStatus,
        builder: (_, _) => const AccountStatusScreen(),
      ),
      GoRoute(
        path: Routes.sessionExpired,
        builder: (_, _) => const SessionExpiredScreen(),
      ),

      // --------------------------------------------- full-screen, in-app ---
      GoRoute(path: Routes.welcome, builder: (_, _) => const WelcomeScreen()),
      GoRoute(
        path: Routes.accessDenied,
        builder: (_, _) => const AccessDeniedScreen(),
      ),

      // ------------------------------------------------- inside the shell ---
      ShellRoute(
        builder: (_, _, child) => AppShell(child: child),
        routes: [
          // Management (built)
          GoRoute(
            path: Routes.management,
            builder: (_, _) => const ManagementDashboardScreen(),
          ),
          GoRoute(
            path: Routes.approvals,
            builder: (_, _) => const ApprovalsScreen(),
          ),
          GoRoute(path: Routes.team, builder: (_, _) => const TeamScreen()),
          GoRoute(
            path: Routes.teamNew,
            builder: (_, _) => const AddStaffScreen(),
          ),
          GoRoute(
            path: Routes.teamPending,
            builder: (_, _) => const PendingApprovalsScreen(),
          ),

          // Reception (built)
          GoRoute(
            path: Routes.reception,
            builder: (_, _) => const ReceptionDashboardScreen(),
          ),
          GoRoute(
            path: Routes.reservations,
            builder: (_, _) => const ReservationsScreen(),
          ),
          GoRoute(
            path: Routes.reservationCalendar,
            builder: (_, _) => const ReservationCalendarScreen(),
          ),
          // `/reservations/new` before `/reservations/:id`: go_router matches
          // in declaration order, and the pattern would otherwise swallow it.
          GoRoute(
            path: Routes.reservationNew,
            // The calendar seeds the room + date it was started from; `extra`
            // is null on a cold deep link and the form opens blank.
            builder: (_, state) {
              final seed = state.extra is NewBookingSeed
                  ? state.extra as NewBookingSeed
                  : null;
              return ReservationFormScreen(
                initialCheckIn: seed?.checkIn,
                initialRoomId: seed?.roomId,
                initialRoomTypeId: seed?.roomTypeId,
              );
            },
          ),
          GoRoute(
            path: Routes.reservationPattern,
            builder: (_, state) => ReservationDetailScreen(
              reservationId: state.pathParameters['id'] ?? '',
            ),
          ),
          GoRoute(
            path: Routes.checkIn,
            builder: (_, state) => CheckInScreen(
              reservationId: state.uri.queryParameters['reservationId'],
            ),
          ),

          // Rooms & room types (built)
          //
          // `/rooms/new` and `/rooms/bulk` are declared before `/rooms/:id` so
          // the literal paths win — go_router matches in declaration order,
          // and the pattern would otherwise swallow both.
          GoRoute(path: Routes.rooms, builder: (_, _) => const RoomsScreen()),

          // Property configuration + the rates grid (management)
          GoRoute(
            path: Routes.propertySettings,
            builder: (_, _) => const PropertySettingsScreen(),
          ),
          GoRoute(
            path: Routes.propertyTaxes,
            builder: (_, _) => const TaxesScreen(),
          ),
          GoRoute(
            path: Routes.propertyPolicies,
            builder: (_, _) => const PoliciesScreen(),
          ),
          GoRoute(
            path: Routes.propertyAddons,
            builder: (_, _) => const AddonsScreen(),
          ),
          GoRoute(
            path: Routes.propertySources,
            builder: (_, _) => const BookingSourcesScreen(),
          ),
          GoRoute(
            path: Routes.propertyCoupons,
            builder: (_, _) => const CouponsScreen(),
          ),
          GoRoute(
            path: Routes.accountsCash,
            builder: (_, _) => const CashTrackerScreen(),
          ),
          GoRoute(
            path: Routes.accountsCorporate,
            builder: (_, _) => const CorporateAccountsScreen(),
          ),
          GoRoute(
            path: Routes.accountsCorporatePattern,
            builder: (_, state) => CorporateStatementScreen(
              accountId: state.pathParameters['id']!,
            ),
          ),
          GoRoute(
            path: Routes.rates,
            builder: (_, _) => const RatesGridScreen(),
          ),
          GoRoute(
            path: Routes.reports,
            builder: (_, _) => const ReportsScreen(),
          ),
          // Room-first: adding a room opens the full workspace, where the
          // room's own specifications, photos and rates live. There is no
          // separate "create the type first" step.
          GoRoute(
            path: Routes.roomNew,
            builder: (_, _) => const RoomTypeWorkspaceScreen(newRoom: true),
          ),
          GoRoute(
            path: Routes.roomBulk,
            builder: (_, _) => const BulkRoomsScreen(),
          ),
          GoRoute(
            path: Routes.roomPattern,
            builder: (_, state) =>
                RoomTypeWorkspaceScreen(roomId: state.pathParameters['id']),
          ),
          GoRoute(
            path: Routes.roomTypes,
            builder: (_, _) => const UnitsScreen(),
          ),
          GoRoute(
            path: Routes.roomTypeNew,
            // `duplicateOf` seeds the form from an existing type; the copy is
            // still saved as a brand-new record.
            builder: (_, state) => RoomTypeWorkspaceScreen(
              duplicateOfId: state.uri.queryParameters['duplicateOf'],
            ),
          ),
          GoRoute(
            path: Routes.roomTypePattern,
            builder: (_, state) =>
                RoomTypeWorkspaceScreen(roomTypeId: state.pathParameters['id']),
          ),

          // Room attendant / cleaning staff (built)
          GoRoute(
            path: Routes.myTasks,
            builder: (_, _) => const MyTasksScreen(),
          ),
          GoRoute(
            path: Routes.taskPattern,
            builder: (_, state) =>
                TaskDetailScreen(taskId: state.pathParameters['id'] ?? ''),
          ),

          // Security staff / gate (built)
          GoRoute(
            path: Routes.securityGate,
            builder: (_, _) => const GateScreen(),
          ),
          GoRoute(
            path: Routes.securityVehicles,
            builder: (_, _) => const GateLogScreen(vehicles: true),
          ),
          GoRoute(
            path: Routes.securityStaffMovement,
            builder: (_, _) => const GateLogScreen(vehicles: false),
          ),
          GoRoute(
            path: Routes.securityVisitors,
            builder: (_, _) => const VisitorsScreen(),
          ),
          GoRoute(
            path: Routes.securityLostFound,
            builder: (_, _) => const LostFoundScreen(),
          ),
          GoRoute(
            path: Routes.securityIncidents,
            builder: (_, _) => const IncidentsScreen(),
          ),

          // Common
          GoRoute(
            path: Routes.profile,
            builder: (_, _) => const ProfileScreen(),
          ),
          GoRoute(
            path: Routes.notifications,
            builder: (_, _) => const NotificationsScreen(),
          ),
          GoRoute(
            path: Routes.support,
            builder: (_, _) => const SupportScreen(),
          ),
          GoRoute(
            path: Routes.settings,
            builder: (_, _) => const SettingsScreen(),
          ),

          // ------------------- operations domains ---------------------------
          GoRoute(
            path: Routes.accounts,
            builder: (_, _) => const AccountsScreen(),
          ),
          GoRoute(
            path: Routes.accountsExpenses,
            builder: (_, _) => const ExpensesScreen(),
          ),
          GoRoute(path: Routes.sales, builder: (_, _) => const SalesScreen()),
          GoRoute(
            path: Routes.salesLeadPattern,
            builder: (_, state) =>
                LeadDetailScreen(leadId: state.pathParameters['id'] ?? ''),
          ),
          GoRoute(
            path: Routes.travelDesk,
            builder: (_, _) => const TravelDeskScreen(),
          ),
          GoRoute(
            path: Routes.travelDeskVehicles,
            builder: (_, _) => const VehiclesScreen(),
          ),
          GoRoute(
            path: Routes.housekeeping,
            builder: (_, _) => const HousekeepingBoardScreen(),
          ),
          GoRoute(
            path: Routes.housekeepingTasks,
            builder: (_, _) => const HousekeepingTasksScreen(),
          ),
          GoRoute(
            path: Routes.maintenance,
            builder: (_, _) => const WorkOrdersScreen(),
          ),
          GoRoute(
            path: Routes.workOrders,
            builder: (_, _) => const WorkOrdersScreen(),
          ),
          GoRoute(
            path: Routes.myWorkOrders,
            builder: (_, _) => const MyWorkOrdersScreen(),
          ),
          GoRoute(
            path: Routes.workOrderPattern,
            builder: (_, state) =>
                WorkOrderDetailScreen(id: state.pathParameters['id'] ?? ''),
          ),
          GoRoute(path: Routes.spa, builder: (_, _) => const SpaScreen()),
          GoRoute(
            path: Routes.spaAppointments,
            builder: (_, _) => const SpaAppointmentsScreen(),
          ),
          GoRoute(
            path: Routes.spaBookings,
            builder: (_, _) => const SpaBookingsScreen(),
          ),
          GoRoute(
            path: Routes.spaServices,
            builder: (_, _) => const SpaServicesScreen(),
          ),
          GoRoute(
            path: Routes.restaurant,
            builder: (_, _) => const RestaurantScreen(),
          ),
          GoRoute(path: Routes.pos, builder: (_, _) => const PosScreen()),
          GoRoute(
            path: Routes.myTables,
            builder: (_, _) => const MyTablesScreen(),
          ),
          GoRoute(
            path: Routes.kitchen,
            builder: (_, _) => const KitchenScreen(),
          ),
          GoRoute(
            path: Routes.restaurantMenu,
            builder: (_, _) => const MenuManagementScreen(),
          ),
          GoRoute(
            path: Routes.restaurantTables,
            builder: (_, _) => const TablesManagementScreen(),
          ),
          GoRoute(
            path: Routes.restaurantOrders,
            builder: (_, _) => const RestaurantOrdersScreen(),
          ),
          GoRoute(
            path: Routes.restaurantOrderPattern,
            builder: (_, state) =>
                OrderScreen(orderId: state.pathParameters['id'] ?? ''),
          ),
          GoRoute(
            path: Routes.restaurantCleaning,
            builder: (_, _) => const RestaurantCleaningScreen(),
          ),
          GoRoute(
            path: Routes.inventory,
            builder: (_, _) => const InventoryScreen(),
          ),
          GoRoute(
            path: Routes.inventoryItems,
            builder: (_, _) => const InventoryItemsScreen(),
          ),
          GoRoute(
            path: Routes.inventorySuppliers,
            builder: (_, _) => const SuppliersScreen(),
          ),
          GoRoute(
            path: Routes.inventoryMovements,
            builder: (_, _) => const StockMovementsScreen(),
          ),
          GoRoute(
            path: Routes.inventoryPurchaseOrders,
            builder: (_, _) => const PurchaseOrdersScreen(),
          ),
          GoRoute(
            path: Routes.inventoryPoPattern,
            builder: (_, state) => PurchaseOrderDetailScreen(
              poId: state.pathParameters['id'] ?? '',
            ),
          ),
          GoRoute(
            path: Routes.securityManager,
            builder: (_, _) => const SecurityManagerScreen(),
          ),
          GoRoute(
            path: Routes.securityRoster,
            builder: (_, _) => const SecurityRosterScreen(),
          ),
          GoRoute(path: Routes.driver, builder: (_, _) => const DriverScreen()),
          GoRoute(
            path: Routes.driverTripPattern,
            builder: (_, state) =>
                DriverTripScreen(tripId: state.pathParameters['id'] ?? ''),
          ),
          GoRoute(path: Routes.events, builder: (_, _) => const EventsScreen()),
          GoRoute(
            path: Routes.eventPattern,
            builder: (_, state) =>
                EventDetailScreen(eventId: state.pathParameters['id'] ?? ''),
          ),
        ],
      ),
    ],

    errorBuilder: (_, _) => const AccessDeniedScreen(),
  );
});

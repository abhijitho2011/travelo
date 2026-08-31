import 'package:flutter_test/flutter_test.dart';
import 'package:tavelo_staff/core/permissions/permission_keys.dart';
import 'package:tavelo_staff/core/permissions/role_config.dart';
import 'package:tavelo_staff/core/routing/routes.dart';
import 'package:tavelo_staff/features/accounts/data/accounts_models.dart';
import 'package:tavelo_staff/features/inventory/data/inventory_models.dart';
import 'package:tavelo_staff/features/sales/data/sales_models.dart';
import 'package:tavelo_staff/features/travel_desk/data/transport_models.dart';

/// The five operations domains on the client: wire round-trips, the state-machine
/// moves each screen will offer, and that the roles are marked built and reach
/// their own sub-routes.
void main() {
  group('enum wire round-trips', () {
    test('expense status + category survive the wire', () {
      for (final s in ExpenseStatus.values) {
        expect(ExpenseStatus.fromWire(s.wire), s, reason: s.wire);
      }
      for (final c in ExpenseCategory.values) {
        expect(ExpenseCategory.fromWire(c.wire), c, reason: c.wire);
      }
    });

    test('stock + PO enums survive the wire', () {
      for (final t in StockMovementType.values) {
        expect(StockMovementType.fromWire(t.wire), t, reason: t.wire);
      }
      for (final s in PurchaseOrderStatus.values) {
        expect(PurchaseOrderStatus.fromWire(s.wire), s, reason: s.wire);
      }
    });

    test('lead + activity enums survive the wire', () {
      for (final s in LeadStage.values) {
        expect(LeadStage.fromWire(s.wire), s, reason: s.wire);
      }
      for (final t in SalesActivityType.values) {
        expect(SalesActivityType.fromWire(t.wire), t, reason: t.wire);
      }
    });

    test('transport enums survive the wire', () {
      for (final t in TransportType.values) {
        expect(TransportType.fromWire(t.wire), t, reason: t.wire);
      }
      for (final s in TransportStatus.values) {
        expect(TransportStatus.fromWire(s.wire), s, reason: s.wire);
      }
      for (final s in DriverStage.values) {
        expect(DriverStage.fromWire(s.wire), s, reason: s.wire);
      }
    });

    test('unknown values degrade instead of throwing', () {
      expect(ExpenseStatus.fromWire('TELEPORTED'), ExpenseStatus.draft);
      expect(PurchaseOrderStatus.fromWire(''), PurchaseOrderStatus.draft);
      expect(LeadStage.fromWire(null), LeadStage.lead);
      expect(TransportStatus.fromWire('???'), TransportStatus.requested);
      expect(DriverStage.fromWire(null), isNull);
      expect(StockMovementType.fromWire('in'), StockMovementType.incoming);
    });
  });

  group('client state-machine offerings mirror the server', () {
    test('expense walks DRAFT → APPROVED → PAID and stops', () {
      expect(ExpenseStatus.draft.next, ExpenseStatus.approved);
      expect(ExpenseStatus.approved.next, ExpenseStatus.paid);
      expect(ExpenseStatus.paid.next, isNull);
    });

    test('lead pipeline offers only legal next stages', () {
      expect(LeadStage.lead.nextStages, [LeadStage.contacted, LeadStage.lost]);
      expect(LeadStage.proposal.nextStages, [
        LeadStage.negotiation,
        LeadStage.confirmed,
        LeadStage.lost,
      ]);
      expect(LeadStage.confirmed.nextStages, isEmpty);
      expect(LeadStage.lost.nextStages, isEmpty);
    });

    test('driver step advances with the trip', () {
      TransportRequest at(TransportStatus s, DriverStage? stage) =>
          TransportRequest(
            id: 'x',
            guestName: 'G',
            type: TransportType.pickup,
            status: s,
            driverStage: stage,
          );
      expect(
        at(TransportStatus.assigned, null).nextDriverStep,
        DriverStep.accept,
      );
      expect(
        at(TransportStatus.inProgress, DriverStage.accepted).nextDriverStep,
        DriverStep.onTheWay,
      );
      expect(
        at(TransportStatus.inProgress, DriverStage.arrived).nextDriverStep,
        DriverStep.pickedUp,
      );
      expect(
        at(TransportStatus.inProgress, DriverStage.pickedUp).nextDriverStep,
        DriverStep.complete,
      );
      expect(at(TransportStatus.completed, null).nextDriverStep, isNull);
    });

    test('PO status flags gate the actions the detail screen shows', () {
      expect(PurchaseOrderStatus.draft.isEditable, isTrue);
      expect(PurchaseOrderStatus.sent.canReceive, isTrue);
      expect(PurchaseOrderStatus.draft.canReceive, isFalse);
      expect(PurchaseOrderStatus.received.isEditable, isFalse);
    });
  });

  group('tolerant model parsing', () {
    test('an inventory item computes its own low-stock and value labels', () {
      final item = InventoryItem.fromJson({
        'id': 'i1',
        'name': 'Rice',
        'sku': 'RICE',
        'unit': 'kg',
        'reorderLevel': 10,
        'currentQty': 5,
        'unitCostPaise': 5000,
        'stockValuePaise': 25000,
        'lowStock': true,
      });
      expect(item.lowStock, isTrue);
      expect(item.stockValuePaise, 25000);
    });

    test('an accounts summary reads nested revenue', () {
      final s = AccountsSummary.fromJson({
        'revenue': {
          'roomsPaise': 100000,
          'fnbPaise': 40000,
          'totalPaise': 140000,
        },
        'expensesTodayPaise': 30000,
        'receivablesCount': 3,
        'payablesCount': 2,
      });
      expect(s.roomsPaise, 100000);
      expect(s.totalRevenuePaise, 140000);
      expect(s.payablesCount, 2);
    });
  });

  group('role configs for the five ops domains', () {
    final roles = {
      StaffRole.accounts: Routes.accounts,
      StaffRole.inventoryStoreManager: Routes.inventory,
      StaffRole.salesManager: Routes.sales,
      StaffRole.travelDesk: Routes.travelDesk,
      StaffRole.driver: Routes.driver,
    };

    test('each lands on its home and is marked built', () {
      roles.forEach((role, home) {
        final config = RoleConfig.of(role);
        expect(config.homeRoute, home, reason: role.wire);
        expect(config.built, isTrue, reason: role.wire);
      });
    });

    test('inventory reaches items, movements and purchase orders', () {
      final routes = RoleConfig.of(
        StaffRole.inventoryStoreManager,
      ).allowedRoutes;
      expect(
        routes,
        containsAll([
          Routes.inventoryItems,
          Routes.inventoryMovements,
          Routes.inventoryPurchaseOrders,
        ]),
      );
    });

    test('accounts reaches the expense register', () {
      expect(
        RoleConfig.of(StaffRole.accounts).allowedRoutes,
        contains(Routes.accountsExpenses),
      );
    });

    test('travel desk reaches the vehicle fleet', () {
      expect(
        RoleConfig.of(StaffRole.travelDesk).allowedRoutes,
        contains(Routes.travelDeskVehicles),
      );
    });

    test('the driver home nav is gated on transport.read', () {
      final config = RoleConfig.of(StaffRole.driver);
      final home = config.bottomNav.firstWhere((n) => n.route == Routes.driver);
      expect(home.requires, contains(P.transportRead));
    });
  });
}

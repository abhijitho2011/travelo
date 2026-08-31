import 'package:flutter_test/flutter_test.dart';
import 'package:tavelo_staff/core/permissions/permission_keys.dart';
import 'package:tavelo_staff/core/permissions/permission_set.dart';
import 'package:tavelo_staff/core/permissions/role_config.dart';
import 'package:tavelo_staff/core/routing/guards.dart';
import 'package:tavelo_staff/core/routing/routes.dart';
import 'package:tavelo_staff/core/widgets/status_badge.dart';
import 'package:tavelo_staff/features/restaurant/data/restaurant_models.dart';

/// The restaurant domain on the client: what the wire says, what the app shows,
/// the state-machine moves it will offer, and — the one that matters — that a
/// bill line carries the price it was rung up at, not the live menu price.
void main() {
  group('enum wire round-trips', () {
    test('every table status survives a trip through the wire', () {
      for (final s in RestaurantTableStatus.values) {
        expect(RestaurantTableStatus.fromWire(s.wire), s, reason: s.wire);
      }
    });

    test('every order status survives a trip through the wire', () {
      for (final s in OrderStatus.values) {
        expect(OrderStatus.fromWire(s.wire), s, reason: s.wire);
      }
    });

    test('every KOT status survives a trip through the wire', () {
      for (final s in KotStatus.values) {
        expect(KotStatus.fromWire(s.wire), s, reason: s.wire);
      }
    });

    test('a value arrives however the server spelt it', () {
      expect(KotStatus.fromWire('preparing'), KotStatus.preparing);
      expect(
        KotStatus.fromWire('ROOM-CHARGE'),
        KotStatus.newTicket,
      ); // unknown → NEW
      expect(
        RestaurantTableStatus.fromWire('  occupied '),
        RestaurantTableStatus.occupied,
      );
      expect(PaymentMethod.fromWire('room_charge'), PaymentMethod.roomCharge);
      expect(PaymentMethod.fromWire('UPI'), PaymentMethod.upi);
    });

    test('unknown values degrade instead of throwing', () {
      expect(OrderStatus.fromWire('TELEPORTED'), OrderStatus.open);
      expect(RestaurantTableStatus.fromWire(null), RestaurantTableStatus.open);
      expect(KotStatus.fromWire(''), KotStatus.newTicket);
      expect(PaymentMethod.fromWire('CHEQUE'), isNull);
    });

    test('statuses carry a palette tone that matches their meaning', () {
      expect(RestaurantTableStatus.open.tone, StatusTone.available);
      expect(RestaurantTableStatus.occupied.tone, StatusTone.occupied);
      expect(OrderStatus.paid.tone, StatusTone.healthy);
      expect(KotStatus.ready.tone, StatusTone.healthy);
      expect(KotStatus.cancelled.tone, StatusTone.critical);
    });
  });

  group('KOT transitions the app will offer', () {
    test('the chef starts and readies, never serves or cancels late', () {
      expect(KotStatus.newTicket.chefCanStart, isTrue);
      expect(KotStatus.newTicket.chefCanReady, isTrue);
      expect(KotStatus.preparing.chefCanReady, isTrue);
      expect(KotStatus.ready.chefCanStart, isFalse);
    });

    test('the waiter serves a plated line', () {
      expect(KotStatus.ready.waiterCanServe, isTrue);
      expect(KotStatus.preparing.waiterCanServe, isTrue);
      expect(KotStatus.newTicket.waiterCanServe, isFalse);
    });

    test('a line can be cancelled only while still NEW', () {
      expect(KotStatus.newTicket.canCancel, isTrue);
      expect(KotStatus.preparing.canCancel, isFalse);
      expect(KotStatus.served.canCancel, isFalse);
    });

    test('only NEW/PREPARING/READY are active on the kitchen board', () {
      expect(KotStatus.newTicket.isActiveInKitchen, isTrue);
      expect(KotStatus.preparing.isActiveInKitchen, isTrue);
      expect(KotStatus.ready.isActiveInKitchen, isTrue);
      expect(KotStatus.served.isActiveInKitchen, isFalse);
      expect(KotStatus.cancelled.isActiveInKitchen, isFalse);
    });
  });

  group('price + name snapshots (the correctness core)', () {
    test('an order line reads the SNAPSHOT fields, not a live menu price', () {
      final line = OrderLine.fromJson({
        'id': 'oi-1',
        'name_snapshot': 'Paneer Tikka',
        'price_paise_snapshot': 25000,
        'qty': 2,
        'kot_status': 'SERVED',
        'notes': 'extra spicy',
      });
      expect(line.name, 'Paneer Tikka');
      expect(line.pricePaise, 25000);
      expect(line.qty, 2);
      // Line total derives from the snapshot × qty when the server omits it.
      expect(line.lineTotalPaise, 50000);
      expect(line.notes, 'extra spicy');
    });

    test('it also accepts the camelCase dto shape the API actually sends', () {
      final line = OrderLine.fromJson({
        'id': 'oi-2',
        'name': 'Masala Dosa',
        'pricePaise': 12000,
        'qty': 1,
        'lineTotalPaise': 12000,
        'kotStatus': 'NEW',
      });
      expect(line.name, 'Masala Dosa');
      expect(line.pricePaise, 12000);
      expect(line.lineTotalPaise, 12000);
      expect(line.kotStatus, KotStatus.newTicket);
    });

    test('the running subtotal excludes cancelled lines', () {
      final order = RestaurantOrder.fromJson({
        'id': 'ord-1',
        'orderNumber': 'ORD-00001',
        'status': 'OPEN',
        'guestCount': 2,
        'items': [
          {
            'id': 'a',
            'name': 'A',
            'pricePaise': 10000,
            'qty': 2,
            'kotStatus': 'SERVED',
          },
          {
            'id': 'b',
            'name': 'B',
            'pricePaise': 5000,
            'qty': 1,
            'kotStatus': 'NEW',
          },
          {
            'id': 'c',
            'name': 'C',
            'pricePaise': 99000,
            'qty': 3,
            'kotStatus': 'CANCELLED',
          },
        ],
      });
      // 20000 + 5000, cancelled line ignored.
      expect(order.runningSubtotalPaise, 25000);
      expect(order.activeItemCount, 3);
    });

    test('a takeaway order (no table) reads as such', () {
      final order = RestaurantOrder.fromJson({
        'id': 'ord-2',
        'orderNumber': 'ORD-00002',
        'status': 'OPEN',
        'tableId': null,
        'items': const [],
      });
      expect(order.isTakeaway, isTrue);
      expect(order.where, 'Takeaway');
    });
  });

  group('kitchen ticket timing', () {
    test('a ticket is flagged late once it passes 15 minutes', () {
      final onTime = KitchenTicket.fromJson({
        'orderId': 'o',
        'orderNumber': 'ORD-1',
        'elapsedSeconds': 600,
        'items': const [],
      });
      final late = KitchenTicket.fromJson({
        'orderId': 'o',
        'orderNumber': 'ORD-1',
        'elapsedSeconds': 15 * 60,
        'items': const [],
      });
      expect(onTime.isLate, isFalse);
      expect(late.isLate, isTrue);
    });
  });

  group('cart line → wire', () {
    test('serialises menu item id, qty and notes; drops empty notes', () {
      const item = MenuItem(
        id: 'mi-1',
        categoryId: 'cat-1',
        name: 'Paneer Tikka',
        pricePaise: 25000,
        veg: true,
        status: MenuItemStatus.active,
      );
      expect(const CartLine(item: item, qty: 3, notes: 'no onion').toJson(), {
        'menuItemId': 'mi-1',
        'qty': 3,
        'notes': 'no onion',
      });
      expect(const CartLine(item: item, qty: 1).toJson(), {
        'menuItemId': 'mi-1',
        'qty': 1,
      });
    });
  });

  group('RoleConfig — the four F&B roles', () {
    test('land on the right home and are marked built', () {
      expect(RoleConfig.of(StaffRole.waiter).homeRoute, Routes.myTables);
      expect(RoleConfig.of(StaffRole.chef).homeRoute, Routes.kitchen);
      expect(RoleConfig.of(StaffRole.cashier).homeRoute, Routes.pos);
      expect(
        RoleConfig.of(StaffRole.restaurantManager).homeRoute,
        Routes.restaurant,
      );
      for (final r in [
        StaffRole.waiter,
        StaffRole.chef,
        StaffRole.cashier,
        StaffRole.restaurantManager,
      ]) {
        expect(RoleConfig.of(r).built, isTrue, reason: r.wire);
      }
    });

    test('the roles that open an order may reach the order route', () {
      for (final r in [
        StaffRole.waiter,
        StaffRole.cashier,
        StaffRole.restaurantManager,
      ]) {
        expect(
          RoleConfig.of(r).allowedRoutes,
          contains(Routes.restaurantOrders),
          reason: r.wire,
        );
      }
    });

    test(
      'an order detail path canonicalises to a route the waiter is allowed',
      () {
        final canonical = GuardContext.canonicalise(
          Routes.restaurantOrder('abc-123'),
        );
        expect(canonical, Routes.restaurantOrders);
        expect(
          RoleConfig.of(StaffRole.waiter).allowedRoutes.contains(canonical),
          isTrue,
        );
      },
    );

    test('only the manager may reach menu and table management', () {
      final manager = RoleConfig.of(StaffRole.restaurantManager).allowedRoutes;
      expect(
        manager,
        containsAll([Routes.restaurantMenu, Routes.restaurantTables]),
      );
      expect(
        RoleConfig.of(
          StaffRole.waiter,
        ).allowedRoutes.contains(Routes.restaurantMenu),
        isFalse,
      );
    });
  });

  group('permission gating mirrors the server', () {
    test('the waiter requests a bill but never settles it', () {
      const waiter = PermissionSet({
        'table.read',
        'order.create',
        'order.update',
        'kot.update',
        'bill.generate',
      });
      expect(waiter.has(P.billGenerate), isTrue);
      expect(waiter.has(P.billSettle), isFalse);
    });

    test('the cashier settles but cannot void or manage the menu', () {
      const cashier = PermissionSet({
        'restaurant.read',
        'order.read',
        'bill.read',
        'bill.generate',
        'bill.settle',
      });
      expect(cashier.has(P.billSettle), isTrue);
      expect(cashier.has(P.orderVoid), isFalse);
      expect(cashier.has(P.menuManage), isFalse);
    });
  });
}

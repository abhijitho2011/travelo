import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:tavelo_owner/core/data/owner_repository.dart';
import 'package:tavelo_owner/core/models/owner_models.dart';
import 'package:tavelo_owner/core/theme/app_colors.dart';
import 'package:tavelo_owner/core/widgets/app_shell.dart';
import 'package:tavelo_owner/features/account/profile_screen.dart';
import 'package:tavelo_owner/features/account/security_screen.dart';
import 'package:tavelo_owner/features/auth/invite_screen.dart';
import 'package:tavelo_owner/features/auth/login_screen.dart';
import 'package:tavelo_owner/features/dashboard/portfolio_screen.dart';
import 'package:tavelo_owner/features/properties/properties_screen.dart';
import 'package:tavelo_owner/features/properties/property_detail_screen.dart';
import 'package:tavelo_owner/features/staff/staff_screen.dart';
import 'package:tavelo_owner/features/staff/managers_screen.dart';
import 'package:tavelo_owner/features/subscription/subscription_screen.dart';
import 'package:tavelo_owner/features/support/support_screen.dart';

/// Layout smoke tests for the redesigned screens.
///
/// They assert almost nothing about wording — their job is to prove each screen
/// composes and lays out inside the shell at both a phone and a tablet width.
/// A `RenderFlex` overflow or a missing bounded constraint fails the pump, and
/// those are exactly the mistakes a pure restyle introduces.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;
  SharedPreferences.setMockInitialValues({});

  final properties = [
    Property.fromJson({
      'id': 'p_1',
      'name': 'The Backwater Retreat',
      'city': 'Alappuzha',
      'state': 'Kerala',
      'status': 'ACTIVE',
      'roomCount': 42,
      'contact': {'phone': '9895000000', 'email': 'stay@example.com'},
      'listingCompleteness': 100,
    }),
    Property.fromJson({
      'id': 'p_2',
      'name': 'Hill Station Lodge — Munnar',
      'city': 'Munnar',
      'state': 'Kerala',
      'status': 'DRAFT',
      'roomCount': 18,
      'listingCompleteness': 60,
    }),
  ];

  final subscription = SubscriptionDetail.fromJson({
    'id': 's_1',
    'planName': 'Tavelo Growth',
    'description': 'Everything a multi-property owner needs.',
    'status': 'EXPIRING',
    'billingCycle': 'ANNUAL',
    'durationMonths': 12,
    'monthlyPrice': 499900,
    'periodPrice': 5398920,
    'currency': 'INR',
    'currentPeriodStart': '2026-01-01T00:00:00.000Z',
    'currentPeriodEnd': '2026-12-31T00:00:00.000Z',
    'daysRemaining': 9,
    'propertyLimit': 3,
    'propertiesUsed': 2,
    'features': ['reports.advanced', 'support.priority'],
  });

  final invoices = [
    Invoice.fromJson({
      'id': 'i_1',
      'invoiceNumber': 'TAV-2026-0001',
      'total': 5398920,
      'status': 'PAID',
      'issuedAt': '2026-01-02T00:00:00.000Z',
    }),
    Invoice.fromJson({
      'id': 'i_2',
      'invoiceNumber': 'TAV-2026-0002',
      'total': 5398920,
      'status': 'OVERDUE',
      'issuedAt': '2026-06-02T00:00:00.000Z',
    }),
  ];

  final tickets = [
    SupportTicket.fromJson({
      'id': 't_1',
      'subject': 'Room rates are not syncing to the booking engine',
      'status': 'WAITING_FOR_OWNER',
      'priority': 'HIGH',
      'propertyName': 'The Backwater Retreat',
      'updatedAt': '2026-08-01T09:30:00.000Z',
    }),
    SupportTicket.fromJson({
      'id': 't_2',
      'subject': 'Invoice question',
      'status': 'RESOLVED',
      'priority': 'LOW',
      'createdAt': '2026-07-01T09:30:00.000Z',
    }),
  ];

  final sessions = [
    OwnerSession.fromJson({
      'id': 'sess_1',
      'ip': '203.0.113.7',
      'userAgent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126',
      'createdAt': '2026-08-20T07:15:00.000Z',
      'current': true,
    }),
    OwnerSession.fromJson({
      'id': 'sess_2',
      'ip': '198.51.100.44',
      'userAgent': 'Dart/3.9 (dart:io) Android',
      'createdAt': '2026-06-11T18:02:00.000Z',
    }),
  ];

  final account = OwnerAccount.fromJson({
    'id': 'o_1',
    'name': 'Meera Raghavan',
    'company': 'Raghavan Hospitality',
    'email': 'meera@example.com',
    'emailVerified': true,
    'phone': '9876543210',
    'address': '12 Marine Drive',
    'pinCode': '682031',
    'createdAt': '2024-03-02T00:00:00.000Z',
    'propertiesCount': 2,
    'staffCount': 5,
  });

  final staff = [
    StaffMember.fromJson({
      'id': 'st_1',
      'firstName': 'Anand',
      'lastName': 'Varghese',
      'mobile': '9812345678',
      'state': 'Kerala',
      'district': 'Ernakulam',
      'role': 'ASSISTANT_GENERAL_MANAGER',
      'status': 'BLOCKED',
    }),
    StaffMember.fromJson({
      'id': 'st_2',
      'firstName': 'Divya',
      'lastName': 'Nair',
      'mobile': '9898989898',
      'state': 'Kerala',
      'district': 'Alappuzha',
      'role': 'GENERAL_MANAGER',
    }),
  ];

  final amenities = PropertyAmenities.fromJson({
    'selected': [
      {'id': 'am_1', 'key': 'pool', 'name': 'Swimming pool', 'icon': 'pool'},
      {'id': 'am_2', 'key': 'spa', 'name': 'Spa', 'icon': 'spa'},
    ],
    'selectedIds': ['am_1', 'am_2'],
    'catalogue': [
      {'id': 'am_1', 'key': 'pool', 'name': 'Swimming pool', 'icon': 'pool'},
      {'id': 'am_2', 'key': 'spa', 'name': 'Spa', 'icon': 'spa'},
      {'id': 'am_3', 'key': 'gym', 'name': 'Gym', 'icon': 'fitness_center'},
    ],
  });

  final roomTypes = [
    RoomType.fromJson({
      'id': 'rt_1',
      'name': 'Deluxe lake view',
      'bedType': 'Queen',
      'bedCount': 2,
      'maxOccupancy': 3,
      'airConditioned': true,
      'baseRate': 450000,
      'sizeSqft': 320,
      'roomCount': 8,
    }),
  ];

  final rooms = [
    for (var i = 0; i < 6; i++)
      Room.fromJson({
        'id': 'r_$i',
        'number': '10$i',
        'floor': i < 3 ? '1' : 'G',
        'status': const [
          'AVAILABLE',
          'OCCUPIED',
          'DIRTY',
          'CLEANING',
          'MAINTENANCE',
          'OUT_OF_ORDER',
        ][i],
      }),
  ];

  List<Override> overrides() => [
    propertiesProvider.overrideWith((ref) => properties),
    portfolioProvider.overrideWith(
      (ref) => const PortfolioSummary(
        hotels: 2,
        rooms: 60,
        revenue: 4821000,
        occupancy: 78,
      ),
    ),
    subscriptionProvider.overrideWith((ref) => subscription),
    invoicesProvider.overrideWith((ref) => invoices),
    ticketsProvider('').overrideWith((ref) => tickets),
    sessionsProvider.overrideWith((ref) => sessions),
    ownerAccountProvider.overrideWith((ref) => account),
    locationCatalogueProvider.overrideWith((ref) => const <CatalogueState>[]),
    staffProvider('p_1').overrideWith((ref) => staff),
    propertyAmenitiesProvider('p_1').overrideWith((ref) => amenities),
    propertyRoomTypesProvider('p_1').overrideWith((ref) => roomTypes),
    propertyRoomsProvider('p_1').overrideWith((ref) => rooms),
    propertyPhotosProvider('p_1').overrideWith((ref) => <Map<String, dynamic>>[]),
  ];

  Widget harness(Widget screen) {
    final router = GoRouter(
      initialLocation: '/',
      routes: [
        ShellRoute(
          builder: (_, _, child) => AppShell(child: child),
          routes: [GoRoute(path: '/', builder: (_, _) => screen)],
        ),
      ],
    );
    return ProviderScope(
      overrides: overrides(),
      child: MaterialApp.router(
        theme: ThemeData(extensions: const [AppColors.light]),
        darkTheme: ThemeData(
          brightness: Brightness.dark,
          extensions: const [AppColors.dark],
        ),
        routerConfig: router,
      ),
    );
  }

  /// google_fonts reports a missing font as an unhandled async error; the
  /// widgets under test still lay out correctly, so it is absorbed here.
  Future<void> pumpScreen(WidgetTester tester, Widget screen, Size size) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await runZonedGuarded(() async {
      await tester.pumpWidget(harness(screen));
      await tester.pumpAndSettle();
    }, (_, _) {});
  }

  const phone = Size(390, 844);
  const tablet = Size(1024, 768);

  final screens = <String, Widget>{
    'dashboard': const PortfolioScreen(),
    'managers': const ManagersScreen(),
    'subscription': const SubscriptionScreen(),
    'support': const SupportScreen(),
    'hotels': const PropertiesScreen(),
    'security': const SecurityScreen(),
    'profile': const ProfileScreen(),
  };

  for (final entry in screens.entries) {
    testWidgets('${entry.key} lays out on a phone', (tester) async {
      await pumpScreen(tester, entry.value, phone);
      expect(tester.takeException(), isNull);
    });

    testWidgets('${entry.key} lays out on a tablet', (tester) async {
      await pumpScreen(tester, entry.value, tablet);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('the dashboard shows a KPI per figure and a card per hotel', (
    tester,
  ) async {
    await pumpScreen(tester, const PortfolioScreen(), phone);
    // KPI labels render through LabelXs, which uppercases them.
    expect(find.text('HOTELS'), findsOneWidget);
    expect(find.text('OCCUPANCY'), findsOneWidget);
    expect(find.text('REVENUE'), findsOneWidget);
    expect(find.text('The Backwater Retreat'), findsOneWidget);
    // A hotel that is not fully set up says so rather than looking finished.
    expect(find.text('60% ready'), findsOneWidget);
    expect(find.text('Ready'), findsOneWidget);
  });

  testWidgets('an expiring subscription warns before it lists the plan', (
    tester,
  ) async {
    await pumpScreen(tester, const SubscriptionScreen(), phone);
    expect(find.text('Your subscription expires in 9 days.'), findsOneWidget);
    expect(find.text('Tavelo Growth'), findsOneWidget);
    expect(find.text('TAV-2026-0002'), findsOneWidget);
    expect(find.text('Overdue'), findsOneWidget);
  });

  // The auth screens live outside the shell, so they are pumped bare.
  Future<void> pumpBare(WidgetTester tester, Widget screen, Size size) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await runZonedGuarded(() async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: ThemeData(extensions: const [AppColors.light]),
            home: screen,
          ),
        ),
      );
      await tester.pumpAndSettle();
    }, (_, _) {});
  }

  // Detail and form screens keep their own Scaffold and sit over the shell, so
  // they are pumped with the same overrides but without it.
  Future<void> pumpDetail(WidgetTester tester, Widget screen, Size size) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await runZonedGuarded(() async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: overrides(),
          child: MaterialApp(
            theme: ThemeData(extensions: const [AppColors.light]),
            home: screen,
          ),
        ),
      );
      await tester.pumpAndSettle();
    }, (_, _) {});
  }

  testWidgets('the managers list lays out, long role names and all', (
    tester,
  ) async {
    await pumpDetail(tester, const StaffScreen(propertyId: 'p_1'), phone);
    expect(tester.takeException(), isNull);
    expect(find.text('Anand Varghese'), findsOneWidget);
    // A blocked manager says so instead of looking like everyone else.
    expect(find.text('Blocked'), findsOneWidget);
  });

  testWidgets('a hotel detail lays out with facilities, types and rooms', (
    tester,
  ) async {
    await pumpDetail(
      tester,
      PropertyDetailScreen(propertyId: 'p_1', property: properties.first),
      phone,
    );
    expect(tester.takeException(), isNull);
    expect(find.text('Swimming pool'), findsOneWidget);
    expect(find.text('Deluxe lake view'), findsOneWidget);
    expect(find.text('1 Out of order'), findsOneWidget);
  });

  testWidgets('a hotel detail lays out on a tablet too', (tester) async {
    await pumpDetail(
      tester,
      PropertyDetailScreen(propertyId: 'p_1', property: properties.first),
      tablet,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('the sign-in screen offers OTP and Google', (tester) async {
    await pumpBare(tester, const LoginScreen(), phone);
    expect(tester.takeException(), isNull);
    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Send OTP'), findsOneWidget);
    expect(find.text('Continue with Google'), findsOneWidget);
    // The wordmark and the owner tagline are kept.
    expect(find.text('Tavelo'), findsOneWidget);
    expect(find.text('ONE PLATFORM. EVERY HOTEL.'), findsOneWidget);
  });

  testWidgets('the invite screen lays out', (tester) async {
    await pumpBare(tester, const InviteScreen(), phone);
    expect(tester.takeException(), isNull);
    expect(find.text("You're invited"), findsOneWidget);
  });

  testWidgets('a ticket waiting on the owner says so', (tester) async {
    await pumpScreen(tester, const SupportScreen(), phone);
    expect(find.text('Needs your reply'), findsOneWidget);
    expect(find.text('Invoice question'), findsOneWidget);
    // 'Resolved' is both a filter chip and a badge, so it appears twice.
    expect(find.text('Resolved'), findsNWidgets(2));
  });
}

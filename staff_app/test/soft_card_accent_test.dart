import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tavelo_staff/core/theme/app_theme.dart';
import 'package:tavelo_staff/core/widgets/primitives.dart';

/// A high-priority task and a critical work order both pass `accent`, so if the
/// accented card cannot paint, the first urgent item takes the screen down.
void main() {
  testWidgets('an accented SoftCard paints', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: const Scaffold(
          body: SoftCard(accent: Color(0xFFD2453A), child: Text('urgent')),
        ),
      ),
    );
    expect(tester.takeException(), isNull);
    expect(find.text('urgent'), findsOneWidget);
  });
}

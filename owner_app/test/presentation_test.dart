import 'package:flutter_test/flutter_test.dart';

import 'package:tavelo_owner/core/models/owner_models.dart';
import 'package:tavelo_owner/core/utils/formatting.dart';
import 'package:tavelo_owner/core/widgets/app_shell.dart';
import 'package:tavelo_owner/core/widgets/status_badge.dart';
import 'package:tavelo_owner/features/properties/property_card.dart';
import 'package:tavelo_owner/features/properties/property_detail_screen.dart';
import 'package:tavelo_owner/features/subscription/subscription_screen.dart';
import 'package:tavelo_owner/features/support/support_screen.dart';

/// The pure helpers behind the redesign. Each one decides something a reader
/// sees — the letters in an avatar, which tab is lit, what colour a status is —
/// so they are worth pinning without a widget test.
void main() {
  group('initialsOf', () {
    test('takes the first and last word, not the middle ones', () {
      expect(initialsOf('Arun Kumar Menon'), 'AM');
      expect(initialsOf('Arun Menon'), 'AM');
    });

    test('a single name gives one letter', () {
      expect(initialsOf('Arun'), 'A');
    });

    test('collapses stray whitespace rather than reading it as a name', () {
      expect(initialsOf('  Arun   Menon  '), 'AM');
    });

    test('an absent name uses the caller\'s fallback', () {
      expect(initialsOf(null), '?');
      expect(initialsOf(''), '?');
      expect(initialsOf('   '), '?');
      expect(initialsOf(null, fallback: 'O'), 'O');
    });
  });

  group('firstNameOf', () {
    test('greets by the first word', () {
      expect(firstNameOf('Arun Menon'), 'Arun');
    });

    test('still reads as a sentence with no name at all', () {
      expect(firstNameOf(null), 'there');
      expect(firstNameOf('  '), 'there');
    });
  });

  group('selectedNavIndex', () {
    const routes = ['/', '/properties', '/staff', '/support'];

    test('lights the exact destination', () {
      expect(selectedNavIndex(routes, '/'), 0);
      expect(selectedNavIndex(routes, '/properties'), 1);
      expect(selectedNavIndex(routes, '/support'), 3);
    });

    test('a detail screen keeps its parent destination lit', () {
      expect(selectedNavIndex(routes, '/properties/p_1'), 1);
      expect(selectedNavIndex(routes, '/properties/p_1/staff'), 1);
      expect(selectedNavIndex(routes, '/support/t_9'), 3);
    });

    test('the dashboard route does not swallow every other location', () {
      // '/' is a prefix of everything; the longest match has to win or the
      // first tab would stay lit across the whole app.
      expect(selectedNavIndex(routes, '/staff'), 2);
    });

    test('a location no destination serves reports -1, not a wrong tab', () {
      expect(selectedNavIndex(const ['/properties'], '/subscription'), -1);
      // A route that merely shares a prefix is not a match either.
      expect(selectedNavIndex(const ['/support'], '/supportive'), -1);
    });
  });

  group('roomStatusChip', () {
    test(
      'sellable, in-progress and out-of-service read as different tones',
      () {
        expect(roomStatusChip('AVAILABLE'), (
          'Available',
          StatusTone.available,
        ));
        expect(roomStatusChip('OCCUPIED'), ('Occupied', StatusTone.occupied));
        expect(roomStatusChip('DIRTY'), ('Dirty', StatusTone.dirty));
        expect(roomStatusChip('OUT_OF_ORDER'), (
          'Out of order',
          StatusTone.outOfOrder,
        ));
      },
    );

    test(
      'a status this build has never seen is shown verbatim, not hidden',
      () {
        expect(roomStatusChip('QUARANTINE'), (
          'QUARANTINE',
          StatusTone.neutral,
        ));
        expect(roomStatusChip(''), ('Unknown', StatusTone.neutral));
      },
    );

    test('is case-insensitive, because the API has sent both', () {
      expect(roomStatusChip('available').$1, 'Available');
    });
  });

  group('propertyStatusTone', () {
    test('only an active hotel reads as healthy', () {
      expect(propertyStatusTone('ACTIVE'), StatusTone.healthy);
      expect(propertyStatusTone('DRAFT'), StatusTone.neutral);
      expect(propertyStatusTone(''), StatusTone.neutral);
    });
  });

  group('ticket chips', () {
    test('a ticket waiting on the owner is the one that warns', () {
      expect(ticketStatusChip('WAITING_FOR_OWNER'), (
        'Needs your reply',
        StatusTone.warning,
      ));
      expect(ticketStatusChip('RESOLVED'), ('Resolved', StatusTone.healthy));
      expect(ticketStatusChip('CLOSED'), ('Closed', StatusTone.neutral));
    });

    test('priority escalates from neutral to critical', () {
      expect(ticketPriorityChip('LOW').$2, StatusTone.neutral);
      expect(ticketPriorityChip('HIGH').$2, StatusTone.warning);
      expect(ticketPriorityChip('CRITICAL').$2, StatusTone.critical);
      // An absent priority is Normal, never a blank chip.
      expect(ticketPriorityChip(''), ('Normal', StatusTone.neutral));
    });
  });

  group('subscription and invoice chips', () {
    test('every subscription state has words and a tone', () {
      for (final state in SubscriptionState.values) {
        final (label, _) = subscriptionStateChip(state);
        expect(label, isNotEmpty);
      }
      expect(
        subscriptionStateChip(SubscriptionState.active).$2,
        StatusTone.healthy,
      );
      expect(
        subscriptionStateChip(SubscriptionState.expired).$2,
        StatusTone.critical,
      );
    });

    test('an unpaid invoice is not shown as settled', () {
      expect(invoiceStatusChip('PAID'), ('Paid', StatusTone.healthy));
      expect(invoiceStatusChip('ISSUED'), ('Due', StatusTone.warning));
      expect(invoiceStatusChip('OVERDUE'), ('Overdue', StatusTone.critical));
      expect(invoiceStatusChip(''), ('—', StatusTone.neutral));
    });
  });
}

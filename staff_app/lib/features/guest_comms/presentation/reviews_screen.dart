import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_gate.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../../../core/widgets/states.dart';
import '../application/guest_comms_controllers.dart';
import '../data/guest_comms_models.dart';

/// **Reviews** — what guests said everywhere, and the hotel's replies.
class ReviewsScreen extends ConsumerWidget {
  const ReviewsScreen({super.key});

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    final name = TextEditingController();
    final title = TextEditingController();
    final body = TextEditingController();
    final url = TextEditingController();
    var rating = 5;
    var source = 'GOOGLE';
    final messenger = ScaffoldMessenger.of(context);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => StatefulBuilder(
        builder: (context, setState) {
          final c = context.colors;
          return Padding(
            padding: EdgeInsets.fromLTRB(
              Sp.lg,
              Sp.lg,
              Sp.lg,
              MediaQuery.of(context).viewInsets.bottom + Sp.lg,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Add a review',
                    style: AppTypography.display(size: 17, color: c.foreground),
                  ),
                  Text(
                    'Copy it in from the platform; reply here and paste the reply back.',
                    style: AppTypography.body(
                      size: 12,
                      color: c.mutedForeground,
                    ),
                  ),
                  const SizedBox(height: Sp.lg),
                  DropdownButtonFormField<String>(
                    initialValue: source,
                    decoration: const InputDecoration(labelText: 'Where'),
                    items: const [
                      DropdownMenuItem(value: 'GOOGLE', child: Text('Google')),
                      DropdownMenuItem(
                        value: 'BOOKING_COM',
                        child: Text('Booking.com'),
                      ),
                      DropdownMenuItem(
                        value: 'MAKEMYTRIP',
                        child: Text('MakeMyTrip'),
                      ),
                      DropdownMenuItem(
                        value: 'TRIPADVISOR',
                        child: Text('Tripadvisor'),
                      ),
                      DropdownMenuItem(
                        value: 'DIRECT',
                        child: Text('Told us directly'),
                      ),
                      DropdownMenuItem(value: 'OTHER', child: Text('Other')),
                    ],
                    onChanged: (v) => setState(() => source = v ?? source),
                  ),
                  const SizedBox(height: Sp.md),
                  Row(
                    children: [
                      Text(
                        'Rating',
                        style: AppTypography.body(
                          size: 13,
                          color: c.foreground,
                        ),
                      ),
                      const SizedBox(width: Sp.md),
                      for (var i = 1; i <= 5; i++)
                        IconButton(
                          onPressed: () => setState(() => rating = i),
                          icon: Icon(
                            i <= rating ? Icons.star : Icons.star_border,
                            color: c.warning,
                          ),
                        ),
                    ],
                  ),
                  TextField(
                    controller: name,
                    decoration: const InputDecoration(labelText: 'Guest name'),
                  ),
                  const SizedBox(height: Sp.md),
                  TextField(
                    controller: title,
                    decoration: const InputDecoration(labelText: 'Title'),
                  ),
                  const SizedBox(height: Sp.md),
                  TextField(
                    controller: body,
                    maxLines: 4,
                    decoration: const InputDecoration(labelText: 'Review'),
                  ),
                  const SizedBox(height: Sp.md),
                  TextField(
                    controller: url,
                    decoration: const InputDecoration(
                      labelText: 'Link to the review (optional)',
                    ),
                  ),
                  const SizedBox(height: Sp.lg),
                  FilledButton(
                    onPressed: () async {
                      try {
                        await ref.read(guestCommsActionsProvider).addReview({
                          'source': source,
                          'rating': rating,
                          if (name.text.trim().isNotEmpty)
                            'guestName': name.text.trim(),
                          if (title.text.trim().isNotEmpty)
                            'title': title.text.trim(),
                          if (body.text.trim().isNotEmpty)
                            'body': body.text.trim(),
                          if (url.text.trim().isNotEmpty)
                            'externalUrl': url.text.trim(),
                        });
                        if (context.mounted) Navigator.pop(context);
                      } on ApiException catch (e) {
                        messenger.showSnackBar(
                          SnackBar(content: Text(e.message)),
                        );
                      }
                    },
                    child: const Text('Save review'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final page = ref.watch(reviewsProvider);
    return PageBody(
      onRefresh: () async => ref.invalidate(reviewsProvider),
      children: [
        PageHeader(
          eyebrow: 'Guests',
          title: 'Reviews',
          actions: [
            PermissionGate(
              permission: P.reviewRespond,
              child: FilledButton.icon(
                onPressed: () => _add(context, ref),
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Add'),
              ),
            ),
          ],
        ),
        gapSection,
        page.when(
          loading: () => const ListSkeleton(rows: 3),
          error: (e, _) => ErrorState(
            error: e,
            onRetry: () => ref.invalidate(reviewsProvider),
          ),
          data: (p) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              KpiGrid(
                children: [
                  KpiCard(
                    label: 'Average rating',
                    value: p.count == 0
                        ? '—'
                        : '${p.averageRating.toStringAsFixed(1)} / 5',
                  ),
                  KpiCard(label: 'Reviews', value: '${p.count}'),
                  KpiCard(label: 'Awaiting reply', value: '${p.unanswered}'),
                ],
              ),
              if (!p.aiDraftingAvailable) ...[
                gapMd,
                Text(
                  'Reply drafting is off — set an Anthropic API key on the server to turn it on.',
                  style: AppTypography.body(
                    size: 11.5,
                    color: c.mutedForeground,
                  ),
                ),
              ],
              gapSection,
              if (p.items.isEmpty)
                const EmptyState(
                  title: 'No reviews yet',
                  hint:
                      'Add reviews from Google or the OTAs to reply from here.',
                  icon: Icons.reviews_outlined,
                )
              else
                for (final r in p.items) ...[
                  _ReviewCard(review: r, aiAvailable: p.aiDraftingAvailable),
                  gapMd,
                ],
              gapSection,
            ],
          ),
        ),
      ],
    );
  }
}

class _ReviewCard extends ConsumerWidget {
  const _ReviewCard({required this.review, required this.aiAvailable});
  final GuestReview review;
  final bool aiAvailable;

  Future<void> _reply(BuildContext context, WidgetRef ref) async {
    final text = TextEditingController(text: review.response ?? '');
    final messenger = ScaffoldMessenger.of(context);
    var busy = false;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => StatefulBuilder(
        builder: (context, setState) {
          final c = context.colors;
          Future<void> draft(String tone) async {
            setState(() => busy = true);
            try {
              text.text = await ref
                  .read(guestCommsActionsProvider)
                  .draft(review.id, tone: tone);
            } on ApiException catch (e) {
              messenger.showSnackBar(SnackBar(content: Text(e.message)));
            } finally {
              setState(() => busy = false);
            }
          }

          return Padding(
            padding: EdgeInsets.fromLTRB(
              Sp.lg,
              Sp.lg,
              Sp.lg,
              MediaQuery.of(context).viewInsets.bottom + Sp.lg,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Reply to ${review.guestName ?? 'the guest'}',
                    style: AppTypography.display(size: 17, color: c.foreground),
                  ),
                  const SizedBox(height: Sp.sm),
                  if (aiAvailable)
                    Wrap(
                      spacing: Sp.sm,
                      children: [
                        for (final t in const ['warm', 'formal', 'brief'])
                          ActionChip(
                            avatar: const Icon(Icons.auto_awesome, size: 14),
                            label: Text('Draft · $t'),
                            onPressed: busy ? null : () => draft(t),
                          ),
                      ],
                    ),
                  const SizedBox(height: Sp.md),
                  TextField(
                    controller: text,
                    minLines: 4,
                    maxLines: 10,
                    decoration: const InputDecoration(
                      labelText: 'Your reply',
                      hintText:
                          'A draft is only a draft — read it, then post it on the platform too.',
                    ),
                  ),
                  const SizedBox(height: Sp.lg),
                  FilledButton(
                    onPressed: busy
                        ? null
                        : () async {
                            if (text.text.trim().length < 2) return;
                            try {
                              await ref
                                  .read(guestCommsActionsProvider)
                                  .respond(review.id, text.text.trim());
                              if (context.mounted) Navigator.pop(context);
                            } on ApiException catch (e) {
                              messenger.showSnackBar(
                                SnackBar(content: Text(e.message)),
                              );
                            }
                          },
                    child: const Text('Save reply'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return SoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              for (var i = 1; i <= 5; i++)
                Icon(
                  i <= review.rating ? Icons.star : Icons.star_border,
                  size: 16,
                  color: c.warning,
                ),
              const SizedBox(width: Sp.sm),
              Text(
                '${review.sourceLabel}${review.reviewedAt == null ? '' : ' · ${DateFormat('d MMM yyyy').format(review.reviewedAt!)}'}',
                style: AppTypography.body(size: 11.5, color: c.mutedForeground),
              ),
              const Spacer(),
              if (!review.answered)
                Text(
                  'Awaiting reply',
                  style: AppTypography.body(
                    size: 11,
                    weight: FontWeight.w600,
                    color: c.warning,
                  ),
                ),
            ],
          ),
          const SizedBox(height: Sp.sm),
          if (review.title != null)
            Text(
              review.title!,
              style: AppTypography.body(
                size: 14,
                weight: FontWeight.w700,
                color: c.foreground,
              ),
            ),
          if (review.body != null)
            Text(
              review.body!,
              style: AppTypography.body(size: 13, color: c.foreground),
            ),
          Text(
            '— ${review.guestName ?? 'a guest'}',
            style: AppTypography.body(size: 11.5, color: c.mutedForeground),
          ),
          if (review.answered) ...[
            const SizedBox(height: Sp.sm),
            Container(
              padding: const EdgeInsets.all(Sp.sm),
              decoration: BoxDecoration(
                color: c.primary.withValues(alpha: 0.08),
                borderRadius: R.rMd,
              ),
              child: Text(
                review.response!,
                style: AppTypography.body(size: 12.5, color: c.foreground),
              ),
            ),
          ],
          const SizedBox(height: Sp.sm),
          PermissionGate(
            permission: P.reviewRespond,
            child: Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => _reply(context, ref),
                child: Text(review.answered ? 'Edit reply' : 'Reply'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

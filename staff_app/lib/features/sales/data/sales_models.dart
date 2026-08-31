import 'package:flutter/material.dart';

import '../../../core/widgets/status_badge.dart';
import '../../rooms/data/room_models.dart' show formatPaise;

export '../../rooms/data/room_models.dart' show formatPaise;

// ---------------------------------------------------------------- parsing --

dynamic _pick(Map json, List<String> keys) {
  for (final key in keys) {
    final value = json[key];
    if (value != null) return value;
  }
  return null;
}

int _int(dynamic value, [int fallback = 0]) {
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse((value ?? '').toString()) ?? fallback;
}

String? _str(dynamic value) {
  final text = value?.toString().trim();
  return (text == null || text.isEmpty) ? null : text;
}

DateTime? _date(dynamic value) =>
    DateTime.tryParse((value ?? '').toString())?.toLocal();

String? _wire(dynamic value) {
  final text = _str(value);
  return text?.toUpperCase().replaceAll(RegExp(r'[\s-]+'), '_');
}

// ------------------------------------------------------------------ enums --

enum LeadStage {
  lead('LEAD', 'New'),
  contacted('CONTACTED', 'Contacted'),
  proposal('PROPOSAL', 'Proposal'),
  negotiation('NEGOTIATION', 'Negotiation'),
  confirmed('CONFIRMED', 'Won'),
  lost('LOST', 'Lost');

  const LeadStage(this.wire, this.label);
  final String wire;
  final String label;

  static LeadStage fromWire(String? value) {
    final w = _wire(value);
    for (final s in values) {
      if (s.wire == w) return s;
    }
    return LeadStage.lead;
  }

  StatusTone get tone => switch (this) {
    LeadStage.lead => StatusTone.neutral,
    LeadStage.contacted => StatusTone.info,
    LeadStage.proposal => StatusTone.info,
    LeadStage.negotiation => StatusTone.warning,
    LeadStage.confirmed => StatusTone.healthy,
    LeadStage.lost => StatusTone.critical,
  };

  bool get isTerminal => this == LeadStage.confirmed || this == LeadStage.lost;

  /// The stages this lead may move to next, per the pipeline state machine.
  List<LeadStage> get nextStages => switch (this) {
    LeadStage.lead => const [LeadStage.contacted, LeadStage.lost],
    LeadStage.contacted => const [LeadStage.proposal, LeadStage.lost],
    LeadStage.proposal => const [
      LeadStage.negotiation,
      LeadStage.confirmed,
      LeadStage.lost,
    ],
    LeadStage.negotiation => const [LeadStage.confirmed, LeadStage.lost],
    LeadStage.confirmed => const [],
    LeadStage.lost => const [],
  };
}

enum SalesActivityType {
  call('CALL', 'Call'),
  email('EMAIL', 'Email'),
  meeting('MEETING', 'Meeting'),
  note('NOTE', 'Note');

  const SalesActivityType(this.wire, this.label);
  final String wire;
  final String label;

  static SalesActivityType fromWire(String? value) {
    final w = _wire(value);
    for (final t in values) {
      if (t.wire == w) return t;
    }
    return SalesActivityType.note;
  }

  IconData get icon => switch (this) {
    SalesActivityType.call => Icons.call_outlined,
    SalesActivityType.email => Icons.email_outlined,
    SalesActivityType.meeting => Icons.groups_outlined,
    SalesActivityType.note => Icons.sticky_note_2_outlined,
  };
}

// ------------------------------------------------------------------ models --

@immutable
class Lead {
  const Lead({
    required this.id,
    required this.name,
    required this.stage,
    required this.valuePaise,
    this.company,
    this.contact,
    this.source,
    this.ownerStaffId,
    this.notes,
    this.activities = const [],
  });

  final String id;
  final String name;
  final LeadStage stage;
  final int valuePaise;
  final String? company;
  final String? contact;
  final String? source;
  final String? ownerStaffId;
  final String? notes;
  final List<SalesActivity> activities;

  String get valueLabel => formatPaise(valuePaise);

  static Lead fromJson(Map json) => Lead(
    id: (_pick(json, ['id']) ?? '').toString(),
    name: _str(_pick(json, ['name'])) ?? 'Lead',
    stage: LeadStage.fromWire(_pick(json, ['stage'])?.toString()),
    valuePaise: _int(_pick(json, ['valuePaise'])),
    company: _str(_pick(json, ['company'])),
    contact: _str(_pick(json, ['contact'])),
    source: _str(_pick(json, ['source'])),
    ownerStaffId: _str(_pick(json, ['ownerStaffId'])),
    notes: _str(_pick(json, ['notes'])),
    activities: (_pick(json, ['activities']) is List)
        ? (_pick(json, ['activities']) as List)
              .whereType<Map>()
              .map(SalesActivity.fromJson)
              .toList()
        : const [],
  );
}

@immutable
class SalesActivity {
  const SalesActivity({
    required this.id,
    required this.type,
    this.note,
    this.at,
  });

  final String id;
  final SalesActivityType type;
  final String? note;
  final DateTime? at;

  static SalesActivity fromJson(Map json) => SalesActivity(
    id: (_pick(json, ['id']) ?? '').toString(),
    type: SalesActivityType.fromWire(_pick(json, ['type'])?.toString()),
    note: _str(_pick(json, ['note'])),
    at: _date(_pick(json, ['at'])),
  );
}

@immutable
class PipelineColumn {
  const PipelineColumn({required this.stage, required this.leads});
  final LeadStage stage;
  final List<Lead> leads;

  int get valuePaise => leads.fold(0, (s, l) => s + l.valuePaise);
}

@immutable
class SalesSummary {
  const SalesSummary({
    required this.byStage,
    required this.totalLeads,
    required this.openLeads,
    required this.wonLeads,
    required this.conversionPercent,
    required this.openValuePaise,
    required this.wonValuePaise,
  });

  final Map<LeadStage, int> byStage;
  final int totalLeads;
  final int openLeads;
  final int wonLeads;
  final int conversionPercent;
  final int openValuePaise;
  final int wonValuePaise;

  static SalesSummary fromJson(Map json) {
    final byStage = <LeadStage, int>{};
    final raw = _pick(json, ['byStage']);
    if (raw is List) {
      for (final entry in raw.whereType<Map>()) {
        byStage[LeadStage.fromWire(entry['stage']?.toString())] = _int(
          entry['count'],
        );
      }
    }
    return SalesSummary(
      byStage: byStage,
      totalLeads: _int(_pick(json, ['totalLeads'])),
      openLeads: _int(_pick(json, ['openLeads'])),
      wonLeads: _int(_pick(json, ['wonLeads'])),
      conversionPercent: _int(_pick(json, ['conversionPercent'])),
      openValuePaise: _int(_pick(json, ['openValuePaise'])),
      wonValuePaise: _int(_pick(json, ['wonValuePaise'])),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/networking/api_exception.dart';
import '../../../core/permissions/permission_keys.dart';
import '../../../core/permissions/role_config.dart';
import '../../../core/providers.dart';
import '../../../core/routing/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/primitives.dart';
import '../application/management_controllers.dart';
import '../data/team_models.dart';

/// Create a colleague at this property.
///
/// The role list excludes both management roles: a GM cannot mint a peer or a
/// superior, and the server rejects it too — the client just does not offer it.
class AddStaffScreen extends ConsumerStatefulWidget {
  const AddStaffScreen({super.key});

  @override
  ConsumerState<AddStaffScreen> createState() => _AddStaffScreenState();
}

class _AddStaffScreenState extends ConsumerState<AddStaffScreen> {
  final _formKey = GlobalKey<FormState>();
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _mobile = TextEditingController();
  final _email = TextEditingController();
  final _department = TextEditingController();
  final _employeeId = TextEditingController();

  StaffRole? _role;
  bool _activate = false;
  bool _busy = false;
  String? _submitError;

  @override
  void dispose() {
    for (final ctl in [
      _first,
      _last,
      _mobile,
      _email,
      _department,
      _employeeId,
    ]) {
      ctl.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _submitError = null);
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_role == null) {
      setState(() => _submitError = 'Choose a role for this person');
      return;
    }

    setState(() => _busy = true);
    try {
      await ref
          .read(teamActionsProvider)
          .create(
            NewTeamMember(
              role: _role!,
              firstName: _first.text.trim(),
              lastName: _last.text.trim(),
              mobile: _mobile.text.replaceAll(RegExp(r'\D'), ''),
              email: _email.text.trim(),
              department: _department.text.trim().isEmpty
                  ? _role!.department
                  : _department.text.trim(),
              employeeId: _employeeId.text.trim(),
              activate: _activate,
            ),
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _activate
                ? '${_first.text.trim()} added and activated'
                : '${_first.text.trim()} added — waiting for approval',
          ),
        ),
      );
      context.go(Routes.team);
    } on ApiException catch (e) {
      if (mounted) setState(() => _submitError = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    // `activate` is honoured by the server only for a creator holding
    // staff.approve — so the switch is only offered to someone who has it.
    final canActivate = ref.watch(canProvider(P.staffApprove));

    return PageBody(
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => context.go(Routes.team),
            icon: const Icon(Icons.arrow_back, size: 16),
            label: const Text('Team'),
          ),
        ),
        const PageHeader(
          eyebrow: 'Team',
          title: 'Add a team member',
          subtitle:
              'They will be able to sign in with the mobile number you enter '
              'here, using a one-time code.',
        ),
        gapSection,

        Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const LabelXs('Role'),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<StaffRole>(
                      initialValue: _role,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        hintText: 'Choose a role',
                        prefixIcon: Icon(Icons.badge_outlined, size: 20),
                      ),
                      items: [
                        for (final role in StaffRole.creatableByManagement)
                          DropdownMenuItem(
                            value: role,
                            child: Text(
                              role.label,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                      onChanged: (r) => setState(() {
                        _role = r;
                        if (_department.text.trim().isEmpty && r != null) {
                          _department.text = r.department;
                        }
                      }),
                    ),
                    const SizedBox(height: Sp.sm),
                    Text(
                      'General Manager and Assistant General Manager are '
                      'appointed by the hotel owner, so they are not in this '
                      'list.',
                      style: AppTypography.body(
                        size: 11.5,
                        color: c.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              gapMd,

              SoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const LabelXs('Personal details'),
                    const SizedBox(height: Sp.md),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _first,
                            textCapitalization: TextCapitalization.words,
                            decoration: const InputDecoration(
                              labelText: 'First name',
                            ),
                            validator: (v) => (v ?? '').trim().isEmpty
                                ? 'Required'
                                : null,
                          ),
                        ),
                        const SizedBox(width: Sp.md),
                        Expanded(
                          child: TextFormField(
                            controller: _last,
                            textCapitalization: TextCapitalization.words,
                            decoration: const InputDecoration(
                              labelText: 'Last name',
                            ),
                            validator: (v) => (v ?? '').trim().isEmpty
                                ? 'Required'
                                : null,
                          ),
                        ),
                      ],
                    ),
                    gapMd,
                    TextFormField(
                      controller: _mobile,
                      keyboardType: TextInputType.phone,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(10),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Mobile number',
                        hintText: '98765 43210',
                        prefixText: '+91 ',
                        prefixIcon: Icon(Icons.phone_iphone_outlined, size: 20),
                      ),
                      validator: (v) {
                        final digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
                        if (digits.length != 10) {
                          return 'Enter the 10-digit mobile number';
                        }
                        if (!RegExp(r'^[6-9]').hasMatch(digits)) {
                          return 'That does not look like an Indian mobile number';
                        }
                        return null;
                      },
                    ),
                    gapMd,
                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(
                        labelText: 'Email',
                        prefixIcon: Icon(Icons.alternate_email, size: 20),
                      ),
                      validator: (v) {
                        final text = (v ?? '').trim();
                        if (text.isEmpty) return 'Required';
                        if (!RegExp(
                          r'^[^@\s]+@[^@\s]+\.[^@\s]+$',
                        ).hasMatch(text)) {
                          return 'Enter a valid email address';
                        }
                        return null;
                      },
                    ),
                  ],
                ),
              ),
              gapMd,

              SoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const LabelXs('Work details (optional)'),
                    const SizedBox(height: Sp.md),
                    TextFormField(
                      controller: _department,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(
                        labelText: 'Department',
                        prefixIcon: Icon(Icons.workspaces_outline, size: 20),
                      ),
                    ),
                    gapMd,
                    TextFormField(
                      controller: _employeeId,
                      decoration: const InputDecoration(
                        labelText: 'Employee ID',
                        prefixIcon: Icon(Icons.tag, size: 20),
                      ),
                    ),
                  ],
                ),
              ),
              gapMd,

              // What happens next, stated plainly before they submit.
              Container(
                padding: const EdgeInsets.all(Sp.md),
                decoration: BoxDecoration(
                  color: (_activate ? c.healthy : c.warning).withValues(
                    alpha: 0.09,
                  ),
                  borderRadius: R.rMd,
                  border: Border.all(
                    color: (_activate ? c.healthy : c.warning).withValues(
                      alpha: 0.3,
                    ),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          _activate
                              ? Icons.check_circle_outline
                              : Icons.hourglass_top_outlined,
                          size: 17,
                          color: _activate ? c.healthy : c.warning,
                        ),
                        const SizedBox(width: Sp.sm),
                        Expanded(
                          child: Text(
                            _activate
                                ? 'They will be active straight away and can '
                                      'sign in as soon as you save.'
                                : 'They will be created as Pending approval. '
                                      'They cannot sign in until you or another '
                                      'manager approves them.',
                            style: AppTypography.body(
                              size: 12.5,
                              color: c.foreground,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (canActivate) ...[
                      const SizedBox(height: Sp.sm),
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        value: _activate,
                        onChanged: (v) => setState(() => _activate = v),
                        title: Text(
                          'Activate immediately',
                          style: AppTypography.body(
                            size: 13.5,
                            weight: FontWeight.w600,
                            color: c.foreground,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),

              if (_submitError != null) ...[
                gapMd,
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: Sp.md,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: c.destructive.withValues(alpha: 0.1),
                    borderRadius: R.rMd,
                    border: Border.all(
                      color: c.destructive.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.error_outline,
                        size: 16,
                        color: c.destructive,
                      ),
                      const SizedBox(width: Sp.sm),
                      Expanded(
                        child: Text(
                          _submitError!,
                          style: AppTypography.body(
                            size: 12.5,
                            color: c.destructive,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              gapSection,
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Add to team'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

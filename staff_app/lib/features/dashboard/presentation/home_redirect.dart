import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers.dart';
import '../../auth/presentation/splash_screen.dart';

/// The `/` route. It never renders anything of its own for long: as soon as
/// the session resolves, [RoleConfig.homeRoute] decides where this particular
/// person's app begins.
///
/// This is the only place "where do I land?" is answered, and it answers it by
/// reading the role map rather than by a chain of if-statements.
class HomeRedirect extends ConsumerStatefulWidget {
  const HomeRedirect({super.key});

  @override
  ConsumerState<HomeRedirect> createState() => _HomeRedirectState();
}

class _HomeRedirectState extends ConsumerState<HomeRedirect> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _go());
  }

  void _go() {
    if (!mounted) return;
    final auth = ref.read(authControllerProvider);
    if (!auth.isAuthenticated) return; // the guards handle every other state
    context.go(ref.read(roleConfigProvider).homeRoute);
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(authControllerProvider, (_, _) => _go());
    return const SplashScreen();
  }
}

import 'package:flutter/material.dart';

import '../core/config/app_config.dart';
import '../theme/app_theme.dart';

/// Reusable authentication shell used by every auth screen so the visual
/// language stays identical. Split-screen on desktop, centered card on mobile.
class AuthShell extends StatelessWidget {
  const AuthShell({super.key, required this.child, this.maxWidth = 440});

  final Widget child;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 960;
    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: SafeArea(
        child: Row(
          children: [
            if (wide) const Expanded(child: _BrandPanel()),
            Expanded(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 40),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: maxWidth),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (!wide) ...[
                          const _Wordmark(),
                          const SizedBox(height: 32),
                        ],
                        child,
                        const SizedBox(height: 28),
                        const _AuthFooter(),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BrandPanel extends StatelessWidget {
  const _BrandPanel();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primaryDark, AppColors.primary],
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(56),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _Wordmark(onDark: true),
            const Spacer(),
            Text(
              'Manage your entire\nhotel portfolio\nfrom one place.',
              style: Theme.of(context).textTheme.displaySmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    height: 1.15,
                  ),
            ),
            const SizedBox(height: 16),
            Text(
              AppConfig.tagline,
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(color: Colors.white70),
            ),
            const Spacer(),
            Row(
              children: const [
                _TrustPill(icon: Icons.verified_user_outlined, label: 'Bank-grade security'),
                SizedBox(width: 12),
                _TrustPill(icon: Icons.bolt_outlined, label: '99.9% uptime'),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _TrustPill extends StatelessWidget {
  const _TrustPill({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadius.xl),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: Colors.white, size: 18),
          const SizedBox(width: 8),
          Text(label, style: const TextStyle(color: Colors.white, fontSize: 13)),
        ],
      ),
    );
  }
}

class _Wordmark extends StatelessWidget {
  const _Wordmark({this.onDark = false});
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final color = onDark ? Colors.white : AppColors.ink;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: onDark ? Colors.white : AppColors.primary,
            borderRadius: BorderRadius.circular(9),
          ),
          child: Icon(
            Icons.apartment_rounded,
            size: 20,
            color: onDark ? AppColors.primary : Colors.white,
          ),
        ),
        const SizedBox(width: 10),
        Text(
          AppConfig.appName,
          style: TextStyle(
            color: color,
            fontSize: 22,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.5,
          ),
        ),
      ],
    );
  }
}

class _AuthFooter extends StatelessWidget {
  const _AuthFooter();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text.rich(
          TextSpan(
            style: const TextStyle(color: AppColors.inkMuted, fontSize: 13),
            children: [
              const TextSpan(text: 'Need help?  '),
              TextSpan(
                text: 'Contact Tavelo Support',
                style: const TextStyle(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        const Text(
          'Support · Privacy · Terms',
          style: TextStyle(color: AppColors.inkFaint, fontSize: 12),
        ),
      ],
    );
  }
}

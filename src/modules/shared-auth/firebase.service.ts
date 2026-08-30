import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { App } from 'firebase-admin/app';

export interface VerifiedGoogleUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

/**
 * Verifies Firebase ID tokens server-side. Initialisation is lazy and
 * failure-tolerant: a bad/missing config never crashes boot — the Google
 * endpoint simply returns a clear error until it is configured.
 */
@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private app: App | null = null;
  private initTried = false;

  constructor(private readonly config: ConfigService) {}

  private async init(): Promise<App | null> {
    if (this.app) return this.app;
    if (this.initTried) return this.app;
    this.initTried = true;
    try {
      const { initializeApp, getApps, cert, applicationDefault } =
        await import('firebase-admin/app');
      const projectId = this.config.get<string>('FIREBASE_PROJECT_ID') ?? 'tavelo-c4669';
      const svcJson = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT');
      const gac = this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS');

      const existing = getApps();
      if (existing.length) {
        this.app = existing[0];
        return this.app;
      }

      if (svcJson) {
        const parsed = JSON.parse(svcJson) as Record<string, string>;
        this.app = initializeApp({
          credential: cert(parsed as never),
          projectId: parsed.project_id ?? projectId,
        });
      } else if (gac) {
        // GOOGLE_APPLICATION_CREDENTIALS points at a file; applicationDefault picks it up.
        this.app = initializeApp({
          credential: applicationDefault(),
          projectId,
        });
      } else {
        // No service account: verifyIdToken still works via Google public certs.
        this.app = initializeApp({ projectId });
      }
      this.logger.log(`firebase-admin initialised (project ${projectId})`);
      return this.app;
    } catch (err) {
      this.logger.error(`firebase-admin init failed: ${(err as Error).message}`);
      this.app = null;
      return null;
    }
  }

  /**
   * Whether push can be sent at all. The PUSH channel checks this so an
   * unconfigured deployment skips (never fails) push deliveries.
   */
  async messagingAvailable(): Promise<boolean> {
    return (await this.init()) !== null;
  }

  /**
   * Fan a single notification out to many device tokens via FCM.
   *
   * Returns the subset of `tokens` FCM reported as permanently invalid
   * (unregistered / malformed) so the caller can revoke them. A configuration
   * failure throws — the delivery pipeline decides whether to retry — but a
   * per-token invalid-registration error is data, not an exception.
   */
  async sendPush(
    tokens: string[],
    message: { title: string; body: string; data?: Record<string, string> },
  ): Promise<{ successCount: number; failureCount: number; invalidTokens: string[] }> {
    if (tokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }
    const app = await this.init();
    if (!app) {
      throw new ServiceUnavailableException('Push messaging is not configured');
    }
    const { getMessaging } = await import('firebase-admin/messaging');
    const response = await getMessaging(app).sendEachForMulticast({
      tokens,
      notification: { title: message.title, body: message.body },
      ...(message.data ? { data: message.data } : {}),
    });

    const invalidTokens: string[] = [];
    response.responses.forEach((r, i) => {
      if (r.success) return;
      const code = r.error?.code ?? '';
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument'
      ) {
        invalidTokens.push(tokens[i]);
      }
    });

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens,
    };
  }

  async verifyIdToken(idToken: string): Promise<VerifiedGoogleUser> {
    const app = await this.init();
    if (!app) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }
    try {
      const { getAuth } = await import('firebase-admin/auth');
      const decoded = await getAuth(app).verifyIdToken(idToken);
      return {
        uid: decoded.uid,
        email: decoded.email ?? null,
        emailVerified: Boolean(decoded.email_verified),
      };
    } catch (err) {
      this.logger.warn(`verifyIdToken failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Invalid Google token');
    }
  }
}

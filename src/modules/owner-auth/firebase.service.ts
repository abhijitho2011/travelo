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

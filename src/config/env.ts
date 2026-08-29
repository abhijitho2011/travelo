import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('/api/v1/admin'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: z.string().default('*'),

  DATABASE_URL: z.string().url(),
  DATABASE_SSL: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  REDIS_URL: z.string().url().optional(),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  THROTTLE_TTL: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),

  SEED_SUPER_ADMIN_EMAIL: z.string().email().default('admin@tavelo.local'),
  SEED_SUPER_ADMIN_PASSWORD: z.string().min(8).default('ChangeMe!12345'),

  // ---------- Super-admin allowlist (Google / mobile-OTP sign-in) ----------
  // Only these exact identities may sign in via Google or OTP. Leaving one
  // unset cleanly disables that method; email+password always keeps working.
  SUPER_ADMIN_EMAIL: z.string().optional(),
  SUPER_ADMIN_MOBILE: z.string().optional(),

  PAYMENT_WEBHOOK_SECRET_RAZORPAY: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET_CASHFREE: z.string().optional(),

  // ---------- Razorpay API credentials (order creation + refunds) ----------
  // Optional on purpose. Without BOTH halves the gateway endpoints return a
  // typed GATEWAY_NOT_CONFIGURED and the manual-payment path still collects
  // money, so an unconfigured deployment is a working one.
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),

  // ---------- Owner auth (separate from admin) ----------
  OWNER_JWT_ACCESS_SECRET: z.string().min(16).default('owner-access-secret-change-me-32chars'),
  OWNER_JWT_REFRESH_SECRET: z.string().min(16).default('owner-refresh-secret-change-me-32chars'),
  OWNER_JWT_ACCESS_TTL: z.string().default('15m'),
  OWNER_JWT_REFRESH_TTL: z.string().default('30d'),

  // ---------- Staff auth (a THIRD token family: not admin, not owner) ----------
  // Separate secrets are what make the isolation real — a staff access token
  // must never verify under the admin or owner secret, and vice versa.
  STAFF_JWT_ACCESS_SECRET: z.string().min(16).default('staff-access-secret-change-me-32chars'),
  STAFF_JWT_REFRESH_SECRET: z.string().min(16).default('staff-refresh-secret-change-me-32chars'),
  STAFF_JWT_ACCESS_TTL: z.string().default('15m'),
  STAFF_JWT_REFRESH_TTL: z.string().default('30d'),

  // ---------- Firebase (Google sign-in for owners) ----------
  FIREBASE_PROJECT_ID: z.string().default('tavelo-c4669'),
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

  // ---------- OTP ----------
  OTP_TTL_MIN: z.coerce.number().int().positive().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  // ---------- SMS provider ----------
  SMS_PROVIDER: z.enum(['console', 'bsnl']).default('console'),
  BSNL_BASE_URL: z.string().optional(),
  BSNL_USERNAME: z.string().optional(),
  BSNL_PASSWORD: z.string().optional(),
  BSNL_HEADER: z.string().optional(),
  BSNL_ENTITY_ID: z.string().optional(),
  BSNL_TEMPLATE_ID: z.string().optional(),
  BSNL_SERVICE_ID: z.string().optional(),
  BSNL_TOKEN_ID: z.string().optional(),
  BSNL_TEMPLATE_VAR_KEY: z.string().default('motcode'),
  BSNL_TOKEN_PATH: z.string().default('/api/Create_New_API_Token'),
  BSNL_SEND_PATH: z.string().default('/api/Send_SMS'),
  BSNL_INSECURE_TLS: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  // A SECOND DLT content template, for non-OTP notification SMS. Unset means
  // notification SMS is skipped — the OTP template must not carry other copy.
  BSNL_NOTIFY_TEMPLATE_ID: z.string().optional(),
  BSNL_NOTIFY_VAR_KEY: z.string().default('message'),

  // ---------- Outbound email (notifications) ----------
  // All optional. Without SMTP_HOST + MAIL_FROM the EMAIL channel degrades to
  // a console provider that logs the message — one boot warning, never a crash.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  MAIL_FROM: z.string().optional(),
  // ---------- Object storage (property photos, invoice documents) ----------
  // `local` writes to the mounted volume; `s3` uses the Railway bucket. The
  // credentials are supplied by Railway reference variables — never committed.
  STORAGE_DRIVER: z.enum(['s3', 'local']).default('local'),
  UPLOADS_DIR: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  RUN_SEED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Environment validation failed');
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}

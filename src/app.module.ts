import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './modules/storage/storage.module';
import { QueueModule } from './queue/queue.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminsModule } from './modules/admins/admins.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { OwnersModule } from './modules/owners/owners.module';
import { OwnerAuthModule } from './modules/owner-auth/owner-auth.module';
import { StaffAuthModule } from './modules/staff-auth/staff-auth.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { StaffModule } from './modules/staff/staff.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { KeyCardsModule } from './modules/key-cards/key-cards.module';
import { FolioModule } from './modules/folio/folio.module';
import { ManagementModule } from './modules/management/management.module';
import { GuestsModule } from './modules/guests/guests.module';
import { StaffExportModule } from './modules/staff-export/staff-export.module';
import { RatesModule } from './modules/rates/rates.module';
import { GroupsModule } from './modules/groups/groups.module';
import { HousekeepingModule } from './modules/housekeeping/housekeeping.module';
import { RestaurantModule } from './modules/restaurant/restaurant.module';
import { SpaModule } from './modules/spa/spa.module';
import { SecurityModule } from './modules/security/security.module';
import { EventsModule } from './modules/events/events.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SalesModule } from './modules/sales/sales.module';
import { TravelDeskModule } from './modules/travel-desk/travel-desk.module';
import { DriverModule } from './modules/driver/driver.module';
import { EntitlementsModule } from './modules/entitlements/entitlements.module';
import { PlansModule } from './modules/plans/plans.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { BillingModule } from './modules/billing/billing.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SupportModule } from './modules/support/support.module';
import { ImpersonationModule } from './modules/impersonation/impersonation.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { SearchModule } from './modules/search/search.module';
import { ExportModule } from './modules/export/export.module';
import { WorkersModule } from './modules/workers/workers.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    // Drives the workers. Without it every worker class is dead code: nothing
    // ever calls run(), so subscriptions never expire and queued notifications
    // are never delivered.
    ScheduleModule.forRoot(),
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('LOG_LEVEL') ?? 'info',
          autoLogging: true,
          customProps: (req) => ({
            requestId: (req.headers['x-request-id'] as string | undefined) ?? undefined,
          }),
          transport:
            config.get<string>('NODE_ENV') === 'production'
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'HH:MM:ss.l' },
                },
        },
      }),
    }),
    // Two tiers. `default` is the broad per-IP ceiling every route inherits;
    // `auth` is a much tighter bucket that sensitive endpoints opt into with
    // `@AuthThrottle()` (login, OTP, MFA) so credential-stuffing and OTP-farming
    // are capped independently of ordinary API traffic.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: Number(config.get<number>('THROTTLE_TTL') ?? 60) * 1000,
          limit: Number(config.get<number>('THROTTLE_LIMIT') ?? 120),
        },
        {
          // The `auth` bucket is inert globally (a high ceiling every route
          // trivially clears) and only bites where a route opts in with
          // @AuthThrottle(), which overrides this limit down to
          // AUTH_THROTTLE_LIMIT for that route. It must exist here for the
          // named override to resolve.
          name: 'auth',
          ttl: Number(config.get<number>('AUTH_THROTTLE_TTL') ?? 60) * 1000,
          limit: 1_000_000,
        },
      ],
    }),
    DatabaseModule,
    StorageModule,
    QueueModule,
    AuditModule,
    PermissionsModule,
    AuthModule,
    AdminsModule,
    RolesModule,
    HealthModule,
    MetricsModule,
    OwnersModule,
    OwnerAuthModule,
    StaffAuthModule,
    EntitlementsModule,
    PropertiesModule,
    StaffModule,
    RoomsModule,
    ReservationsModule,
    KeyCardsModule,
    FolioModule,
    ManagementModule,
    GuestsModule,
    StaffExportModule,
    RatesModule,
    GroupsModule,
    HousekeepingModule,
    RestaurantModule,
    SpaModule,
    SecurityModule,
    EventsModule,
    AccountsModule,
    InventoryModule,
    SalesModule,
    TravelDeskModule,
    DriverModule,
    PlansModule,
    SubscriptionsModule,
    BillingModule,
    AnalyticsModule,
    SupportModule,
    ImpersonationModule,
    AnnouncementsModule,
    NotificationsModule,
    IntegrationsModule,
    JobsModule,
    SearchModule,
    ExportModule,
    WorkersModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}

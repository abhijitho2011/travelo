import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { loadEnv } from '../../config/env';
import { OwnerAuthController } from './owner-auth.controller';
import { OwnerPortalController } from './owner-portal.controller';
import { AdminLocationsController } from './admin-locations.controller';
import { OwnerAuthService } from './owner-auth.service';
import { OwnerOtpService } from './owner-otp.service';
import { OwnerTokenService } from './owner-token.service';
import { OwnerPortalService } from './owner-portal.service';
import { LocationsService } from './locations.service';
import { FirebaseService } from './firebase.service';
import { OwnerJwtGuard } from './owner-jwt.guard';
import { SMS_PROVIDER } from './sms/sms-provider.interface';
import { ConsoleSmsProvider } from './sms/console-sms.provider';
import { BsnlSmsProvider } from './sms/bsnl-sms.provider';

@Module({
  imports: [JwtModule.register({})],
  controllers: [OwnerAuthController, OwnerPortalController, AdminLocationsController],
  providers: [
    OwnerAuthService,
    OwnerOtpService,
    OwnerTokenService,
    OwnerPortalService,
    LocationsService,
    FirebaseService,
    OwnerJwtGuard,
    ConsoleSmsProvider,
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, ConsoleSmsProvider],
      useFactory: (config: ConfigService, consoleProvider: ConsoleSmsProvider) => {
        const logger = new Logger('SmsProviderFactory');
        const provider = config.get<string>('SMS_PROVIDER') ?? 'console';
        if (provider !== 'bsnl') return consoleProvider;
        const env = loadEnv();
        const required = [
          env.BSNL_BASE_URL,
          env.BSNL_USERNAME,
          env.BSNL_PASSWORD,
          env.BSNL_HEADER,
          env.BSNL_ENTITY_ID,
          env.BSNL_TEMPLATE_ID,
          env.BSNL_SERVICE_ID,
          env.BSNL_TOKEN_ID,
        ];
        if (required.some((v) => !v)) {
          logger.warn(
            'SMS_PROVIDER=bsnl but required BSNL_* env vars are missing — falling back to console provider.',
          );
          return consoleProvider;
        }
        logger.log('Using BSNL DLT SMS provider.');
        return new BsnlSmsProvider(env);
      },
    },
  ],
})
export class OwnerAuthModule {}

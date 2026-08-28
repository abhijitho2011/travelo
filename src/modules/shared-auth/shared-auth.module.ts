import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { loadEnv } from '../../config/env';
import { FirebaseService } from './firebase.service';
import { SMS_PROVIDER } from './sms/sms-provider.interface';
import { ConsoleSmsProvider } from './sms/console-sms.provider';
import { BsnlSmsProvider } from './sms/bsnl-sms.provider';

/**
 * Cross-cutting sign-in infrastructure shared by the owner portal and the
 * super-admin portal: Firebase ID-token verification and the SMS provider.
 * Both consumers inject the very same singletons — no duplicated wiring.
 */
@Module({
  providers: [
    FirebaseService,
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
  exports: [FirebaseService, SMS_PROVIDER],
})
export class SharedAuthModule {}

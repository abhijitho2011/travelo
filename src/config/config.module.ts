import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { loadEnv } from './env';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: false,
      envFilePath: ['.env.local', '.env'],
      validate: () => loadEnv(),
    }),
  ],
  exports: [NestConfigModule],
})
export class AppConfigModule {}

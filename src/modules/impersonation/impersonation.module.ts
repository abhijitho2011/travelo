import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ImpersonationService } from './impersonation.service';
import { ImpersonationController } from './impersonation.controller';

@Module({
  imports: [JwtModule.register({})],
  providers: [ImpersonationService],
  controllers: [ImpersonationController],
  exports: [ImpersonationService],
})
export class ImpersonationModule {}

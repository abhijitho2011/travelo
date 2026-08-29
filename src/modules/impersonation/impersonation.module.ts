import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ImpersonationService } from './impersonation.service';
import { ImpersonationAccessService } from './impersonation-access.service';
import { ImpersonationController } from './impersonation.controller';

@Module({
  imports: [JwtModule.register({})],
  providers: [ImpersonationService, ImpersonationAccessService],
  controllers: [ImpersonationController],
  // ImpersonationAccessService is what the OWNER API imports so an
  // impersonation token can be honoured there. Minting stays admin-side.
  exports: [ImpersonationService, ImpersonationAccessService],
})
export class ImpersonationModule {}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { StaffReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [JwtModule.register({}), SharedAuthModule, AuditModule],
  controllers: [StaffReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}

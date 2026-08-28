import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController, WebhookController } from './billing.controller';
import { InvoiceNumberService } from './invoice-number.service';

@Module({
  providers: [BillingService, InvoiceNumberService],
  controllers: [BillingController, WebhookController],
  exports: [BillingService, InvoiceNumberService],
})
export class BillingModule {}

import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController, WebhookController } from './billing.controller';
import { InvoiceNumberService } from './invoice-number.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { RazorpayClient } from './razorpay.client';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  // BillingService notifies the owner on payment success/failure. Without this
  // import Nest cannot resolve NotificationDeliveryService and the whole app
  // fails to boot — tsc cannot see DI wiring and unit tests mock it away, so
  // only starting the app catches it.
  imports: [NotificationsModule],
  providers: [
    BillingService,
    InvoiceNumberService,
    InvoicePdfService,
    // Reads its credentials from process.env in the constructor (kept for
    // unit-test injection), which Nest's class auto-wiring would try to
    // resolve as a provider — hence the explicit factory, same as StorageService.
    { provide: RazorpayClient, useFactory: () => new RazorpayClient(process.env) },
  ],
  controllers: [BillingController, WebhookController],
  exports: [BillingService, InvoiceNumberService, InvoicePdfService],
})
export class BillingModule {}

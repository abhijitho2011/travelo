import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { BillingService } from './billing.service';

class RefundDto {
  @IsInt() @Min(1) amount!: number;
  @IsOptional() @IsString() reason?: string;
}

class CreateInvoiceDto {
  @IsUUID() ownerId!: string;
  @IsOptional() @IsUUID() subscriptionId?: string;
  @IsString() billingPeriodStart!: string;
  @IsString() billingPeriodEnd!: string;
  @IsInt() @Min(0) subtotal!: number;
  @IsOptional() @IsInt() tax?: number;
  @IsOptional() @IsInt() discount?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() dueDate?: string;
}

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly svc: BillingService) {}

  @Get('payments')
  @RequirePermissions('billing.view')
  payments(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('ownerId') ownerId?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.listPayments({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      ownerId,
      status,
    });
  }

  @Get('failed')
  @RequirePermissions('billing.view')
  failed(@Query('limit') limit?: string) {
    return this.svc.listPayments({ limit: limit ? Number(limit) : undefined, failedOnly: true });
  }

  @Get('payments/:id')
  @RequirePermissions('billing.view')
  paymentDetail(@Param('id') id: string) {
    return this.svc.getPayment(id);
  }

  @Post('payments/:id/refund')
  @RequirePermissions('billing.refund')
  refund(@Param('id') id: string, @Body() dto: RefundDto) {
    return this.svc.refundPayment(id, dto);
  }

  @Get('refunds')
  @RequirePermissions('billing.view')
  refunds(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.svc.listRefunds({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('invoices')
  @RequirePermissions('billing.view')
  invoices(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('ownerId') ownerId?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.listInvoices({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      ownerId,
      status,
    });
  }

  @Get('invoices/:id')
  @RequirePermissions('billing.view')
  invoice(@Param('id') id: string) {
    return this.svc.getInvoice(id);
  }

  @Post('invoices')
  @RequirePermissions('invoice.create')
  createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.svc.createInvoice({
      ownerId: dto.ownerId,
      subscriptionId: dto.subscriptionId,
      billingPeriodStart: new Date(dto.billingPeriodStart),
      billingPeriodEnd: new Date(dto.billingPeriodEnd),
      subtotal: dto.subtotal,
      tax: dto.tax,
      discount: dto.discount,
      currency: dto.currency,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
    });
  }

  @Post('invoices/:id/issue')
  @RequirePermissions('invoice.edit')
  issue(@Param('id') id: string) {
    return this.svc.setInvoiceStatus(id, 'ISSUED');
  }

  @Post('invoices/:id/mark-paid')
  @RequirePermissions('invoice.edit')
  markPaid(@Param('id') id: string) {
    return this.svc.setInvoiceStatus(id, 'PAID');
  }

  @Post('invoices/:id/cancel')
  @RequirePermissions('invoice.edit')
  cancel(@Param('id') id: string) {
    return this.svc.setInvoiceStatus(id, 'CANCELLED');
  }
}

@ApiTags('Webhooks')
@Controller('webhooks/payments')
export class WebhookController {
  constructor(private readonly svc: BillingService) {}

  @Public()
  @Post(':provider')
  handle(
    @Param('provider') provider: string,
    @Req() req: Request,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const rawBody =
      (req as unknown as { rawBody?: Buffer }).rawBody?.toString() ?? JSON.stringify(body ?? {});
    return this.svc.handleWebhook(provider, {
      headers,
      rawBody,
      parsedBody: body,
    });
  }
}

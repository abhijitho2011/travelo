import { Controller, Get, Query, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OwnerJwtGuard } from './owner-jwt.guard';
import { CurrentOwner, AuthenticatedOwner } from './current-owner.decorator';
import { OwnerSubscriptionService } from './owner-subscription.service';
import { PaginationDto } from './dto';

/** Read-only: plan changes are an admin action, never a self-service one. */
@ApiTags('Owner Subscription')
@ApiBearerAuth()
@UseGuards(OwnerJwtGuard)
@Controller({ path: 'api/v1/owner', version: VERSION_NEUTRAL })
export class OwnerSubscriptionController {
  constructor(private readonly svc: OwnerSubscriptionService) {}

  @Get('subscription')
  current(@CurrentOwner() owner: AuthenticatedOwner) {
    return this.svc.current(owner.id);
  }

  @Get('subscription/invoices')
  invoices(@CurrentOwner() owner: AuthenticatedOwner, @Query() page: PaginationDto) {
    return this.svc.invoices(owner.id, page);
  }
}

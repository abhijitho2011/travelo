import { Body, Controller, Get, Post, Query, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OwnerJwtGuard } from './owner-jwt.guard';
import { CurrentOwner, AuthenticatedOwner } from './current-owner.decorator';
import { OwnerSubscriptionService } from './owner-subscription.service';
import { CreateSubscriptionOrderDto, PaginationDto } from './dto';

/** Plan changes stay an admin action; paying for the next period is self-serve. */
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

  /**
   * Raise a gateway order to pay for the owner's own next period. Returns the
   * order id and the fields a Razorpay/Cashfree checkout widget needs; the
   * webhook settles the parked PENDING payment when the money lands.
   */
  @Post('subscription/orders')
  createOrder(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Body() dto: CreateSubscriptionOrderDto,
  ) {
    return this.svc.createOrder(owner.id, dto.gateway);
  }
}

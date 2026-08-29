import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OwnerJwtGuard } from './owner-jwt.guard';
import { CurrentOwner, AuthenticatedOwner } from './current-owner.decorator';
import { OwnerSupportService } from './owner-support.service';
import { CreateTicketDto, TicketFilterDto, TicketMessageDto } from './dto';

@ApiTags('Owner Support')
@ApiBearerAuth()
@UseGuards(OwnerJwtGuard)
@Controller({ path: 'api/v1/owner/support', version: VERSION_NEUTRAL })
export class OwnerSupportController {
  constructor(private readonly svc: OwnerSupportService) {}

  @Get('tickets')
  list(@CurrentOwner() owner: AuthenticatedOwner, @Query() filter: TicketFilterDto) {
    return this.svc.list(owner.id, filter);
  }

  @Post('tickets')
  create(@CurrentOwner() owner: AuthenticatedOwner, @Body() dto: CreateTicketDto) {
    return this.svc.create(owner.id, dto);
  }

  @Get('tickets/:id')
  get(@CurrentOwner() owner: AuthenticatedOwner, @Param('id') id: string) {
    return this.svc.get(owner.id, id);
  }

  @Post('tickets/:id/messages')
  reply(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Param('id') id: string,
    @Body() dto: TicketMessageDto,
  ) {
    return this.svc.addMessage(owner.id, id, dto.body);
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { OwnerJwtGuard } from './owner-jwt.guard';
import { CurrentOwner, AuthenticatedOwner } from './current-owner.decorator';
import { OwnerSupportService } from './owner-support.service';
import { CreateTicketDto, TicketFilterDto, TicketMessageDto } from './dto';
import { MAX_ATTACHMENT_BYTES, UploadedAttachment } from '../support/support-attachment.util';

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

  @Post('tickets/:id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } }),
  )
  attach(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Param('id') id: string,
    @UploadedFile() file: UploadedAttachment,
  ) {
    return this.svc.addAttachment(owner.id, id, file);
  }
}

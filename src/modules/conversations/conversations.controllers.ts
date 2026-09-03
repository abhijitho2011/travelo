import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { ConversationsService } from './conversations.service';

class SendMessageDto {
  @IsIn(['SMS', 'EMAIL', 'WHATSAPP', 'INTERNAL']) channel!:
    'SMS' | 'EMAIL' | 'WHATSAPP' | 'INTERNAL';
  @IsString() @Length(1, 2000) body!: string;
}
class StartConversationDto extends SendMessageDto {
  @IsUUID() reservationId!: string;
}
class InboundDto {
  @IsUUID() propertyId!: string;
  @IsIn(['SMS', 'EMAIL', 'WHATSAPP']) channel!: 'SMS' | 'EMAIL' | 'WHATSAPP';
  @IsString() @Length(3, 254) from!: string;
  @IsString() @Length(1, 4000) body!: string;
  @IsOptional() @IsString() @Length(0, 160) name?: string;
}

@ApiTags('Staff Conversations')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/conversations', version: VERSION_NEUTRAL })
export class StaffConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireStaffPermissions('conversation.read')
  list(@CurrentStaff() me: AuthenticatedStaff) {
    return this.conversations.list(me.propertyId);
  }

  /** Start (or continue) the thread for a booking. */
  @Post()
  @RequireStaffPermissions('conversation.send')
  async start(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: StartConversationDto) {
    const msg = await this.conversations.send(me.propertyId, {
      reservationId: dto.reservationId,
      channel: dto.channel,
      body: dto.body,
      sentBy: me.id,
    });
    await this.audit.record({
      action: 'staff.conversation.message_sent',
      entity: 'message',
      entityId: msg.id,
      after: { channel: dto.channel },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return msg;
  }

  @Get(':id')
  @RequireStaffPermissions('conversation.read')
  thread(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.conversations.thread(me.propertyId, id);
  }

  @Post(':id/messages')
  @RequireStaffPermissions('conversation.send')
  async send(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    const msg = await this.conversations.send(me.propertyId, {
      conversationId: id,
      channel: dto.channel,
      body: dto.body,
      sentBy: me.id,
    });
    await this.audit.record({
      action: 'staff.conversation.message_sent',
      entity: 'message',
      entityId: msg.id,
      after: { channel: dto.channel },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return msg;
  }
}

/**
 * Provider-agnostic inbound webhook. The SMS/WhatsApp/email provider is
 * configured to POST here with a shared secret (INBOUND_MESSAGE_SECRET);
 * without the secret set, inbound is off and the route answers 400.
 */
@ApiTags('Public Inbound Messages')
@Controller({ path: 'api/v1/public/inbound', version: VERSION_NEUTRAL })
export class PublicInboundController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post('message')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async inbound(@Headers('x-inbound-secret') secret: string | undefined, @Body() dto: InboundDto) {
    const expected = process.env['INBOUND_MESSAGE_SECRET'];
    if (!expected || secret !== expected)
      throw new BadRequestException({
        error: 'INBOUND_DISABLED',
        message: 'Inbound messaging is not configured',
      });
    const msg = await this.conversations.receive(dto.propertyId, {
      channel: dto.channel,
      from: dto.from,
      body: dto.body,
      name: dto.name,
    });
    return { ok: true, id: msg.id };
  }
}

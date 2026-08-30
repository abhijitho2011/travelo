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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SupportService } from './support.service';
import { MAX_ATTACHMENT_BYTES, UploadedAttachment } from './support-attachment.util';

class CreateTicketDto {
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsUUID() propertyId?: string;
  @IsString() subject!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']) priority?: string;
  @IsOptional() @IsString() body?: string;
}

class MessageDto {
  @IsString() body!: string;
  @IsOptional() @IsBoolean() isInternalNote?: boolean;
}

class AssignDto {
  @IsUUID() adminId!: string;
}

@ApiTags('Support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('support/tickets')
export class SupportController {
  constructor(private readonly svc: SupportService) {}

  @Get()
  @RequirePermissions('support.view')
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.svc.list({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      status,
      q,
      ownerId,
    });
  }

  @Post()
  @RequirePermissions('support.reply')
  create(@Body() dto: CreateTicketDto) {
    return this.svc.create(dto);
  }

  @Get(':id')
  @RequirePermissions('support.view')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post(':id/messages')
  @RequirePermissions('support.reply')
  message(@Param('id') id: string, @Body() dto: MessageDto) {
    return this.svc.postMessage(id, dto);
  }

  @Post(':id/attachments')
  @RequirePermissions('support.reply')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } }),
  )
  attach(@Param('id') id: string, @UploadedFile() file: UploadedAttachment) {
    return this.svc.addAttachment(id, file);
  }

  @Post(':id/assign')
  @RequirePermissions('support.assign')
  assign(@Param('id') id: string, @Body() dto: AssignDto) {
    return this.svc.assign(id, dto.adminId);
  }

  @Post(':id/resolve')
  @RequirePermissions('support.resolve')
  resolve(@Param('id') id: string) {
    return this.svc.setStatus(id, 'RESOLVED');
  }

  @Post(':id/close')
  @RequirePermissions('support.resolve')
  close(@Param('id') id: string) {
    return this.svc.setStatus(id, 'CLOSED');
  }
}

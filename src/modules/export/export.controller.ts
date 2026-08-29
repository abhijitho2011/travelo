import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsService } from '../permissions/permissions.service';
import { AuthenticatedAdmin } from '../../common/decorators/current-admin.decorator';
import { AuditService } from '../audit/audit.service';
import { EXPORT_PERMISSIONS, ExportService } from './export.service';

/**
 * `GET /api/v1/admin/export/:entity.csv`
 *
 * Two things make this route unlike every other one in the API:
 *
 *   1. `@Res()` takes it OUT of the JSON envelope interceptor — the same trick
 *      the owner property-photo raw route uses. A CSV wrapped in
 *      `{success, data, meta}` is not a CSV.
 *   2. The permission is chosen from the entity at runtime, so
 *      `@RequirePermissions` (a compile-time decorator) cannot express it and
 *      `PermissionsGuard` is not applied. The check below is that guard's logic,
 *      done explicitly — and it runs BEFORE a single row is read.
 */
@ApiTags('Export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('export')
export class ExportController {
  constructor(
    private readonly svc: ExportService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
  ) {}

  @Get(':entity')
  async export(
    @Param('entity') entityParam: string,
    @Query() query: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Both `/export/owners.csv` and `/export/owners` resolve to the same thing;
    // the extension is for the browser's benefit, not the router's.
    const entity = ExportService.assertEntity(entityParam.replace(/\.csv$/i, ''));

    const admin = (req as unknown as { admin?: AuthenticatedAdmin }).admin;
    if (!admin) throw new ForbiddenException('Not authenticated');
    const required = EXPORT_PERMISSIONS[entity];
    const effective = await this.permissions.getEffectivePermissions(admin.id);
    if (!PermissionsService.matches(required, effective.permissions)) {
      throw new ForbiddenException(`Missing required permissions: ${required.join(', ')}`);
    }

    // An export is a bulk read of production data. It is an audited event.
    await this.audit.record({
      action: 'export.csv',
      entity,
      after: { filters: query },
    });

    const filename = ExportService.filename(entity);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');

    for await (const line of this.svc.rows(entity, query)) {
      // Respect backpressure: a slow client must not force the whole export
      // into this process's memory.
      if (!res.write(line)) {
        await new Promise<void>((resolve) => res.once('drain', resolve));
      }
    }
    res.end();
  }
}

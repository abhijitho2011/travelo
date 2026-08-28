import { Inject, Injectable, Module, NotFoundException } from '@nestjs/common';
import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { and, desc, eq, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { backgroundJobs } from '../../database/schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class JobsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list(params: { limit?: number; offset?: number; state?: string; queue?: string }) {
    const limit = Math.min(params.limit ?? 100, 200);
    const offset = params.offset ?? 0;
    const conds: SQL[] = [];
    if (params.state) conds.push(eq(backgroundJobs.state, params.state));
    if (params.queue) conds.push(eq(backgroundJobs.queue, params.queue));
    const where = conds.length ? and(...conds) : undefined;
    return this.db
      .select()
      .from(backgroundJobs)
      .where(where)
      .orderBy(desc(backgroundJobs.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async get(id: string) {
    const [row] = await this.db
      .select()
      .from(backgroundJobs)
      .where(eq(backgroundJobs.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('Job not found');
    return row;
  }

  async retry(id: string) {
    const before = await this.get(id);
    await this.db
      .update(backgroundJobs)
      .set({
        state: 'Pending',
        attempts: before.attempts + 1,
        error: null,
        startedAt: null,
        finishedAt: null,
      })
      .where(eq(backgroundJobs.id, id));
    await this.audit.record({ action: 'job.retried', entity: 'job', entityId: id, before });
    return this.get(id);
  }
}

@ApiTags('Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly svc: JobsService) {}

  @Get()
  @RequirePermissions('job.view')
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('state') state?: string,
    @Query('queue') queue?: string,
  ) {
    return this.svc.list({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      state,
      queue,
    });
  }

  @Get(':id')
  @RequirePermissions('job.view')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post(':id/retry')
  @RequirePermissions('job.retry')
  retry(@Param('id') id: string) {
    return this.svc.retry(id);
  }
}

@Module({ providers: [JobsService], controllers: [JobsController], exports: [JobsService] })
export class JobsModule {}

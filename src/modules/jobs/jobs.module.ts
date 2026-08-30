import { Inject, Injectable, Module, NotFoundException, Optional } from '@nestjs/common';
import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { and, desc, eq, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { backgroundJobs } from '../../database/schema';
import { NotificationDispatchWorker } from '../workers/workers.module';
import { WorkersModule } from '../workers/workers.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class JobsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
    @Optional() private readonly dispatch?: NotificationDispatchWorker,
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

  /**
   * A background_job row is a RECORD of a worker RUN, not a queued unit of work,
   * so a retry cannot replay the row itself — it re-drives the queue the row
   * belongs to. The only queue is 'notifications'; retrying re-runs the dispatch
   * worker (which re-attempts the still-PENDING deliveries) and stamps this row
   * with the fresh outcome. An unknown queue falls back to a best-effort reset.
   */
  async retry(id: string) {
    const before = await this.get(id);

    if (before.queue === 'notifications' && this.dispatch) {
      await this.db
        .update(backgroundJobs)
        .set({
          state: 'Running',
          attempts: before.attempts + 1,
          error: null,
          startedAt: new Date(),
          finishedAt: null,
        })
        .where(eq(backgroundJobs.id, id));
      let state = 'Completed';
      let error: string | null = null;
      try {
        await this.dispatch.run();
      } catch (err) {
        state = 'Failed';
        error = ((err as Error)?.message ?? String(err)).slice(0, 2000);
      }
      await this.db
        .update(backgroundJobs)
        .set({ state, error, finishedAt: new Date() })
        .where(eq(backgroundJobs.id, id));
      await this.audit.record({
        action: 'job.retried',
        entity: 'job',
        entityId: id,
        before,
        after: { state },
      });
      return this.get(id);
    }

    // Unknown queue — reset to Pending so the row is at least re-queued.
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

@Module({
  imports: [WorkersModule],
  providers: [JobsService],
  controllers: [JobsController],
  exports: [JobsService],
})
export class JobsModule {}

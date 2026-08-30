import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { MetricsService } from './metrics.service';

/**
 * Prometheus scrape target at `/metrics` (mounted outside the API prefix and
 * marked @Public, like the health probes). Uses `@Res()` to write raw text,
 * which — as with the CSV/PDF routes — takes it out of the JSON `{success,data}`
 * envelope the global interceptor applies, so the body is valid Prometheus
 * exposition rather than a wrapped string. Kept out of the OpenAPI doc.
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @Get()
  @ApiExcludeEndpoint()
  scrape(@Res() res: Response): void {
    res.type('text/plain; version=0.0.4').send(this.metrics.render());
  }
}

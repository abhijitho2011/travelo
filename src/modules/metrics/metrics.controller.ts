import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { MetricsService } from './metrics.service';

/**
 * Prometheus scrape target at `/metrics` (mounted outside the API prefix and
 * marked @Public, like the health probes). Kept out of the OpenAPI doc — it is
 * infrastructure, not part of the product API.
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @Get()
  @ApiExcludeEndpoint()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  scrape(): string {
    return this.metrics.render();
  }
}

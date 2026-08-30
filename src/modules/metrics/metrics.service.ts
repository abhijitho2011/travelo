import { Injectable } from '@nestjs/common';

/**
 * A tiny, dependency-free metrics registry.
 *
 * It keeps process counters in memory and renders them in the Prometheus text
 * exposition format at `/metrics`, so a Railway/Grafana scraper (or a curl in a
 * pinch) sees request volume, error rate and process health without pulling in
 * a full client library. Counters are per-process and reset on restart — that
 * is exactly what a scraper expects from a counter.
 */
@Injectable()
export class MetricsService {
  private readonly startedAtMs = Date.now();
  private total = 0;
  private byClass: Record<'2xx' | '3xx' | '4xx' | '5xx', number> = {
    '2xx': 0,
    '3xx': 0,
    '4xx': 0,
    '5xx': 0,
  };
  private errors = 0;

  /** Record one completed HTTP response by its status code. */
  record(statusCode: number): void {
    this.total += 1;
    if (statusCode >= 500) this.byClass['5xx'] += 1;
    else if (statusCode >= 400) this.byClass['4xx'] += 1;
    else if (statusCode >= 300) this.byClass['3xx'] += 1;
    else if (statusCode >= 200) this.byClass['2xx'] += 1;
  }

  /** An unhandled/exception path — counted separately from status classes. */
  recordError(): void {
    this.errors += 1;
  }

  /** Prometheus text exposition. */
  render(): string {
    const mem = process.memoryUsage();
    const uptimeSeconds = (Date.now() - this.startedAtMs) / 1000;
    const lines: string[] = [];

    const metric = (
      name: string,
      help: string,
      type: 'counter' | 'gauge',
      samples: Array<[string, number]>,
    ) => {
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${type}`);
      for (const [labels, value] of samples) {
        lines.push(labels ? `${name}{${labels}} ${value}` : `${name} ${value}`);
      }
    };

    metric('tavelo_http_requests_total', 'Total HTTP responses served.', 'counter', [
      ['status="2xx"', this.byClass['2xx']],
      ['status="3xx"', this.byClass['3xx']],
      ['status="4xx"', this.byClass['4xx']],
      ['status="5xx"', this.byClass['5xx']],
    ]);
    metric('tavelo_http_requests_sum', 'Total HTTP responses across all classes.', 'counter', [
      ['', this.total],
    ]);
    metric('tavelo_http_errors_total', 'Requests that ended in an unhandled error.', 'counter', [
      ['', this.errors],
    ]);
    metric('tavelo_process_uptime_seconds', 'Process uptime in seconds.', 'gauge', [
      ['', Number(uptimeSeconds.toFixed(1))],
    ]);
    metric('tavelo_process_resident_memory_bytes', 'Resident set size in bytes.', 'gauge', [
      ['', mem.rss],
    ]);
    metric('tavelo_process_heap_used_bytes', 'V8 heap used in bytes.', 'gauge', [
      ['', mem.heapUsed],
    ]);

    return lines.join('\n') + '\n';
  }
}

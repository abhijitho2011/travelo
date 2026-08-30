import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map, tap } from 'rxjs';
import { getRequestContext } from '../context/request-context';
import { MetricsService } from '../../modules/metrics/metrics.service';

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta: {
    requestId?: string;
    timestamp: string;
  };
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, SuccessEnvelope<T>> {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<SuccessEnvelope<T>> {
    return next.handle().pipe(
      tap(() => {
        // A handler that returns normally counts as its response status (200/201).
        const res = context.switchToHttp().getResponse<{ statusCode?: number }>();
        this.metrics.record(res?.statusCode ?? 200);
      }),
      map((data) => ({
        success: true as const,
        data,
        meta: {
          requestId: getRequestContext()?.requestId,
          timestamp: new Date().toISOString(),
        },
      })),
    );
  }
}

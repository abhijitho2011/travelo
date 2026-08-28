import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { getRequestContext } from '../context/request-context';

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
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<SuccessEnvelope<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        meta: {
          requestId: getRequestContext()?.requestId,
          timestamp: new Date().toISOString(),
        },
      })),
    );
  }
}

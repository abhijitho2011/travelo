import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
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
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  SuccessEnvelope<T> | StreamableFile
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessEnvelope<T> | StreamableFile> {
    return next.handle().pipe(
      map((data) =>
        // A file download is the response body; wrapping it in the JSON
        // envelope would corrupt it.
        data instanceof StreamableFile
          ? data
          : {
              success: true as const,
              data,
              meta: {
                requestId: getRequestContext()?.requestId,
                timestamp: new Date().toISOString(),
              },
            },
      ),
    );
  }
}

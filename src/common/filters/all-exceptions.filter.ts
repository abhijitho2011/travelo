import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { getRequestContext } from '../context/request-context';
import { MetricsService } from '../../modules/metrics/metrics.service';

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    requestId?: string;
    timestamp: string;
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  // Optional so a direct `new AllExceptionsFilter()` in a unit test still works;
  // in the running app the @Global MetricsModule always supplies it.
  constructor(@Optional() private readonly metrics?: MetricsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      if (typeof resp === 'string') {
        message = resp;
      } else if (typeof resp === 'object' && resp !== null) {
        const r = resp as Record<string, unknown>;
        message = (r.message as string) ?? message;
        code = ((r.error as string) ?? code).toUpperCase().replace(/\s+/g, '_');
        details = r.details ?? (Array.isArray(r.message) ? r.message : undefined);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const requestId = getRequestContext()?.requestId;

    // Count every error response, and 5xx separately as an unhandled error.
    this.metrics?.record(status);
    if (status >= 500) this.metrics?.recordError();

    const envelope: ErrorEnvelope = {
      success: false,
      error: { code, message, details },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    };

    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} -> ${status} ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(envelope);
  }
}

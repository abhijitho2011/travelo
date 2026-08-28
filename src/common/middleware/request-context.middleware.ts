import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { requestContext } from '../context/request-context';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId =
      (req.headers['x-request-id'] as string | undefined) ??
      (req.headers['x-correlation-id'] as string | undefined) ??
      uuid();
    res.setHeader('x-request-id', requestId);
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.ip ??
      req.socket?.remoteAddress ??
      undefined;
    const userAgent = req.headers['user-agent'];
    requestContext.run(
      {
        requestId,
        ip,
        userAgent: typeof userAgent === 'string' ? userAgent : undefined,
      },
      () => next(),
    );
  }
}

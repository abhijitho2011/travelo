import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedOwner {
  id: string;
  email: string;
  name: string;
  status: string;
  sessionId: string;
}

export const CurrentOwner = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedOwner => {
    const req = ctx.switchToHttp().getRequest();
    return req.owner as AuthenticatedOwner;
  },
);

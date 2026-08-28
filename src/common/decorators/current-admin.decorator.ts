import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  name: string;
  status: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
}

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin => {
    const req = ctx.switchToHttp().getRequest();
    return req.admin as AuthenticatedAdmin;
  },
);

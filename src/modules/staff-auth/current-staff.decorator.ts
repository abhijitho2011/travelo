import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedStaff {
  id: string;
  propertyId: string;
  ownerId: string;
  role: string;
  email: string;
  mobile: string;
  firstName: string;
  lastName: string;
  status: string;
  sessionId: string;
  /** Resolved server-side from the role map on every request — never from the token. */
  permissions: string[];
}

export const CurrentStaff = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedStaff => {
    const req = ctx.switchToHttp().getRequest();
    return req.staff as AuthenticatedStaff;
  },
);

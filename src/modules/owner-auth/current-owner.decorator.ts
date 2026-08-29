import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Present only when the request is being served through a Tavelo support
 * impersonation session. The owner app renders a permanent banner from this
 * and disables every write control.
 */
export interface OwnerImpersonationContext {
  active: true;
  /** Display name of the admin behind the session. */
  byAdmin: string;
  byAdminEmail: string;
  actorAdminId: string;
  sessionId: string;
  startedAt: string;
}

export interface AuthenticatedOwner {
  id: string;
  email: string;
  name: string;
  status: string;
  sessionId: string;
  impersonation?: OwnerImpersonationContext;
}

export const CurrentOwner = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedOwner => {
    const req = ctx.switchToHttp().getRequest();
    return req.owner as AuthenticatedOwner;
  },
);

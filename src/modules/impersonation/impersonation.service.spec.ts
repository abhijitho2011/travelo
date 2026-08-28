import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ImpersonationService } from './impersonation.service';

describe('ImpersonationService.issueToken', () => {
  const jwt = new JwtService({});
  const config = { getOrThrow: () => 'test-secret-1234567890abcdef' } as unknown as ConfigService;
  const svc = new ImpersonationService({} as never, jwt, config);

  it('issues a JWT with impersonation issuer, sessionId, actor, target and jti', async () => {
    const token = await svc.issueToken({
      sessionId: 'sess-1',
      actorAdminId: 'admin-1',
      targetUserId: 'target-1',
      jti: 'jti-abc',
    });
    const decoded = jwt.verify(token, { secret: 'test-secret-1234567890abcdef' }) as {
      iss: string;
      jti: string;
      sessionId: string;
      actorAdminId: string;
      targetUserId: string;
      exp: number;
      iat: number;
    };
    expect(decoded.iss).toBe(ImpersonationService.IMPERSONATION_ISSUER);
    expect(decoded.jti).toBe('jti-abc');
    expect(decoded.sessionId).toBe('sess-1');
    expect(decoded.actorAdminId).toBe('admin-1');
    expect(decoded.targetUserId).toBe('target-1');
    // TTL ~1 hour.
    expect(decoded.exp - decoded.iat).toBe(ImpersonationService.IMPERSONATION_TTL_SECONDS);
  });
});

import { OwnerSessionsService } from './owner-sessions.service';
import { mockAudit, mockDb, sqlText, type Row } from './testing/db.mock';

const CURRENT = 'sess-current';

function session(over: Row = {}): Row {
  return {
    id: 'sess-1',
    ownerId: 'own-1',
    ip: '203.0.113.7',
    userAgent: 'Dart/3.12 (dart:io)',
    createdAt: new Date('2026-08-20T09:00:00Z'),
    expiresAt: new Date('2026-09-20T09:00:00Z'),
    revokedAt: null,
    ...over,
  };
}

function svcWith(over: { sessions?: Row[]; revoked?: Row[] } = {}) {
  const db = mockDb({
    select: { owner_sessions: [over.sessions ?? [session()]] },
    update: { owner_sessions: over.revoked ?? [{ id: 'sess-1' }, { id: 'sess-2' }] },
  });
  const audit = mockAudit();
  return { db, audit, svc: new OwnerSessionsService(db as never, audit as never) };
}

describe('OwnerSessionsService.list', () => {
  it('flags the session behind the presented token as the current device', async () => {
    const { svc } = svcWith({
      sessions: [session({ id: CURRENT }), session({ id: 'sess-2' })],
    });
    const rows = await svc.list('own-1', CURRENT);
    expect(rows.map((r) => r.current)).toEqual([true, false]);
    expect(rows[0]).toMatchObject({
      id: CURRENT,
      ip: '203.0.113.7',
      userAgent: 'Dart/3.12 (dart:io)',
    });
  });

  it('lists only this owner’s live sessions', async () => {
    const { svc, db } = svcWith();
    await svc.list('own-1', CURRENT);
    const where = db.wheresFor('owner_sessions').map(sqlText).join(' ');
    expect(where).toContain('owner_id');
    expect(where).toContain('revoked_at is null');
  });

  it('never returns a refresh token hash', async () => {
    const { svc } = svcWith();
    const [row] = await svc.list('own-1', CURRENT);
    expect(row).not.toHaveProperty('refreshTokenHash');
    expect(Object.keys(row).sort()).toEqual([
      'createdAt',
      'current',
      'expiresAt',
      'id',
      'ip',
      'userAgent',
    ]);
  });
});

describe('OwnerSessionsService.revoke', () => {
  it('revokes another device without flagging it as the current one', async () => {
    const { svc, db } = svcWith();
    await expect(svc.revoke('own-1', 'sess-1', CURRENT)).resolves.toMatchObject({
      id: 'sess-1',
      revoked: true,
      wasCurrent: false,
    });
    expect(db.updates[0].values).toHaveProperty('revokedAt');
  });

  it('allows revoking the current session but says so plainly', async () => {
    const { svc } = svcWith({ sessions: [session({ id: CURRENT })] });
    const res = await svc.revoke('own-1', CURRENT, CURRENT);
    expect(res.wasCurrent).toBe(true);
    expect(res.message).toMatch(/signed out/i);
  });

  it('404s for a session id belonging to somebody else', async () => {
    const { svc, db } = svcWith({ sessions: [] });
    await expect(svc.revoke('own-1', 'someone-elses-session', CURRENT)).rejects.toMatchObject({
      status: 404,
      response: { error: 'SESSION_NOT_FOUND' },
    });
    expect(db.updates).toHaveLength(0);
  });

  it('audits the revocation against the owner', async () => {
    const { svc, audit } = svcWith();
    await svc.revoke('own-1', 'sess-1', CURRENT);
    expect(audit.entries[0]).toMatchObject({
      action: 'owner.session.revoked',
      entityId: 'sess-1',
      actorId: 'own-1',
      actorRole: 'OWNER',
    });
  });
});

describe('OwnerSessionsService.revokeAll', () => {
  it('KEEPS the current session alive while ending every other one', async () => {
    const { svc, db } = svcWith();
    const res = await svc.revokeAll('own-1', CURRENT);
    expect(res).toMatchObject({ revoked: 2, keptSessionId: CURRENT });

    // The write must exclude the current session, or the owner signs
    // themselves out of the device they are holding.
    const where = db.updates[0].where.map(sqlText).join(' ');
    expect(where).toContain('owner_id');
    expect(where).toContain('revoked_at is null');
    expect(where).toMatch(/id\s*<>\s*sess-current/);
  });

  it('reports honestly when there was nothing else to sign out', async () => {
    const { svc } = svcWith({ revoked: [] });
    await expect(svc.revokeAll('own-1', CURRENT)).resolves.toMatchObject({
      revoked: 0,
      message: 'No other devices were signed in.',
    });
  });

  it('audits which sessions went and which one stayed', async () => {
    const { svc, audit } = svcWith();
    await svc.revokeAll('own-1', CURRENT);
    expect(audit.entries[0]).toMatchObject({
      action: 'owner.session.revoked_all',
      actorId: 'own-1',
      actorRole: 'OWNER',
      after: { revoked: ['sess-1', 'sess-2'], keptSessionId: CURRENT },
    });
  });
});

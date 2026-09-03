import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeGateway', () => {
  function gateway(verify: () => Promise<unknown>) {
    const jwt = { verifyAsync: jest.fn(verify) };
    const config = { getOrThrow: () => 'secret' };
    const g = new RealtimeGateway(jwt as never, config as never);
    const emitted: unknown[] = [];
    g.server = {
      to: (room: string) => ({ emit: (ev: string, p: unknown) => emitted.push({ room, ev, p }) }),
    } as never;
    return { g, emitted };
  }
  const socket = (token: string) => {
    const s = {
      handshake: { auth: { token } },
      data: {} as Record<string, unknown>,
      join: jest.fn(async () => undefined),
      disconnect: jest.fn(),
    };
    return s;
  };

  it('a valid staff token joins exactly its own property room', async () => {
    const { g } = gateway(async () => ({ sub: 'st', propertyId: 'prop-1' }));
    const s = socket('good');
    await g.handleConnection(s as never);
    expect(s.join).toHaveBeenCalledWith('property:prop-1');
    expect(s.disconnect).not.toHaveBeenCalled();
  });

  it('a bad token is disconnected without joining anything', async () => {
    const { g } = gateway(async () => {
      throw new Error('bad');
    });
    const s = socket('forged');
    await g.handleConnection(s as never);
    expect(s.join).not.toHaveBeenCalled();
    expect(s.disconnect).toHaveBeenCalledWith(true);
  });

  it('emits are scoped to the property room', () => {
    const { g, emitted } = gateway(async () => ({}));
    g.emit('prop-1', 'room.status', { id: 'r', status: 'READY' });
    expect(emitted).toEqual([
      expect.objectContaining({ room: 'property:prop-1', ev: 'room.status' }),
    ]);
  });
});

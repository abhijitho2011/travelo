import type { FirebaseService } from '../../shared-auth/firebase.service';
import type { DeviceTokensService } from '../device-tokens.service';
import { FcmPushChannel, PushDeliverySkipped } from './fcm-push.channel';

type PushResult = { successCount: number; failureCount: number; invalidTokens: string[] };

function make(opts: {
  available?: boolean;
  tokens?: string[];
  result?: PushResult;
  sendThrows?: Error;
}) {
  const revoked: string[] = [];
  const deviceTokens = {
    activeTokensFor: jest.fn().mockResolvedValue(opts.tokens ?? []),
    revokeMany: jest.fn(async (t: string[]) => {
      revoked.push(...t);
    }),
  } as unknown as DeviceTokensService;
  const firebase = {
    messagingAvailable: jest.fn().mockResolvedValue(opts.available ?? true),
    sendPush: jest.fn(async () => {
      if (opts.sendThrows) throw opts.sendThrows;
      return opts.result ?? { successCount: 1, failureCount: 0, invalidTokens: [] };
    }),
  } as unknown as FirebaseService;
  return { channel: new FcmPushChannel(deviceTokens, firebase), deviceTokens, firebase, revoked };
}

const MSG = { body: 'You have a new booking', subject: 'Tavelo' };

describe('FcmPushChannel', () => {
  it('skips (permanently) when the recipient is not a device principal', async () => {
    const { channel } = make({});
    await expect(channel.send('admin:a-1', MSG)).rejects.toBeInstanceOf(PushDeliverySkipped);
  });

  it('skips when push messaging is not configured', async () => {
    const { channel, firebase } = make({ available: false, tokens: ['t1'] });
    await expect(channel.send('owner:o-1', MSG)).rejects.toBeInstanceOf(PushDeliverySkipped);
    expect(firebase.sendPush).not.toHaveBeenCalled();
  });

  it('skips when the principal has no registered devices', async () => {
    const { channel } = make({ tokens: [] });
    await expect(channel.send('staff:s-1', MSG)).rejects.toBeInstanceOf(PushDeliverySkipped);
  });

  it('delivers and revokes tokens FCM reports as unregistered', async () => {
    const { channel, revoked } = make({
      tokens: ['good', 'dead'],
      result: { successCount: 1, failureCount: 1, invalidTokens: ['dead'] },
    });
    await expect(channel.send('owner:o-1', MSG)).resolves.toBeUndefined();
    expect(revoked).toEqual(['dead']);
  });

  it('throws (retryable) when every token fails for a transient reason', async () => {
    const { channel } = make({
      tokens: ['a', 'b'],
      result: { successCount: 0, failureCount: 2, invalidTokens: [] },
    });
    await expect(channel.send('owner:o-1', MSG)).rejects.not.toBeInstanceOf(PushDeliverySkipped);
  });

  it('does not throw when the only failures were invalid tokens (all revoked)', async () => {
    const { channel, revoked } = make({
      tokens: ['dead1', 'dead2'],
      result: { successCount: 0, failureCount: 2, invalidTokens: ['dead1', 'dead2'] },
    });
    await expect(channel.send('owner:o-1', MSG)).resolves.toBeUndefined();
    expect(revoked).toEqual(['dead1', 'dead2']);
  });
});

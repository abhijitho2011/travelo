import { AuthService } from './auth.service';

describe('AuthService (password)', () => {
  it('hashes and verifies a password', async () => {
    const hash = await AuthService.hashPassword('CorrectHorseBattery9!');
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(AuthService.verifyPassword(hash, 'CorrectHorseBattery9!')).resolves.toBe(true);
    await expect(AuthService.verifyPassword(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('returns false on malformed hash instead of throwing', async () => {
    await expect(AuthService.verifyPassword('not-a-hash', 'x')).resolves.toBe(false);
  });
});

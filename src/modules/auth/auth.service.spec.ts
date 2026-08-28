import { AuthService } from './auth.service';

// Password sign-in has been removed; these argon2 helpers now only protect
// stored refresh tokens.
describe('AuthService argon2 helpers', () => {
  it('hashes and verifies a secret', async () => {
    const hash = await AuthService.hashPassword('CorrectHorseBattery9!');
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(AuthService.verifyPassword(hash, 'CorrectHorseBattery9!')).resolves.toBe(true);
    await expect(AuthService.verifyPassword(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('exposes no password login entry point', () => {
    expect((AuthService.prototype as unknown as Record<string, unknown>).login).toBeUndefined();
  });

  it('returns false on malformed hash instead of throwing', async () => {
    await expect(AuthService.verifyPassword('not-a-hash', 'x')).resolves.toBe(false);
  });
});

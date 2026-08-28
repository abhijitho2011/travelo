import { PermissionsService } from './permissions.service';

describe('PermissionsService.matches (RBAC guard logic)', () => {
  it('allows when required is empty', () => {
    expect(PermissionsService.matches([], ['admin.view'])).toBe(true);
  });
  it('allows on wildcard grant', () => {
    expect(PermissionsService.matches(['admin.create', 'billing.refund'], ['*'])).toBe(true);
  });
  it('allows on exact match', () => {
    expect(PermissionsService.matches(['admin.view'], ['admin.view', 'audit.view'])).toBe(true);
  });
  it('allows on group wildcard grant', () => {
    expect(PermissionsService.matches(['admin.create'], ['admin.*'])).toBe(true);
  });
  it('denies when any required perm is missing', () => {
    expect(PermissionsService.matches(['admin.view', 'billing.refund'], ['admin.view'])).toBe(
      false,
    );
  });
  it('denies unrelated group wildcards', () => {
    expect(PermissionsService.matches(['billing.refund'], ['admin.*'])).toBe(false);
  });
});

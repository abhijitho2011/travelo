import { DirectBillingService } from './direct-billing.service';
import { mockDb } from '../owner-auth/testing/db.mock';

describe('DirectBillingService', () => {
  it('the statement runs a balance: charges up, payments down', async () => {
    const db = mockDb({
      select: {
        corporate_accounts: [[{ id: 'acc', propertyId: 'p', name: 'Infosys' }]],
        corporate_ledger: [
          [
            { id: 'e1', kind: 'CHARGE', amountPaise: 900_000 },
            { id: 'e2', kind: 'PAYMENT', amountPaise: 400_000 },
            { id: 'e3', kind: 'CHARGE', amountPaise: 100_000 },
          ],
        ],
        reservations: [[]],
      },
    });
    const st = await new DirectBillingService(db as never).statement('p', 'acc');
    expect(st.entries.map((e) => e.runningBalancePaise)).toEqual([900_000, 500_000, 600_000]);
    expect(st.balancePaise).toBe(600_000);
  });

  it('a charge to an account at another property is a 404', async () => {
    const db = mockDb({ select: { corporate_accounts: [[]] } });
    await expect(
      new DirectBillingService(db as never).charge({
        propertyId: 'p',
        accountId: 'x',
        amountPaise: 1,
      }),
    ).rejects.toMatchObject({
      response: { error: 'CORPORATE_ACCOUNT_NOT_FOUND' },
    });
  });
});

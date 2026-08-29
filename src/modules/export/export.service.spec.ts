import { ExportService } from './export.service';

/** Pages of `{items}` handed out in call order, like a real list service. */
function pager(pages: Record<string, unknown>[][]) {
  let i = 0;
  const calls: Record<string, unknown>[] = [];
  return {
    list: async (params: Record<string, unknown>) => {
      calls.push(params);
      return { items: pages[i++] ?? [] };
    },
    calls,
  };
}

function service(overrides: Partial<Record<string, unknown>> = {}) {
  const empty = () => pager([[]]);
  const parts = {
    owners: empty(),
    properties: empty(),
    staff: empty(),
    subscriptions: empty(),
    billing: {
      listPayments: async () => ({ items: [] }),
      listInvoices: async () => ({ items: [] }),
    },
    audit: { list: async () => ({ rows: [] }) },
    ...overrides,
  } as unknown as Record<string, never>;
  return {
    parts,
    svc: new ExportService(
      parts.owners,
      parts.properties,
      parts.staff,
      parts.subscriptions,
      parts.billing,
      parts.audit,
    ),
  };
}

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let out = '';
  for await (const line of gen) out += line;
  return out;
}

describe('ExportService.rows', () => {
  it('emits a header row even when there is no data', async () => {
    const { svc } = service();
    const csv = await collect(svc.rows('owners', {}));
    expect(csv.split('\r\n')[0]).toBe(
      'id,name,email,phone,company,gstNumber,city,state,district,country,pinCode,status,createdAt,lastActiveAt',
    );
    expect(csv.trim().split('\r\n')).toHaveLength(1);
  });

  it('escapes commas, quotes and newlines in real data', async () => {
    const { svc } = service({
      owners: pager([
        [
          {
            id: 'o1',
            name: 'Beta, Ltd',
            email: 'a@b.test',
            company: 'He said "hi"',
            city: 'line1\nline2',
            status: 'ACTIVE',
          },
        ],
      ]),
    });
    const csv = await collect(svc.rows('owners', {}));
    const dataRow = csv.split('\r\n')[1];
    expect(dataRow).toContain('"Beta, Ltd"');
    expect(dataRow).toContain('"He said ""hi"""');
    expect(dataRow).toContain('"line1\nline2"');
  });

  it('forwards the caller filters to the underlying list service', async () => {
    const owners = pager([[]]);
    const { svc } = service({ owners });
    await collect(svc.rows('owners', { status: 'SUSPENDED', q: 'kochi', stateId: 'st-1' }));
    expect(owners.calls[0]).toMatchObject({
      status: 'SUSPENDED',
      q: 'kochi',
      stateId: 'st-1',
      limit: 200,
      offset: 0,
    });
  });

  it('pages until a short page comes back', async () => {
    const full = Array.from({ length: 200 }, (_, i) => ({ id: `o${i}`, name: `n${i}` }));
    const owners = pager([full, [{ id: 'last', name: 'Last' }]]);
    const { svc } = service({ owners });
    const csv = await collect(svc.rows('owners', {}));
    // header + 200 + 1
    expect(csv.trimEnd().split('\r\n')).toHaveLength(202);
    expect(owners.calls.map((c) => c.offset)).toEqual([0, 200]);
  });

  it('renders money columns as the stored paise integers', async () => {
    const { svc } = service({
      billing: {
        listInvoices: async () => ({
          items: [
            {
              id: 'i1',
              invoiceNumber: 'INV-202608-000001',
              subtotal: 3_000_000,
              tax: 0,
              discount: 0,
              total: 3_000_000,
              currency: 'INR',
              status: 'PAID',
              storageKey: 'invoices/own-1/INV-202608-000001.pdf',
            },
          ],
        }),
        listPayments: async () => ({ items: [] }),
      },
    });
    const csv = await collect(svc.rows('invoices', {}));
    const [header, row] = csv.split('\r\n');
    expect(header).toContain('subtotalPaise,taxPaise,discountPaise,totalPaise');
    expect(row).toContain('3000000,0,0,3000000');
    // The internal object key never leaves the API — only whether one exists.
    expect(row).not.toContain('invoices/own-1');
    expect(row.endsWith('true')).toBe(true);
  });

  it('flattens audit before/after payloads into quoted JSON', async () => {
    const { svc } = service({
      audit: {
        list: async () => ({
          rows: [
            {
              id: 'a1',
              action: 'owner.updated',
              before: { name: 'Old, Name' },
              after: { name: 'New' },
            },
          ],
        }),
      },
    });
    const csv = await collect(svc.rows('audit-logs', {}));
    expect(csv).toContain('"{""name"":""Old, Name""}"');
  });
});

describe('ExportService.assertEntity', () => {
  it('accepts the seven supported entities', () => {
    for (const e of [
      'owners',
      'properties',
      'staff',
      'subscriptions',
      'payments',
      'invoices',
      'audit-logs',
    ]) {
      expect(ExportService.assertEntity(e)).toBe(e);
    }
  });

  it('rejects anything else with a typed error', () => {
    expect(() => ExportService.assertEntity('admins')).toThrow(/Unknown export entity/);
  });
});

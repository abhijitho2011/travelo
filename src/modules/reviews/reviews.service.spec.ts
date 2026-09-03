import { ReviewsService } from './reviews.service';
import { mockDb } from '../owner-auth/testing/db.mock';

describe('ReviewsService', () => {
  const saved = process.env['ANTHROPIC_API_KEY'];
  afterEach(() => {
    if (saved === undefined) delete process.env['ANTHROPIC_API_KEY'];
    else process.env['ANTHROPIC_API_KEY'] = saved;
  });

  it('lists with the average, the unanswered count, and whether drafting is available', async () => {
    delete process.env['ANTHROPIC_API_KEY'];
    const db = mockDb({
      select: { reviews: [[{ id: 'r1', rating: 4 }], [{ count: 3, avg: 4.333, unanswered: 2 }]] },
    });
    const out = await new ReviewsService(db as never).list('p');
    expect(out.count).toBe(3);
    expect(out.averageRating).toBe(4.33);
    expect(out.unanswered).toBe(2);
    expect(out.aiDraftingAvailable).toBe(false);
  });

  it('drafting without a key says so instead of failing silently', async () => {
    delete process.env['ANTHROPIC_API_KEY'];
    const db = mockDb({
      select: {
        reviews: [
          [{ id: 'r1', propertyId: 'p', rating: 2, body: 'Cold shower', source: 'GOOGLE' }],
        ],
      },
    });
    await expect(new ReviewsService(db as never).draft('p', 'r1')).rejects.toMatchObject({
      response: { error: 'AI_NOT_CONFIGURED' },
    });
  });

  it('a reply is stamped with who and when', async () => {
    const db = mockDb({
      select: { reviews: [[{ id: 'r1', propertyId: 'p' }]] },
      update: { reviews: [{ id: 'r1', response: 'Thank you', respondedBy: 'st' }] },
    });
    const row = await new ReviewsService(db as never).respond('p', 'r1', 'Thank you', 'st');
    expect(row.response).toBe('Thank you');
    expect(db.updates.find((u) => u.table === 'reviews')?.values).toMatchObject({
      response: 'Thank you',
      respondedBy: 'st',
      respondedAt: expect.any(Date),
    });
  });
});

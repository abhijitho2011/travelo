import Anthropic from '@anthropic-ai/sdk';
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { properties, reviews, type Review } from '../../database/schema';

export interface ReviewInput {
  source?: Review['source'];
  guestName?: string;
  rating: number;
  title?: string;
  body?: string;
  reviewedAt?: string;
  externalUrl?: string;
  reservationId?: string;
}

/**
 * Reviews: what guests said, wherever they said it, and the hotel's replies.
 *
 * OTAs do not hand out review feeds without a partnership, so reviews arrive
 * here by hand or import, and the reply is copied back to the platform. The
 * value is in one place to read them and in a drafted reply that sounds like
 * the hotel rather than a template — that draft comes from Claude when an
 * API key is configured, and is always a draft: a person sends it.
 */
@Injectable()
export class ReviewsService {
  private readonly log = new Logger(ReviewsService.name);
  private readonly anthropic = process.env['ANTHROPIC_API_KEY'] ? new Anthropic() : null;

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(propertyId: string, limit = 100) {
    const rows = await this.db
      .select()
      .from(reviews)
      .where(eq(reviews.propertyId, propertyId))
      .orderBy(desc(reviews.createdAt))
      .limit(limit);
    const [agg] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        avg: sql<number>`coalesce(avg(${reviews.rating}), 0)`,
        unanswered: sql<number>`count(*) filter (where ${reviews.response} is null)::int`,
      })
      .from(reviews)
      .where(eq(reviews.propertyId, propertyId));
    return {
      items: rows,
      count: Number(agg?.count ?? 0),
      averageRating: Number(Number(agg?.avg ?? 0).toFixed(2)),
      unanswered: Number(agg?.unanswered ?? 0),
      aiDraftingAvailable: !!this.anthropic,
    };
  }

  async require(propertyId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(reviews)
      .where(and(eq(reviews.id, id), eq(reviews.propertyId, propertyId)))
      .limit(1);
    if (!row)
      throw new NotFoundException({ error: 'REVIEW_NOT_FOUND', message: 'Review not found' });
    return row;
  }

  async create(propertyId: string, dto: ReviewInput) {
    const [row] = await this.db
      .insert(reviews)
      .values({ propertyId, ...dto })
      .returning();
    return row;
  }

  async respond(propertyId: string, id: string, response: string, staffId: string) {
    await this.require(propertyId, id);
    const [row] = await this.db
      .update(reviews)
      .set({ response, respondedAt: new Date(), respondedBy: staffId })
      .where(eq(reviews.id, id))
      .returning();
    return row;
  }

  /**
   * A drafted reply. Claude sees the review, the rating and the hotel's name
   * and nothing else about the guest; the desk edits before it goes out.
   */
  async draft(
    propertyId: string,
    id: string,
    tone: 'warm' | 'formal' | 'brief' = 'warm',
  ): Promise<{ draft: string }> {
    const review = await this.require(propertyId, id);
    if (!this.anthropic) {
      throw new ServiceUnavailableException({
        error: 'AI_NOT_CONFIGURED',
        message: 'Reply drafting needs an Anthropic API key on the server',
      });
    }
    const [prop] = await this.db
      .select({ name: properties.name, city: properties.city })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);
    const response = await this.anthropic.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1024,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system:
        `You draft public replies to guest reviews for ${prop?.name ?? 'a hotel'}${prop?.city ? ` in ${prop.city}` : ''}. ` +
        'Write as the hotel, in the first person plural, in plain warm English. Thank the guest, acknowledge the specific things they mentioned, ' +
        'own any problem without excuses or promises you cannot keep, and invite them back. No emojis, no marketing slogans, no invented details. ' +
        `Tone: ${tone}. Length: ${tone === 'brief' ? '2-3 sentences' : '4-6 sentences'}. Output only the reply text.`,
      messages: [
        {
          role: 'user',
          content: `Rating: ${review.rating}/5\nSource: ${review.source}\nGuest: ${review.guestName ?? 'a guest'}\nTitle: ${review.title ?? ''}\n\nReview:\n${review.body ?? '(no text)'}`,
        },
      ],
    });
    if (response.stop_reason === 'refusal') {
      throw new ServiceUnavailableException({
        error: 'AI_DECLINED',
        message: 'The assistant declined to draft this one — write it by hand',
      });
    }
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n')
      .trim();
    if (!text)
      throw new ServiceUnavailableException({
        error: 'AI_EMPTY',
        message: 'No draft came back — try again',
      });
    return { draft: text };
  }
}

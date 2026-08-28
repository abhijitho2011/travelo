import { Controller, Get, Inject, Injectable, Module, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ilike, or, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { invoices, owners, properties, supportTickets } from '../../database/schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@Injectable()
export class SearchService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async search(q: string, types: string[]) {
    const like = `%${q}%`;
    const result: Record<string, unknown[]> = {};
    const wanted = types.length
      ? new Set(types)
      : new Set(['owners', 'properties', 'invoices', 'tickets']);
    if (wanted.has('owners')) {
      result.owners = await this.db
        .select({
          id: owners.id,
          name: owners.name,
          company: owners.company,
          email: owners.email,
        })
        .from(owners)
        .where(or(ilike(owners.name, like), ilike(owners.company, like), ilike(owners.email, like)))
        .limit(10);
    }
    if (wanted.has('properties')) {
      result.properties = await this.db
        .select({ id: properties.id, name: properties.name, city: properties.city })
        .from(properties)
        .where(or(ilike(properties.name, like), ilike(properties.city, like)))
        .limit(10);
    }
    if (wanted.has('invoices')) {
      result.invoices = await this.db
        .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, total: invoices.total })
        .from(invoices)
        .where(ilike(invoices.invoiceNumber, like))
        .limit(10);
    }
    if (wanted.has('tickets')) {
      result.tickets = await this.db
        .select({
          id: supportTickets.id,
          subject: supportTickets.subject,
          status: supportTickets.status,
        })
        .from(supportTickets)
        .where(ilike(supportTickets.subject, like))
        .limit(10);
    }
    return result;
  }
}

@ApiTags('Search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly svc: SearchService) {}

  @Get()
  @RequirePermissions('search.query')
  search(@Query('q') q: string, @Query('types') types?: string) {
    if (!q || q.length < 2) return { owners: [], properties: [], invoices: [], tickets: [] };
    return this.svc.search(q, types ? types.split(',').map((s) => s.trim()) : []);
  }
}

@Module({ providers: [SearchService], controllers: [SearchController] })
export class SearchModule {}

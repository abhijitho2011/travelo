/**
 * A REAL HTTP surface for the security suite.
 *
 * Every other spec in this repository constructs one service or one guard by
 * hand. That proves the unit does what it says; it cannot prove the *route* is
 * protected, because a guard that is never applied still passes its own unit
 * test. These tests therefore boot the whole `AppModule`, mount it exactly as
 * `main.ts` does (same global prefix, same exclusions), and drive it over HTTP
 * with supertest.
 *
 * Nothing connects to anything: `DRIZZLE` and `PG_POOL` are replaced with the
 * scriptable stand-in below, and no Redis URL is configured so the queue and
 * permission caches fall back to memory.
 *
 * NOTE ON ENV: `config.module.ts` validates the environment at *import* time,
 * so the variables must exist before `./app.module` is first required. That is
 * why `installTestEnv()` is called at module scope by each spec and AppModule
 * is pulled in through a dynamic `import()` — the same trick
 * `src/app.bootstrap.spec.ts` uses.
 */
import { INestApplication, RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getTableName } from 'drizzle-orm';

export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://user:pass@db.invalid:5432/tavelo',
  JWT_ACCESS_SECRET: 'admin-access-secret-for-tests-32chars',
  JWT_REFRESH_SECRET: 'admin-refresh-secret-for-tests-32chars',
  OWNER_JWT_ACCESS_SECRET: 'owner-access-secret-for-tests-32chars',
  OWNER_JWT_REFRESH_SECRET: 'owner-refresh-secret-for-tests-32chars',
  STAFF_JWT_ACCESS_SECRET: 'staff-access-secret-for-tests-32chars',
  STAFF_JWT_REFRESH_SECRET: 'staff-refresh-secret-for-tests-32chars',
  API_PREFIX: '/api/v1/admin',
  LOG_LEVEL: 'fatal',
};

/** Must run before `./app.module` is imported. Call it at module scope. */
export function installTestEnv(extra: Record<string, string> = {}): void {
  for (const [k, v] of Object.entries({ ...TEST_ENV, ...extra })) {
    process.env[k] = process.env[k] ?? v;
  }
  // A configured Redis would make the permission cache global across tests.
  delete process.env.REDIS_URL;
}

export type Row = Record<string, unknown>;

/** One query the application issued, as the router sees it. */
export interface QueryInfo {
  table: string;
  kind: 'select' | 'insert' | 'update' | 'delete';
  /** Flattened SQL text of every `where` clause, lower-cased. */
  where: string;
  /** How many queries of this kind have already hit this table. */
  index: number;
  /** Values passed to `.set()` / `.values()`. */
  values?: Row;
  /**
   * True when the projection is aggregate-only (`count(*)`, `sum(...)`).
   * Postgres answers such a query with exactly one row even when nothing
   * matches, and services rely on that — `const [{ total }] = …`. A router that
   * returns nothing for an aggregate query therefore gets a single zeroed row
   * rather than an `undefined` destructure, which is a bug in the stand-in and
   * not in the code under test.
   */
  aggregate: boolean;
  /**
   * Tables brought in by `*Join`. A joined SELECT projects a NESTED shape
   * (`{ o: ownersRow, stateName }`), so a fixture has to know which of the two
   * a given query wants.
   */
  joins: string[];
}

export type Route = Row[] | ((q: QueryInfo) => Row[]);
export type Routes = Record<string, Route>;

/**
 * Flattens a Drizzle `SQL` tree to readable text so a route can branch on the
 * predicate a service actually built ("does this WHERE mention owner-2?").
 */
export function sqlText(node: unknown): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(sqlText).join(' ');
  if (typeof node !== 'object') return String(node);
  const n = node as Record<string, unknown>;
  if (Array.isArray(n.queryChunks)) return n.queryChunks.map(sqlText).join(' ');
  if (Array.isArray(n.value)) return (n.value as unknown[]).map(sqlText).join(' ');
  if (typeof n.name === 'string' && 'table' in n) return n.name;
  if ('value' in n) return String(n.value);
  return '';
}

export interface ScriptDb {
  routes: Routes;
  /** Every query issued, newest last. */
  log: QueryInfo[];
  reset(): void;
}

export type FakeDb = ScriptDb & Record<string, unknown>;

/**
 * A table-aware Drizzle stand-in. Result sets are keyed by table name and
 * resolved by a function that can inspect the WHERE clause, so tenant scoping
 * ("… AND owner_id = $me") can be honoured rather than assumed.
 */
export function scriptDb(routes: Routes = {}): FakeDb {
  const counters = new Map<string, number>();
  const state: ScriptDb = {
    routes,
    log: [],
    reset() {
      state.log.splice(0);
      counters.clear();
    },
  };

  function tableName(t: unknown): string {
    try {
      return getTableName(t as never);
    } catch {
      return 'unknown';
    }
  }

  /** Aggregate-only projections: every selected column is an aggregate call. */
  function isAggregate(fields: unknown): { keys: string[] } | null {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null;
    const entries = Object.entries(fields as Record<string, unknown>);
    if (entries.length === 0) return null;
    const all = entries.every(([, v]) => /\b(count|sum|avg|min|max)\s*\(/i.test(sqlText(v)));
    return all ? { keys: entries.map(([k]) => k) } : null;
  }

  function resolve(info: QueryInfo, agg: { keys: string[] } | null): Row[] {
    const route = state.routes[info.table];
    const rows = route ? (typeof route === 'function' ? route(info) : route) : [];
    if (rows.length === 0 && agg) {
      return [Object.fromEntries(agg.keys.map((k) => [k, 0]))];
    }
    return rows;
  }

  function begin(table: unknown, kind: QueryInfo['kind'], values?: Row, fields?: unknown) {
    const name = tableName(table);
    const key = `${name}:${kind}`;
    const index = counters.get(key) ?? 0;
    counters.set(key, index + 1);
    const agg = kind === 'select' ? isAggregate(fields) : null;
    const info: QueryInfo = {
      table: name,
      kind,
      where: '',
      index,
      values,
      aggregate: !!agg,
      joins: [],
    };
    state.log.push(info);
    return chain(info, agg);
  }

  /**
   * Chainable AND awaitable at every step: services `await` after `.where()`,
   * `.limit()` or `.returning()` alike.
   */
  function chain(info: QueryInfo, agg: { keys: string[] } | null): Record<string, unknown> {
    const c: Record<string, unknown> = {};
    const pass = () => c;
    for (const m of ['innerJoin', 'leftJoin', 'rightJoin', 'fullJoin']) {
      c[m] = (t: unknown) => {
        info.joins.push(tableName(t));
        return c;
      };
    }
    for (const m of [
      'orderBy',
      'groupBy',
      'having',
      'limit',
      'offset',
      'returning',
      'onConflictDoNothing',
      'onConflictDoUpdate',
      'for',
    ]) {
      c[m] = pass;
    }
    c.where = (cond: unknown) => {
      info.where = `${info.where} ${sqlText(cond)}`.trim().toLowerCase();
      return c;
    };
    c.then = (res: (v: Row[]) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(resolve(info, agg)).then(res, rej);
    return c;
  }

  const db: Record<string, unknown> = {
    ...state,
    select: (fields?: unknown) => ({ from: (t: unknown) => begin(t, 'select', undefined, fields) }),
    selectDistinct: (fields?: unknown) => ({
      from: (t: unknown) => begin(t, 'select', undefined, fields),
    }),
    insert: (t: unknown) => ({ values: (v: Row) => begin(t, 'insert', v) }),
    update: (t: unknown) => ({ set: (v: Row) => begin(t, 'update', v) }),
    delete: (t: unknown) => begin(t, 'delete'),
    execute: async () => ({ rows: [] as Row[] }),
    transaction: <T>(cb: (tx: unknown) => Promise<T>): Promise<T> => cb(db),
  };
  return db as FakeDb;
}

export interface Harness {
  app: INestApplication;
  db: FakeDb;
  close(): Promise<void>;
}

/**
 * Boots the application over HTTP. `main.ts` is the contract being mirrored
 * here — if the prefix or its exclusions drift, these tests hit 404s and say so.
 */
export async function bootSecurityApp(
  routes: Routes = {},
  /** Extra provider overrides, e.g. a capturing SMS provider. */
  overrides: { token: unknown; value: unknown }[] = [],
): Promise<Harness> {
  const { AppModule } = await import('../app.module');
  const { DRIZZLE, PG_POOL } = await import('../database/database.module');

  const db = scriptDb(routes);
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DRIZZLE)
    .useValue(db)
    // Overridden so no socket is ever opened; the pool is only reached by raw
    // `execute` paths, which the stand-in above answers.
    .overrideProvider(PG_POOL)
    .useValue({
      query: async () => ({ rows: [] }),
      end: async () => undefined,
      on: () => undefined,
    });
  for (const o of overrides) {
    builder = builder.overrideProvider(o.token).useValue(o.value);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix(process.env.API_PREFIX ?? '/api/v1/admin', {
    exclude: [
      { path: 'health', method: RequestMethod.ALL },
      { path: 'health/live', method: RequestMethod.ALL },
      { path: 'health/ready', method: RequestMethod.ALL },
      { path: 'api/v1/owner/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/staff/(.*)', method: RequestMethod.ALL },
    ],
  });
  await app.init();
  return { app, db, close: () => app.close() };
}

/** One registered HTTP route, as Express knows it. */
export interface MountedRoute {
  method: string;
  path: string;
}

/**
 * Every route the application actually serves, read back out of the Express
 * router.
 *
 * Asserting on this is how a test can say "no such endpoint exists" — a claim
 * that cannot be made by probing a handful of URLs and getting 404s, because
 * the next 404 might be the one that isn't.
 */
export function mountedRoutes(app: INestApplication): MountedRoute[] {
  const server = app.getHttpAdapter().getInstance() as {
    _router?: { stack: unknown[] };
    router?: { stack: unknown[] };
  };
  const stack = (server._router ?? server.router)?.stack ?? [];
  const out: MountedRoute[] = [];
  for (const layer of stack as { route?: { path: string; methods: Record<string, boolean> } }[]) {
    if (!layer.route) continue;
    for (const [method, on] of Object.entries(layer.route.methods)) {
      if (on) out.push({ method: method.toUpperCase(), path: layer.route.path });
    }
  }
  return out;
}

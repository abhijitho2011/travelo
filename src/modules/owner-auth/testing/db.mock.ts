import { getTableName } from 'drizzle-orm';

/**
 * A table-aware stand-in for the Drizzle client.
 *
 * The hand-rolled chains elsewhere in this suite queue result sets positionally,
 * which makes a test break the moment a service reorders two unrelated queries.
 * This one keys result sets by the table passed to `.from()` / `.update()` /
 * `.insert()`, and records every `where` clause so a test can assert on the
 * predicate a service actually built — which is how the tenant-scoping and
 * internal-note rules are verified.
 */

export type Row = Record<string, unknown>;

export interface RecordedQuery {
  table: string;
  where: unknown[];
  values?: Row;
}

export interface MockDbOptions {
  /** table name -> result sets handed out in call order to `select().from()`. */
  select?: Record<string, Row[][]>;
  /** table name -> rows returned by `update(...).returning()`. */
  update?: Record<string, Row[]>;
  /** table name -> rows returned by `insert(...).returning()`. */
  insert?: Record<string, Row[]>;
  /** Thrown by the next `update(...)` on this table (to exercise 23505 paths). */
  updateThrows?: Record<string, unknown>;
}

export interface MockDb {
  select: (...args: unknown[]) => unknown;
  update: (table: unknown) => unknown;
  insert: (table: unknown) => unknown;
  delete: (table: unknown) => unknown;
  transaction: <T>(cb: (tx: MockDb) => Promise<T>) => Promise<T>;
  /** Every query the service issued, in order. */
  selects: RecordedQuery[];
  updates: RecordedQuery[];
  inserts: RecordedQuery[];
  deletes: RecordedQuery[];
  /** All `where` clauses issued against one table, oldest first. */
  wheresFor(table: string): unknown[];
}

function tableName(t: unknown): string {
  try {
    return getTableName(t as never);
  } catch {
    return 'unknown';
  }
}

/**
 * Flattens a Drizzle `SQL` tree into readable text — `"deleted_at is null"`,
 * `"is_internal_note = false"` — so a test can assert on a predicate without
 * reaching for a real database.
 */
export function sqlText(node: unknown): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(sqlText).join('');
  if (typeof node !== 'object') return String(node);

  const n = node as Record<string, unknown>;
  if (Array.isArray(n.queryChunks)) return n.queryChunks.map(sqlText).join('');
  // StringChunk carries its literal fragments in an array.
  if (Array.isArray(n.value)) return (n.value as unknown[]).map(sqlText).join('');
  // A Column renders as its database column name.
  if (typeof n.name === 'string' && 'table' in n) return n.name;
  // A bound Param renders as its value, so `eq(col, false)` is visible.
  if ('value' in n) return String(n.value);
  return '';
}

export function mockDb(opts: MockDbOptions = {}): MockDb {
  const cursors = new Map<string, number>();
  const db: MockDb = {
    selects: [],
    updates: [],
    inserts: [],
    deletes: [],
    wheresFor(table) {
      return this.selects.filter((s) => s.table === table).flatMap((s) => s.where);
    },
    select() {
      return {
        from: (table: unknown) => {
          const name = tableName(table);
          const i = cursors.get(name) ?? 0;
          cursors.set(name, i + 1);
          const rows = opts.select?.[name]?.[i] ?? [];
          const record: RecordedQuery = { table: name, where: [] };
          db.selects.push(record);
          return chain(rows, record);
        },
      };
    },
    update(table: unknown) {
      const name = tableName(table);
      return {
        set: (values: Row) => {
          const record: RecordedQuery = { table: name, where: [], values };
          db.updates.push(record);
          const thrown = opts.updateThrows?.[name];
          const rows = opts.update?.[name] ?? [];
          if (thrown !== undefined) {
            const boom = () => Promise.reject(thrown);
            return {
              where: () => ({
                returning: boom,
                then: (_r: unknown, j: (e: unknown) => void) => j(thrown),
              }),
              returning: boom,
            };
          }
          return chain(rows, record);
        },
      };
    },
    insert(table: unknown) {
      const name = tableName(table);
      return {
        values: (values: Row) => {
          const record: RecordedQuery = { table: name, where: [], values };
          db.inserts.push(record);
          return chain(opts.insert?.[name] ?? [], record);
        },
      };
    },
    delete(table: unknown) {
      const name = tableName(table);
      const record: RecordedQuery = { table: name, where: [] };
      db.deletes.push(record);
      return chain([], record);
    },
    transaction<T>(cb: (tx: MockDb) => Promise<T>): Promise<T> {
      return cb(db);
    },
  };

  /**
   * Every node is both chainable and awaitable, so a service can `await` after
   * `.where(...)` (count queries) or after `.limit(1)` / `.returning()` alike.
   */
  function chain(rows: Row[], record: RecordedQuery): Record<string, unknown> {
    const c: Record<string, unknown> = {};
    const passthrough = () => c;
    for (const m of [
      'innerJoin',
      'leftJoin',
      'rightJoin',
      'fullJoin',
      'orderBy',
      'groupBy',
      'having',
      'limit',
      'offset',
      'returning',
      'onConflictDoNothing',
    ]) {
      c[m] = passthrough;
    }
    c.where = (cond: unknown) => {
      record.where.push(cond);
      return c;
    };
    c.then = (res: (v: Row[]) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(res, rej);
    return c;
  }

  return db;
}

/** Records `AuditService.record` calls without touching a database. */
export function mockAudit() {
  const entries: Record<string, unknown>[] = [];
  return {
    entries,
    record: async (input: Record<string, unknown>) => {
      entries.push(input);
    },
  };
}

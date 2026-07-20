/**
 * A minimal in-memory stand-in for the subset of the Prisma client the
 * meter engine uses, for fast, deterministic unit tests that don't require
 * a running Postgres instance.
 *
 * This is NOT a substitute for integration testing against real Postgres --
 * see docs/TESTING.md for how to run the full suite against a real
 * database (e.g. via `docker compose up db` locally, or in CI). It exists
 * so the state-machine and scheduling *logic* -- the part with the most
 * subtle correctness requirements -- can be tested fast and in isolation.
 */
import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function toComparable(v: unknown): number {
  return v instanceof Date ? v.getTime() : (v as number);
}

function matchesWhere(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "in" || key === "not") return true; // handled by caller when needed
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      const obj = value as Record<string, unknown>;
      if ("in" in obj) return (obj.in as unknown[]).includes(row[key]);
      if ("lte" in obj || "gte" in obj || "lt" in obj || "gt" in obj) {
        const actual = toComparable(row[key]);
        if ("lte" in obj && !(actual <= toComparable(obj.lte))) return false;
        if ("gte" in obj && !(actual >= toComparable(obj.gte))) return false;
        if ("lt" in obj && !(actual < toComparable(obj.lt))) return false;
        if ("gt" in obj && !(actual > toComparable(obj.gt))) return false;
        return true;
      }
      // Compound unique object, e.g. { apiKeyId_key: { apiKeyId, key } }
      return Object.entries(obj).every(([innerKey, innerVal]) => valuesEqual(row[innerKey], innerVal));
    }
    return valuesEqual(row[key], value);
  });
}

function applyData(row: Row, data: Row): void {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "increment" in (v as Row)) {
      row[k] = (row[k] as number) + ((v as Row).increment as number);
    } else {
      row[k] = v;
    }
  }
  row.updatedAt = new Date();
}

export function createFakeTable() {
  const rows: Row[] = [];

  // Real Prisma always deserializes a fresh object per query -- two
  // concurrent callers never share a mutable reference to the same row.
  // Query methods below return clones for that reason; `update`/
  // `updateMany` still mutate the canonical row in `rows` so writes are
  // visible to subsequent queries (and to `_rows`, used directly by tests).
  const clone = (row: Row): Row => ({ ...row });

  return {
    _rows: rows,
    async findUnique({ where }: { where: Row }): Promise<Row | null> {
      const row = rows.find((r) => matchesWhere(r, where));
      return row ? clone(row) : null;
    },
    async findFirst({ where }: { where: Row }): Promise<Row | null> {
      const row = rows.find((r) => matchesWhere(r, where ?? {}));
      return row ? clone(row) : null;
    },
    async findMany({ where, take, skip, orderBy }: { where?: Row; take?: number; skip?: number; orderBy?: Record<string, "asc" | "desc"> } = {}): Promise<Row[]> {
      let result = rows.filter((r) => matchesWhere(r, where ?? {}));
      if (orderBy) {
        const [field, dir] = Object.entries(orderBy)[0]!;
        result = [...result].sort((a, b) => {
          const av = a[field] as string | number | Date;
          const bv = b[field] as string | number | Date;
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return dir === "desc" ? -cmp : cmp;
        });
      }
      if (skip) result = result.slice(skip);
      if (take) result = result.slice(0, take);
      return result.map(clone);
    },
    async create({ data }: { data: Row }): Promise<Row> {
      const row: Row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...data };
      rows.push(row);
      return clone(row);
    },
    async update({ where, data }: { where: Row; data: Row }): Promise<Row> {
      const row = rows.find((r) => matchesWhere(r, where));
      if (!row) throw new Error("update: no matching row");
      applyData(row, data);
      return row;
    },
    async updateMany({ where, data }: { where: Row; data: Row }): Promise<{ count: number }> {
      const matched = rows.filter((r) => matchesWhere(r, where));
      for (const row of matched) applyData(row, data);
      return { count: matched.length };
    },
    async count({ where }: { where?: Row } = {}): Promise<number> {
      return rows.filter((r) => matchesWhere(r, where ?? {})).length;
    },
  };
}

export function createFakePrisma() {
  const apiKey = createFakeTable();
  const sessionTable = createFakeTable();
  const payment = createFakeTable();
  const webhook = createFakeTable();
  const webhookDelivery = createFakeTable();
  const idempotencyKey = createFakeTable();

  // Real Prisma applies `@default(...)` from schema.prisma automatically
  // when a field is omitted from `data`. This fake has no schema to read,
  // so Session's defaults (totalSats, consecutiveFailures) are applied
  // explicitly here to match real behavior.
  const session = {
    ...sessionTable,
    async create({ data }: { data: Row }) {
      return sessionTable.create({
        data: { totalSats: 0, consecutiveFailures: 0, ...data },
      });
    },
  };

  return {
    apiKey,
    session,
    payment,
    webhook,
    webhookDelivery,
    idempotencyKey,
    async $transaction(ops: Promise<unknown>[]) {
      return Promise.all(ops);
    },
    async $disconnect() {},
  };
}

export type FakePrisma = ReturnType<typeof createFakePrisma>;

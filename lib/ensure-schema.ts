import "server-only";
import { db } from "./db";
import { fullSchemaSql } from "./full-schema";

const schemaVersion = 4;
let schemaPromise: Promise<void> | null = null;

export function ensureCrmSchema() {
  if (!schemaPromise)
    schemaPromise = (async () => {
      await db()`create table if not exists crm_schema_versions(version integer primary key,applied_at timestamptz not null default now())`;
      const current = await db()`select version from crm_schema_versions where version=${schemaVersion}`;
      if (current.length) return;
      await db().begin(async (sql) => {
        const statements = fullSchemaSql
          .split(/;\s*(?:\r?\n|$)/)
          .map((statement) => statement.trim())
          .filter(Boolean);
        for (const statement of statements) await sql.unsafe(statement);
        await sql`insert into crm_schema_versions(version) values(${schemaVersion}) on conflict(version) do nothing`;
      });
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  return schemaPromise;
}

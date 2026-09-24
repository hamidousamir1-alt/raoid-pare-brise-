import "server-only";
import { db } from "./db";

export async function ensureSystemHealthTable() {
  await db()`create table if not exists crm_system_runs(id uuid primary key default gen_random_uuid(),job_key text not null,status text not null check(status in('success','warning','failed')),details jsonb not null default '{}'::jsonb,started_at timestamptz not null default now(),completed_at timestamptz not null default now())`;
  await db()`create index if not exists crm_system_runs_job_idx on crm_system_runs(job_key,completed_at desc)`;
}

export async function recordSystemRun(
  jobKey: string,
  status: "success" | "warning" | "failed",
  details: Record<string, unknown> = {},
) {
  await ensureSystemHealthTable();
  await db()`insert into crm_system_runs(job_key,status,details) values(${jobKey},${status},${db().json(details as any)})`;
}

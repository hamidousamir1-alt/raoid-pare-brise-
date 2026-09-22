import { NextRequest, NextResponse } from "next/server";
import { authConfigured, sessionValid } from "../../../lib/auth";
import { databaseConfigured, db } from "../../../lib/db";
import { microsoftConfigured } from "../../../lib/mailing";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
async function guard() {
  if (!databaseConfigured())
    return NextResponse.json(
      { error: "database_not_configured" },
      { status: 503 },
    );
  if (!authConfigured() || !(await sessionValid()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}
async function exportData() {
  const [
    prospects,
    contacts,
    events,
    appointments,
    calls,
    offers,
    vehicles,
    cases,
    tasks,
    messages,
    settings,
  ] = await Promise.all([
    db()`select * from prospects`,
    db()`select * from prospect_contacts`,
    db()`select * from prospect_events`,
    db()`select * from appointments`,
    db()`select * from call_logs`,
    db()`select * from commercial_offers`,
    db()`select * from fleet_vehicles`,
    db()`select * from service_cases`,
    db()`select * from sales_tasks`,
    db()`select * from email_messages`,
    db()`select * from automation_settings`,
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    prospects,
    contacts,
    events,
    appointments,
    calls,
    offers,
    vehicles,
    serviceCases: cases,
    tasks,
    messages,
    settings,
  };
}
export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  try {
    if (req.nextUrl.searchParams.get("download") === "1") {
      const payload = await exportData();
      return new NextResponse(JSON.stringify(payload, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": "attachment; filename=rapid-crm-export.json",
          ...noStore,
        },
      });
    }
    const [backups, stats, audit] = await Promise.all([
      db()`select id,label,record_count as "recordCount",created_at as "createdAt" from crm_backups order by created_at desc limit 20`,
      db()`select (select count(*) from prospects)::int as prospects,(select count(*) from prospect_events)::int as events,(select count(*) from documents where deleted_at is null)::int as documents,(select count(*) from crm_backups)::int as backups`,
      db()`select p.name as subject,e.event_type as "eventType",e.created_at as "createdAt" from prospect_events e join prospects p on p.id=e.prospect_id order by e.created_at desc limit 50`,
    ]);
    return NextResponse.json(
      {
        backups,
        stats: stats[0],
        audit,
        security: {
          authentication: authConfigured(),
          database: databaseConfigured(),
          mail: microsoftConfigured(),
          cron: Boolean(process.env.CRON_SECRET),
          https: process.env.NODE_ENV === "production",
        },
      },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json(
      { error: "admin_unavailable" },
      { status: 503, headers: noStore },
    );
  }
}
export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  let x: Record<string, unknown>;
  try {
    x = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (x.action !== "backup")
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  try {
    const payload = await exportData();
    const recordCount =
      payload.prospects.length +
      payload.contacts.length +
      payload.events.length +
      payload.appointments.length +
      payload.calls.length +
      payload.offers.length +
      payload.vehicles.length +
      payload.serviceCases.length +
      payload.tasks.length +
      payload.messages.length;
    const label = String(x.label || "Sauvegarde CRM").slice(0, 100);
    const rows =
      await db()`insert into crm_backups(label,payload,record_count) values(${label},${db().json(payload)},${recordCount}) returning id`;
    return NextResponse.json(
      { ok: true, id: rows[0].id, recordCount },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "backup_failed" }, { status: 503 });
  }
}

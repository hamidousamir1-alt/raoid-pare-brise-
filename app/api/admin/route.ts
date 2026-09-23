import { NextRequest, NextResponse } from "next/server";
import { authConfigured, sessionValid } from "../../../lib/auth";
import { databaseConfigured, db } from "../../../lib/db";
import { microsoftConfigured } from "../../../lib/mailing";
import { ensureSystemHealthTable } from "../../../lib/system-health";
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
    await ensureSystemHealthTable();
    const [backups, stats, audit, mail, tasks, quality, campaigns, runs] = await Promise.all([
      db()`select id,label,record_count as "recordCount",created_at as "createdAt" from crm_backups order by created_at desc limit 20`,
      db()`select (select count(*) from prospects)::int as prospects,(select count(*) from prospect_events)::int as events,(select count(*) from documents where deleted_at is null)::int as documents,(select count(*) from crm_backups)::int as backups`,
      db()`select p.name as subject,e.event_type as "eventType",e.created_at as "createdAt" from prospect_events e join prospects p on p.id=e.prospect_id order by e.created_at desc limit 50`,
      db()`select count(*) filter(where status='failed' and updated_at>=now()-interval '7 days')::int as "failedWeek",count(*) filter(where status='scheduled' and scheduled_at<now()-interval '1 hour')::int as overdue,max(sent_at) as "lastSentAt",count(*) filter(where direction='inbound' and replied_at>=now()-interval '7 days')::int as "repliesWeek" from email_messages`,
      db()`select count(*) filter(where status='open' and due_at<now())::int as overdue,count(*) filter(where status='open')::int as open from sales_tasks`,
      db()`select count(*) filter(where email is null or email='')::int as "missingEmail",count(*) filter(where email_status in('Invalide','Rejeté','Bounce'))::int as "invalidEmail",count(*) filter(where coalesce(duplicate_status,'Unique') ilike '%doublon%')::int as duplicates,count(*) filter(where verification_status not in('Vérifiée','Probable') or verification_status is null)::int as unverified from prospects where deleted_at is null`,
      db()`select count(*) filter(where status='active')::int as active,count(*) filter(where status='paused')::int as paused from email_enrollments`,
      db()`select distinct on(job_key) job_key as "jobKey",status,details,completed_at as "completedAt" from crm_system_runs order by job_key,completed_at desc`,
    ]);
    const latestBackup = backups[0]?.createdAt || null,
      lastMailRun = runs.find((run: any) => run.jobKey === "mailing"),
      lastDailyRun = runs.find((run: any) => run.jobKey === "daily_actions"),
      hoursSince = (value?: string | null) =>
        value ? (Date.now() - new Date(value).getTime()) / 3600000 : Infinity;
    const checks = [
      { key: "database", label: "Base de données", status: "ok", detail: "Connexion PostgreSQL opérationnelle.", href: "/administration" },
      { key: "outlook", label: "Connexion Outlook", status: microsoftConfigured() ? "ok" : "critical", detail: microsoftConfigured() ? "Identifiants présents pour les envois et réponses." : "Connexion absente : aucun e-mail réel ne peut partir.", href: "/reglages" },
      { key: "mailing_job", label: "Automatisation mailing", status: !process.env.CRON_SECRET ? "critical" : !lastMailRun ? "warning" : hoursSince(lastMailRun.completedAt) > 30 || lastMailRun.status === "failed" ? "critical" : lastMailRun.status === "warning" ? "warning" : "ok", detail: lastMailRun ? `Dernier contrôle : ${new Date(lastMailRun.completedAt).toLocaleString("fr-FR")}.` : "Aucun passage enregistré pour le moment.", href: "/messages" },
      { key: "daily_job", label: "Plan d’actions quotidien", status: !lastDailyRun ? "warning" : hoursSince(lastDailyRun.completedAt) > 36 || lastDailyRun.status === "failed" ? "critical" : "ok", detail: lastDailyRun ? `Dernière préparation : ${new Date(lastDailyRun.completedAt).toLocaleString("fr-FR")}.` : "Aucune exécution enregistrée.", href: "/actions" },
      { key: "mail_errors", label: "Erreurs d’envoi", status: Number(mail[0].failedWeek) > 5 || Number(mail[0].overdue) > 0 ? "critical" : Number(mail[0].failedWeek) > 0 ? "warning" : "ok", detail: `${mail[0].failedWeek} échec(s) sur 7 jours · ${mail[0].overdue} envoi(s) en retard.`, href: "/messages" },
      { key: "tasks", label: "Actions commerciales", status: Number(tasks[0].overdue) > 10 ? "critical" : Number(tasks[0].overdue) > 0 ? "warning" : "ok", detail: `${tasks[0].overdue} en retard sur ${tasks[0].open} action(s) ouverte(s).`, href: "/actions" },
      { key: "data", label: "Qualité des données", status: Number(quality[0].duplicates) > 0 || Number(quality[0].invalidEmail) > 0 ? "warning" : "ok", detail: `${quality[0].missingEmail} sans e-mail · ${quality[0].invalidEmail} invalide(s) · ${quality[0].duplicates} doublon(s).`, href: "/donnees" },
      { key: "backup", label: "Sauvegarde", status: !latestBackup || hoursSince(latestBackup) > 24 * 30 ? "critical" : hoursSince(latestBackup) > 24 * 7 ? "warning" : "ok", detail: latestBackup ? `Dernière sauvegarde : ${new Date(latestBackup).toLocaleString("fr-FR")}.` : "Aucune sauvegarde disponible.", href: "/administration" },
    ];
    const overall = checks.some((check) => check.status === "critical") ? "critical" : checks.some((check) => check.status === "warning") ? "warning" : "ok";
    return NextResponse.json(
      {
        backups,
        stats: stats[0],
        audit,
        health: {
          overall,
          checks,
          summary: {
            critical: checks.filter((check) => check.status === "critical").length,
            warning: checks.filter((check) => check.status === "warning").length,
            ok: checks.filter((check) => check.status === "ok").length,
            activeCampaigns: Number(campaigns[0].active),
            pausedCampaigns: Number(campaigns[0].paused),
            repliesWeek: Number(mail[0].repliesWeek),
          },
        },
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

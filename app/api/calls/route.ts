import { NextRequest, NextResponse } from "next/server";
import { authConfigured, sessionValid } from "../../../lib/auth";
import { databaseConfigured, db } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const outcomes = new Set([
  "answered",
  "no_answer",
  "callback",
  "interested",
  "appointment",
  "information",
  "wrong_contact",
  "not_interested",
]);
const statuses = new Set([
  "Nouveau",
  "À contacter",
  "Relance",
  "Qualifié",
  "RDV",
  "Offre",
  "Perdu",
]);

async function guard() {
  if (!databaseConfigured())
    return NextResponse.json(
      { error: "database_not_configured" },
      { status: 503, headers: noStore },
    );
  if (!authConfigured() || !(await sessionValid()))
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: noStore },
    );
  return null;
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  try {
    const [calls, prospects, stats] = await Promise.all([
      db()`select c.id,c.prospect_id as "prospectId",p.name as prospect,c.direction,c.outcome,c.started_at as "startedAt",c.duration_seconds as "durationSeconds",c.notes,c.next_action as "nextAction",c.next_action_at as "nextActionAt",c.previous_status as "previousStatus",c.resulting_status as "resultingStatus",pc.name as contact from call_logs c join prospects p on p.id=c.prospect_id left join prospect_contacts pc on pc.id=c.contact_id order by c.started_at desc limit 100`,
      db()`select id,name,phone,status,next_action as "nextAction",contact_name as "contactName" from prospects where deleted_at is null and status<>'Perdu' order by name`,
      db()`select count(*) filter(where started_at>=date_trunc('day',now()))::int as today,count(*) filter(where started_at>=date_trunc('week',now()))::int as week,count(*) filter(where outcome='appointment' and started_at>=date_trunc('month',now()))::int as "appointmentsThisMonth",coalesce(sum(duration_seconds) filter(where started_at>=date_trunc('day',now())),0)::int as "todaySeconds" from call_logs`,
    ]);
    return NextResponse.json(
      { calls, prospects, stats: stats[0] },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json(
      { error: "calls_unavailable" },
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
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: noStore },
    );
  }
  const prospectId = String(x.prospectId || "");
  const contactId = String(x.contactId || "");
  const direction = String(x.direction || "outbound");
  const outcome = String(x.outcome || "");
  const notes = String(x.notes || "").trim();
  const nextAction = String(x.nextAction || "").trim();
  const resultingStatus = String(x.resultingStatus || "");
  const durationSeconds = Number(x.durationSeconds || 0);
  const nextActionAt = x.nextActionAt ? new Date(String(x.nextActionAt)) : null;
  const appointmentStartsAt = x.appointmentStartsAt
    ? new Date(String(x.appointmentStartsAt))
    : null;
  if (
    !UUID.test(prospectId) ||
    (contactId && !UUID.test(contactId)) ||
    !["outbound", "inbound"].includes(direction) ||
    !outcomes.has(outcome) ||
    !statuses.has(resultingStatus) ||
    !Number.isInteger(durationSeconds) ||
    durationSeconds < 0 ||
    durationSeconds > 86400 ||
    (nextActionAt && Number.isNaN(nextActionAt.getTime())) ||
    (outcome !== "not_interested" && (!nextAction || !nextActionAt)) ||
    (outcome === "appointment" &&
      (!appointmentStartsAt || Number.isNaN(appointmentStartsAt.getTime())))
  )
    return NextResponse.json(
      { error: "invalid_call" },
      { status: 400, headers: noStore },
    );

  try {
    const created = (await db().begin(async (sql) => {
      const prospects =
        await sql`select id,status from prospects where id=${prospectId} and deleted_at is null for update`;
      if (!prospects.length) return [];
      if (contactId) {
        const contacts =
          await sql`select id from prospect_contacts where id=${contactId} and prospect_id=${prospectId} and deleted_at is null`;
        if (!contacts.length) return [];
      }
      let appointmentId: string | null = null;
      if (outcome === "appointment" && appointmentStartsAt) {
        const endsAt = new Date(appointmentStartsAt.getTime() + 30 * 60000);
        const appointments =
          await sql`insert into appointments(prospect_id,contact_id,title,meeting_type,starts_at,ends_at,objective,reminder_day,reminder_hour) values(${prospectId},${contactId || null},'Rendez-vous commercial','Sur place',${appointmentStartsAt.toISOString()},${endsAt.toISOString()},'Présenter les prestations de remplacement de pare-brise et de tout vitrage',true,true) returning id`;
        appointmentId = appointments[0].id;
        await sql`insert into sales_tasks(prospect_id,appointment_id,task_type,title,priority,due_at,source) values(${prospectId},${appointmentId},'appointment_preparation','Préparer le rendez-vous',90,${new Date(appointmentStartsAt.getTime() - 86400000).toISOString()},'call')`;
        await sql`insert into sales_tasks(prospect_id,appointment_id,task_type,title,priority,due_at,source) values(${prospectId},${appointmentId},'appointment_confirmation','Confirmer le rendez-vous avec le prospect',88,${new Date(appointmentStartsAt.getTime() - 86400000).toISOString()},'call')`;
        await sql`insert into sales_tasks(prospect_id,appointment_id,task_type,title,priority,due_at,source) values(${prospectId},${appointmentId},'appointment_reminder','Rendez-vous dans une heure',98,${new Date(appointmentStartsAt.getTime() - 3600000).toISOString()},'call')`;
      }
      const calls =
        await sql`insert into call_logs(prospect_id,contact_id,direction,outcome,duration_seconds,notes,next_action,next_action_at,previous_status,resulting_status,appointment_id) values(${prospectId},${contactId || null},${direction},${outcome},${durationSeconds},${notes},${nextAction},${nextActionAt?.toISOString() || null},${prospects[0].status},${resultingStatus},${appointmentId}) returning id`;
      await sql`update prospects set status=${resultingStatus},next_action=${nextAction},next_action_at=${nextActionAt?.toISOString() || null},last_contact_at=now(),updated_at=now() where id=${prospectId}`;
      if (nextAction && nextActionAt && outcome !== "appointment")
        await sql`insert into sales_tasks(prospect_id,call_id,task_type,title,priority,due_at,source) values(${prospectId},${calls[0].id},'call_follow_up',${nextAction},${outcome === "callback" ? 90 : 75},${nextActionAt.toISOString()},'call')`;
      await sql`insert into prospect_events(prospect_id,event_type,payload) values(${prospectId},'call_logged',${sql.json({ callId: calls[0].id, direction, outcome, durationSeconds, previousStatus: prospects[0].status, resultingStatus, appointmentId })})`;
      return calls;
    })) as Array<{ id: string }>;
    return created.length
      ? NextResponse.json(
          { ok: true, id: created[0].id },
          { status: 201, headers: noStore },
        )
      : NextResponse.json(
          { error: "prospect_or_contact_not_found" },
          { status: 404, headers: noStore },
        );
  } catch {
    return NextResponse.json(
      { error: "call_operation_failed" },
      { status: 503, headers: noStore },
    );
  }
}

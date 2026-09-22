import { NextRequest, NextResponse } from "next/server";
import { authConfigured, sessionValid } from "../../../lib/auth";
import { databaseConfigured, db } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" },
  UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  meetingTypes = new Set([
    "Sur place",
    "Téléphone",
    "Visioconférence",
    "Au centre",
  ]),
  statuses = new Set([
    "scheduled",
    "confirmed",
    "completed",
    "cancelled",
    "no_show",
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

export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const from = req.nextUrl.searchParams.get("from"),
    to = req.nextUrl.searchParams.get("to");
  try {
    const [appointments, prospects] = await Promise.all([
      from && to
        ? db()`select a.id,a.prospect_id as "prospectId",a.contact_id as "contactId",p.name as prospect,p.phone,p.email,p.address,p.zone,p.notes,p.objections,p.next_action as "prospectNext",a.title,a.meeting_type as "meetingType",a.starts_at as "startsAt",a.ends_at as "endsAt",a.location,a.objective,a.preparation_notes as "preparationNotes",a.status,a.confirmation_status as "confirmationStatus",a.reminder_day as "reminderDay",a.reminder_hour as "reminderHour",a.outcome,a.next_action as "nextAction",a.next_action_at as "nextActionAt",a.external_provider as "externalProvider",a.external_event_id as "externalEventId",c.name as contact,c.role as "contactRole",c.phone as "contactPhone",c.email as "contactEmail" from appointments a join prospects p on p.id=a.prospect_id left join prospect_contacts c on c.id=a.contact_id where a.starts_at>=${from} and a.starts_at<${to} order by a.starts_at`
        : db()`select a.id,a.prospect_id as "prospectId",a.contact_id as "contactId",p.name as prospect,p.phone,p.email,p.address,p.zone,p.notes,p.objections,p.next_action as "prospectNext",a.title,a.meeting_type as "meetingType",a.starts_at as "startsAt",a.ends_at as "endsAt",a.location,a.objective,a.preparation_notes as "preparationNotes",a.status,a.confirmation_status as "confirmationStatus",a.reminder_day as "reminderDay",a.reminder_hour as "reminderHour",a.outcome,a.next_action as "nextAction",a.next_action_at as "nextActionAt",a.external_provider as "externalProvider",a.external_event_id as "externalEventId",c.name as contact,c.role as "contactRole",c.phone as "contactPhone",c.email as "contactEmail" from appointments a join prospects p on p.id=a.prospect_id left join prospect_contacts c on c.id=a.contact_id where a.starts_at>=now()-interval '30 days' order by a.starts_at`,
      db()`select id,name,address,zone,contact_name as "contactName",contact_role as "contactRole",phone,email from prospects where deleted_at is null and status<>'Perdu' order by name`,
    ]);
    return NextResponse.json({ appointments, prospects }, { headers: noStore });
  } catch {
    return NextResponse.json(
      { error: "appointments_unavailable" },
      { status: 503, headers: noStore },
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  let x: any;
  try {
    x = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: noStore },
    );
  }
  try {
    if (x.action === "create") {
      const prospectId = String(x.prospectId || ""),
        contactId = String(x.contactId || ""),
        title = String(x.title || "").trim(),
        meetingType = String(x.meetingType || "Sur place"),
        startsAt = new Date(x.startsAt),
        endsAt = new Date(x.endsAt);
      if (
        !UUID.test(prospectId) ||
        (contactId && !UUID.test(contactId)) ||
        !title ||
        !meetingTypes.has(meetingType) ||
        Number.isNaN(startsAt.getTime()) ||
        Number.isNaN(endsAt.getTime()) ||
        endsAt <= startsAt
      )
        return NextResponse.json(
          { error: "invalid_appointment" },
          { status: 400, headers: noStore },
        );
      if (contactId) {
        const contact =
          await db()`select id from prospect_contacts where id=${contactId} and prospect_id=${prospectId} and deleted_at is null`;
        if (!contact.length)
          return NextResponse.json(
            { error: "invalid_contact" },
            { status: 400, headers: noStore },
          );
      }
      const rows = await db().begin(async (sql) => {
        const reminderSettings =
          await sql`select setting_key,enabled from automation_settings where setting_key in ('appointment_day_reminder','appointment_hour_reminder')`;
        const dayEnabled =
          reminderSettings.find(
            (row: any) => row.setting_key === "appointment_day_reminder",
          )?.enabled ?? true;
        const hourEnabled =
          reminderSettings.find(
            (row: any) => row.setting_key === "appointment_hour_reminder",
          )?.enabled ?? true;
        const reminderDay = Boolean(x.reminderDay ?? true) && dayEnabled;
        const reminderHour = Boolean(x.reminderHour ?? true) && hourEnabled;
        const created =
          await sql`insert into appointments(prospect_id,contact_id,title,meeting_type,starts_at,ends_at,location,objective,preparation_notes,reminder_day,reminder_hour) select p.id,${contactId || null},${title},${meetingType},${startsAt.toISOString()},${endsAt.toISOString()},${String(x.location || "")},${String(x.objective || "")},${String(x.preparationNotes || "")},${reminderDay},${reminderHour} from prospects p where p.id=${prospectId} and p.deleted_at is null returning id`;
        if (!created.length) return [];
        await sql`update prospects set status='RDV',next_action='Préparer le rendez-vous',next_action_at=${startsAt.toISOString()},updated_at=now() where id=${prospectId}`;
        await sql`insert into sales_tasks(prospect_id,appointment_id,task_type,title,priority,due_at,source) values(${prospectId},${created[0].id},'appointment_preparation','Préparer le rendez-vous',90,${new Date(startsAt.getTime() - 86400_000).toISOString()},'appointment')`;
        if (reminderDay)
          await sql`insert into sales_tasks(prospect_id,appointment_id,task_type,title,priority,due_at,source) values(${prospectId},${created[0].id},'appointment_confirmation','Confirmer le rendez-vous avec le prospect',88,${new Date(startsAt.getTime() - 86400_000).toISOString()},'appointment')`;
        if (reminderHour)
          await sql`insert into sales_tasks(prospect_id,appointment_id,task_type,title,priority,due_at,source) values(${prospectId},${created[0].id},'appointment_reminder','Rendez-vous dans une heure',98,${new Date(startsAt.getTime() - 3600_000).toISOString()},'appointment')`;
        await sql`insert into prospect_events(prospect_id,event_type,payload) values(${prospectId},'appointment_created',${sql.json({ appointmentId: created[0].id, startsAt: startsAt.toISOString(), meetingType })})`;
        return created;
      });
      return rows.length
        ? NextResponse.json(
            { ok: true, id: (rows[0] as { id: string }).id },
            { status: 201, headers: noStore },
          )
        : NextResponse.json(
            { error: "prospect_not_found" },
            { status: 404, headers: noStore },
          );
    }

    const id = String(x.appointmentId || "");
    if (!UUID.test(id))
      return NextResponse.json(
        { error: "invalid_id" },
        { status: 400, headers: noStore },
      );

    if (x.action === "status") {
      const status = String(x.status || "");
      if (!statuses.has(status))
        return NextResponse.json(
          { error: "invalid_status" },
          { status: 400, headers: noStore },
        );
      const rows = await db().begin(async (sql) => {
        const changed =
          await sql`update appointments set status=${status},confirmation_status=case when ${status}='confirmed' then 'confirmed' else confirmation_status end,updated_at=now() where id=${id} returning prospect_id as "prospectId"`;
        if (!changed.length) return [];
        const next =
          status === "cancelled"
            ? "Reprogrammer le rendez-vous"
            : status === "no_show"
              ? "Rappeler après le rendez-vous manqué"
              : "Préparer le rendez-vous";
        await sql`update prospects set next_action=${next},next_action_at=now(),updated_at=now() where id=${changed[0].prospectId}`;
        if (status === "confirmed")
          await sql`update sales_tasks set status='completed',completed_at=now(),updated_at=now() where appointment_id=${id} and task_type='appointment_confirmation' and status='open'`;
        if (status === "cancelled" || status === "no_show")
          await sql`update sales_tasks set status='dismissed',updated_at=now() where appointment_id=${id} and status='open'`;
        if (status === "cancelled" || status === "no_show")
          await sql`insert into sales_tasks(prospect_id,appointment_id,task_type,title,priority,due_at,source) values(${changed[0].prospectId},${id},${status === "cancelled" ? "appointment_rebook" : "appointment_no_show"},${next},90,now(),'appointment') on conflict(appointment_id,task_type) where appointment_id is not null do nothing`;
        await sql`insert into prospect_events(prospect_id,event_type,payload) values(${changed[0].prospectId},'appointment_status_changed',${sql.json({ appointmentId: id, status })})`;
        return changed;
      });
      return rows.length
        ? NextResponse.json({ ok: true }, { headers: noStore })
        : NextResponse.json(
            { error: "not_found" },
            { status: 404, headers: noStore },
          );
    }

    if (x.action === "complete") {
      const outcome = String(x.outcome || "").trim(),
        nextAction = String(x.nextAction || "").trim(),
        nextActionAt = new Date(x.nextActionAt);
      if (!outcome || !nextAction || Number.isNaN(nextActionAt.getTime()))
        return NextResponse.json(
          { error: "missing_follow_up" },
          { status: 400, headers: noStore },
        );
      const rows = await db().begin(async (sql) => {
        const changed =
          await sql`update appointments set status='completed',outcome=${outcome},next_action=${nextAction},next_action_at=${nextActionAt.toISOString()},updated_at=now() where id=${id} returning prospect_id as "prospectId"`;
        if (!changed.length) return [];
        await sql`update sales_tasks set status='completed',completed_at=now(),updated_at=now() where appointment_id=${id} and status='open'`;
        await sql`update prospects set status='Qualifié',next_action=${nextAction},next_action_at=${nextActionAt.toISOString()},last_contact_at=now(),updated_at=now() where id=${changed[0].prospectId}`;
        await sql`insert into sales_tasks(prospect_id,task_type,title,priority,due_at,source) values(${changed[0].prospectId},'appointment_follow_up',${nextAction},85,${nextActionAt.toISOString()},'appointment')`;
        await sql`insert into prospect_events(prospect_id,event_type,payload) values(${changed[0].prospectId},'appointment_completed',${sql.json({ appointmentId: id, outcome, nextAction, nextActionAt: nextActionAt.toISOString() })})`;
        return changed;
      });
      return rows.length
        ? NextResponse.json({ ok: true }, { headers: noStore })
        : NextResponse.json(
            { error: "not_found" },
            { status: 404, headers: noStore },
          );
    }
    return NextResponse.json(
      { error: "unknown_action" },
      { status: 400, headers: noStore },
    );
  } catch {
    return NextResponse.json(
      { error: "appointment_operation_failed" },
      { status: 503, headers: noStore },
    );
  }
}

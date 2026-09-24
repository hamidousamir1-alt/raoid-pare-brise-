import { NextRequest, NextResponse } from "next/server";
import { authConfigured, sessionValid } from "../../../lib/auth";
import { databaseConfigured, db } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestTypes = new Set(["windshield", "side", "rear", "roof", "other"]);
const caseStatuses = new Set([
  "new",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
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
    const [partners, vehicles, cases, stats] = await Promise.all([
      db()`select p.id,p.name,p.sector,p.phone,p.email,p.contact_name as "contactName",p.fleet_count as "fleetCount",p.signed_revenue as "signedRevenue",p.generated_revenue as "generatedRevenue",p.next_action as "nextAction",pp.onboarding_status as "onboardingStatus",pp.agreement_started_at as "agreementStartedAt",pp.next_review_at as "nextReviewAt",pp.satisfaction,pp.operational_notes as "operationalNotes" from prospects p left join partner_profiles pp on pp.prospect_id=p.id where p.deleted_at is null and p.status='Gagné' order by p.name`,
      db()`select id,prospect_id as "prospectId",registration,make,model,vehicle_year as "vehicleYear",driver_name as "driverName",notes,active from fleet_vehicles where active=true order by registration`,
      db()`select s.id,s.prospect_id as "prospectId",p.name as prospect,s.vehicle_id as "vehicleId",v.registration,s.request_type as "requestType",s.status,s.requested_at as "requestedAt",s.scheduled_at as "scheduledAt",s.completed_at as "completedAt",s.insurer,s.claim_number as "claimNumber",s.amount,s.notes,s.satisfaction from service_cases s join prospects p on p.id=s.prospect_id left join fleet_vehicles v on v.id=s.vehicle_id order by s.requested_at desc limit 100`,
      db()`select count(*) filter(where status in ('new','scheduled','in_progress'))::int as active,count(*) filter(where status='completed' and completed_at>=date_trunc('month',now()))::int as "completedThisMonth",coalesce(sum(amount) filter(where status='completed'),0)::float8 as revenue,coalesce(avg(satisfaction),0)::float8 as satisfaction from service_cases`,
    ]);
    return NextResponse.json(
      { partners, vehicles, cases, stats: stats[0] },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json(
      { error: "partners_unavailable" },
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
  try {
    if (x.action === "activate") {
      const prospectId = String(x.prospectId || "");
      if (!UUID.test(prospectId))
        return NextResponse.json(
          { error: "invalid_id" },
          { status: 400, headers: noStore },
        );
      const rows =
        await db()`insert into partner_profiles(prospect_id,onboarding_status,agreement_started_at,next_review_at,operational_notes) select id,'active',current_date,current_date+90,${String(x.notes || "")} from prospects where id=${prospectId} and deleted_at is null and status='Gagné' on conflict(prospect_id) do update set onboarding_status='active',agreement_started_at=coalesce(partner_profiles.agreement_started_at,current_date),next_review_at=coalesce(partner_profiles.next_review_at,current_date+90),operational_notes=${String(x.notes || "")},updated_at=now() returning prospect_id`;
      if (rows.length)
        await db()`update prospects set next_action='Suivre la première prise en charge',next_action_at=now()+interval '30 days',updated_at=now() where id=${prospectId}`;
      return rows.length
        ? NextResponse.json({ ok: true }, { headers: noStore })
        : NextResponse.json(
            { error: "not_found" },
            { status: 404, headers: noStore },
          );
    }
    if (x.action === "vehicle") {
      const prospectId = String(x.prospectId || ""),
        registration = String(x.registration || "")
          .trim()
          .toUpperCase();
      const year = x.vehicleYear ? Number(x.vehicleYear) : null;
      if (
        !UUID.test(prospectId) ||
        !registration ||
        (year !== null &&
          (!Number.isInteger(year) || year < 1950 || year > 2100))
      )
        return NextResponse.json(
          { error: "invalid_vehicle" },
          { status: 400, headers: noStore },
        );
      const rows =
        await db()`insert into fleet_vehicles(prospect_id,registration,make,model,vehicle_year,driver_name,notes) select id,${registration},${String(x.make || "")},${String(x.model || "")},${year},${String(x.driverName || "")},${String(x.notes || "")} from prospects where id=${prospectId} and deleted_at is null and status='Gagné' on conflict(prospect_id,registration) do update set make=excluded.make,model=excluded.model,vehicle_year=excluded.vehicle_year,driver_name=excluded.driver_name,notes=excluded.notes,active=true,updated_at=now() returning id`;
      return rows.length
        ? NextResponse.json(
            { ok: true, id: rows[0].id },
            { status: 201, headers: noStore },
          )
        : NextResponse.json(
            { error: "not_found" },
            { status: 404, headers: noStore },
          );
    }
    if (x.action === "case") {
      const prospectId = String(x.prospectId || ""),
        vehicleId = String(x.vehicleId || ""),
        requestType = String(x.requestType || "windshield"),
        amount = Number(x.amount || 0);
      if (
        !UUID.test(prospectId) ||
        (vehicleId && !UUID.test(vehicleId)) ||
        !requestTypes.has(requestType) ||
        !Number.isFinite(amount) ||
        amount < 0
      )
        return NextResponse.json(
          { error: "invalid_case" },
          { status: 400, headers: noStore },
        );
      const rows = (await db().begin(async (sql) => {
        if (vehicleId) {
          const vehicle =
            await sql`select id from fleet_vehicles where id=${vehicleId} and prospect_id=${prospectId} and active=true`;
          if (!vehicle.length) return [];
        }
        const created =
          await sql`insert into service_cases(prospect_id,vehicle_id,request_type,insurer,claim_number,amount,notes) select id,${vehicleId || null},${requestType},${String(x.insurer || "")},${String(x.claimNumber || "")},${amount},${String(x.notes || "")} from prospects where id=${prospectId} and deleted_at is null and status='Gagné' returning id`;
        if (!created.length) return [];
        await sql`insert into sales_tasks(prospect_id,service_case_id,task_type,title,priority,due_at,source) values(${prospectId},${created[0].id},'service_case','Traiter la nouvelle demande vitrage',95,now(),'partner')`;
        await sql`update prospects set next_action='Traiter la nouvelle demande vitrage',next_action_at=now(),updated_at=now() where id=${prospectId}`;
        await sql`insert into prospect_events(prospect_id,event_type,payload) values(${prospectId},'service_case_created',${sql.json({ serviceCaseId: created[0].id, requestType, vehicleId })})`;
        return created;
      })) as Array<{ id: string }>;
      return rows.length
        ? NextResponse.json(
            { ok: true, id: rows[0].id },
            { status: 201, headers: noStore },
          )
        : NextResponse.json(
            { error: "not_found" },
            { status: 404, headers: noStore },
          );
    }
    if (x.action === "case_status") {
      const caseId = String(x.caseId || ""),
        status = String(x.status || ""),
        amount = Number(x.amount || 0);
      const scheduledAt = x.scheduledAt
        ? new Date(String(x.scheduledAt))
        : null;
      if (
        !UUID.test(caseId) ||
        !caseStatuses.has(status) ||
        !Number.isFinite(amount) ||
        amount < 0 ||
        (status === "scheduled" &&
          (!scheduledAt || Number.isNaN(scheduledAt.getTime())))
      )
        return NextResponse.json(
          { error: "invalid_case_status" },
          { status: 400, headers: noStore },
        );
      const rows = await db().begin(async (sql) => {
        const before =
          await sql`select prospect_id as "prospectId",status,amount from service_cases where id=${caseId} for update`;
        if (!before.length) return [];
        const changed =
          await sql`update service_cases set status=${status},scheduled_at=case when ${status}='scheduled' then ${scheduledAt?.toISOString() || null} else scheduled_at end,completed_at=case when ${status}='completed' then coalesce(completed_at,now()) else completed_at end,amount=${amount},updated_at=now() where id=${caseId} returning prospect_id as "prospectId"`;
        if (status === "completed") {
          const settings =
            await sql`select enabled,numeric_value as days from automation_settings where setting_key='satisfaction_follow_up'`;
          const enabled = settings[0]?.enabled ?? true;
          const satisfactionDue = new Date(
            Date.now() + Number(settings[0]?.days ?? 2) * 86400000,
          ).toISOString();
          if (before[0].status !== "completed")
            await sql`update prospects set generated_revenue=generated_revenue+${amount},next_action=${enabled ? "Demander un retour de satisfaction" : "Suivre le partenaire"},next_action_at=${enabled ? satisfactionDue : null},updated_at=now() where id=${before[0].prospectId}`;
          await sql`update sales_tasks set status='completed',completed_at=now(),updated_at=now() where service_case_id=${caseId} and status='open'`;
          if (enabled)
            await sql`insert into sales_tasks(prospect_id,service_case_id,task_type,title,priority,due_at,source) values(${before[0].prospectId},${caseId},'satisfaction','Demander un retour de satisfaction',75,${satisfactionDue},'partner') on conflict(service_case_id,task_type) where service_case_id is not null do nothing`;
        }
        await sql`insert into prospect_events(prospect_id,event_type,payload) values(${before[0].prospectId},'service_case_status_changed',${sql.json({ serviceCaseId: caseId, status, amount })})`;
        return changed;
      });
      return rows.length
        ? NextResponse.json({ ok: true }, { headers: noStore })
        : NextResponse.json(
            { error: "not_found" },
            { status: 404, headers: noStore },
          );
    }
    if (x.action === "satisfaction") {
      const caseId = String(x.caseId || ""),
        rating = Number(x.rating),
        feedback = String(x.feedback || "").trim().slice(0, 1000);
      if (
        !UUID.test(caseId) ||
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5
      )
        return NextResponse.json(
          { error: "invalid_rating" },
          { status: 400, headers: noStore },
        );
      const rows =
        await db()`update service_cases set satisfaction=${rating},updated_at=now() where id=${caseId} returning prospect_id as "prospectId"`;
      if (rows.length) {
        await db()`update partner_profiles set satisfaction=(select round(avg(satisfaction))::int from service_cases where prospect_id=${rows[0].prospectId} and satisfaction is not null),updated_at=now() where prospect_id=${rows[0].prospectId}`;
        await db()`update sales_tasks set status='completed',completed_at=now(),updated_at=now() where service_case_id=${caseId} and task_type='satisfaction' and status='open'`;
        if (rating <= 3) {
          await db()`insert into sales_tasks(prospect_id,service_case_id,task_type,title,priority,due_at,source) values(${rows[0].prospectId},${caseId},'partner_recovery','Rappeler le partenaire et traiter son insatisfaction',98,now()+interval '1 day','partner') on conflict(service_case_id,task_type) where service_case_id is not null do nothing`;
          await db()`update prospects set next_action='Rappeler le partenaire et traiter son insatisfaction',next_action_at=now()+interval '1 day',updated_at=now() where id=${rows[0].prospectId}`;
        } else {
          await db()`update prospects set next_action='Maintenir la relation partenaire',next_action_at=now()+interval '90 days',updated_at=now() where id=${rows[0].prospectId}`;
        }
        await db()`insert into prospect_events(prospect_id,event_type,payload) values(${rows[0].prospectId},'partner_satisfaction',${db().json({ serviceCaseId: caseId, rating, feedback })})`;
      }
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
      { error: "partner_operation_failed" },
      { status: 503, headers: noStore },
    );
  }
}

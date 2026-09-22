import { NextRequest, NextResponse } from "next/server";
import { authConfigured, sessionValid } from "../../../lib/auth";
import { databaseConfigured, db } from "../../../lib/db";
import { recommendationFor } from "../../../lib/commercial-intelligence";

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
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  try {
    const rows = await db()`
      select p.id,p.name,p.sector,p.status,p.score,p.fleet,p.fleet_count as "fleetCount",p.company_size as "companySize",p.access,p.insurance,p.phone,p.email,
      p.data_quality_score as "dataQualityScore",p.next_action_at as "nextActionAt",p.last_contact_at as "lastContactAt",p.updated_at as "updatedAt",
      (select count(*)::int from call_logs c where c.prospect_id=p.id) as calls,
      (select count(*)::int from call_logs c where c.prospect_id=p.id and c.outcome in ('interested','appointment')) as "positiveCalls",
      (select count(*)::int from field_visits v where v.prospect_id=p.id) as visits,
      (select count(*)::int from email_messages m where m.prospect_id=p.id and m.direction='inbound') as replies,
      (select count(*)::int from appointments a where a.prospect_id=p.id and a.status not in ('cancelled','no_show')) as appointments,
      (select count(*)::int from sales_tasks t where t.prospect_id=p.id and t.status='open') as "openTasks",
      o.preferred_channel as "preferredChannel",o.recommended_action as "overriddenAction"
      from prospects p
      left join lateral (
        select preferred_channel,recommended_action from commercial_recommendation_overrides
        where prospect_id=p.id and status in ('active','accepted') order by updated_at desc limit 1
      ) o on true
      where p.deleted_at is null and p.status not in ('Perdu')
      and not exists (
        select 1 from commercial_recommendation_overrides x where x.prospect_id=p.id
        and (x.status='dismissed' or (x.status='snoozed' and x.snoozed_until>now()))
        and x.updated_at=(select max(y.updated_at) from commercial_recommendation_overrides y where y.prospect_id=p.id)
      )
    `;
    const recommendations = rows
      .map((row: any) => recommendationFor(row))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 30);
    const summary = {
      urgent: recommendations.filter((item) => item.priority >= 75).length,
      cooling: recommendations.filter((item) => item.cooling !== "actif")
        .length,
      weightedPotential: recommendations.reduce(
        (sum, item) => sum + item.weightedPotential,
        0,
      ),
      averageProbability: Math.round(
        recommendations.reduce((sum, item) => sum + item.probability, 0) /
          (recommendations.length || 1),
      ),
    };
    return NextResponse.json(
      { recommendations, summary },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json(
      { error: "intelligence_unavailable" },
      { status: 503, headers: noStore },
    );
  }
}
export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const x = await req.json();
    const prospectId = String(x.prospectId || "");
    const action = String(x.action || "");
    if (
      !/^[0-9a-f-]{36}$/i.test(prospectId) ||
      !["accept", "snooze", "dismiss", "override"].includes(action)
    )
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    if (action === "accept") {
      const title = String(x.title || "Action commerciale recommandée").slice(
        0,
        180,
      );
      await db().begin(async (sql) => {
        await sql`insert into commercial_recommendation_overrides(prospect_id,recommended_action,preferred_channel,status) values(${prospectId},${title},${String(x.channel || "")},'accepted')`;
        await sql`insert into sales_tasks(prospect_id,task_type,title,status,priority,due_at,source) values(${prospectId},'intelligence',${title},'open',${Math.max(0, Math.min(100, Number(x.priority) || 70))},now(),'commercial_intelligence')`;
      });
    } else if (action === "snooze")
      await db()`insert into commercial_recommendation_overrides(prospect_id,status,snoozed_until,note) values(${prospectId},'snoozed',now()+interval '3 days','Report manuel')`;
    else if (action === "dismiss")
      await db()`insert into commercial_recommendation_overrides(prospect_id,status,note) values(${prospectId},'dismissed',${String(x.note || "Non pertinent")})`;
    else
      await db()`insert into commercial_recommendation_overrides(prospect_id,recommended_action,preferred_channel,status,note) values(${prospectId},${String(x.title || "")},${String(x.channel || "")},'active',${String(x.note || "")})`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "recommendation_update_failed" },
      { status: 503 },
    );
  }
}

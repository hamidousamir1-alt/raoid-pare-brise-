import { NextRequest, NextResponse } from "next/server";
import { authConfigured, sessionValid } from "../../../lib/auth";
import { databaseConfigured, db } from "../../../lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" },
  outcomes = new Set([
    "visited",
    "absent",
    "callback",
    "not_interested",
    "not_found",
    "closed",
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
    const plans =
      await db()`select rp.id,rp.route_date as "routeDate",rp.zone,rp.status,rp.estimated_km as "estimatedKm",json_agg(json_build_object('prospectId',p.id,'name',p.name,'address',p.address,'stopOrder',s.stop_order,'status',s.status) order by s.stop_order) as stops from route_plans rp join route_plan_stops s on s.route_plan_id=rp.id join prospects p on p.id=s.prospect_id where rp.route_date=current_date and rp.status in ('planned','started') group by rp.id order by rp.updated_at desc limit 1`;
    return NextResponse.json({ plan: plans[0] || null }, { headers: noStore });
  } catch {
    return NextResponse.json({ plan: null }, { headers: noStore });
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
  if (x.action === "save_route") {
    const stops = Array.isArray(x.stops) ? x.stops.slice(0, 20) : [],
      zone = String(x.zone || "Marseille").trim(),
      estimatedKm = Math.max(0, Number(x.estimatedKm) || 0);
    if (!stops.length)
      return NextResponse.json(
        { error: "empty_route" },
        { status: 400, headers: noStore },
      );
    try {
      const result = await db().begin(async (sql) => {
        await sql`update route_plans set status='cancelled',updated_at=now() where route_date=current_date and status in ('planned','started')`;
        const plan =
          await sql`insert into route_plans(route_date,zone,estimated_km,start_latitude,start_longitude) values(current_date,${zone},${estimatedKm},${Number.isFinite(Number(x.latitude)) ? Number(x.latitude) : null},${Number.isFinite(Number(x.longitude)) ? Number(x.longitude) : null}) returning id`;
        for (let index = 0; index < stops.length; index++) {
          const stop = stops[index],
            prospectId = String(stop.prospectId || "");
          if (!/^[0-9a-f-]{36}$/i.test(prospectId)) continue;
          await sql`insert into route_plan_stops(route_plan_id,prospect_id,stop_order,priority,estimated_distance_km) select ${plan[0].id},id,${index + 1},${Math.round(Number(stop.priority) || 50)},${Math.max(0, Number(stop.distance) || 0)} from prospects where id=${prospectId} and deleted_at is null and do_not_contact=false`;
          await sql`update prospects set planned_route_date=current_date,updated_at=now() where id=${prospectId}`;
          await sql`insert into prospect_events(prospect_id,event_type,payload) select id,'added_to_route',${sql.json({ routePlanId: plan[0].id, stopOrder: index + 1, zone })} from prospects where id=${prospectId}`;
        }
        return plan[0];
      });
      return NextResponse.json(
        { ok: true, planId: result.id },
        { headers: noStore },
      );
    } catch {
      return NextResponse.json(
        { error: "route_not_saved" },
        { status: 503, headers: noStore },
      );
    }
  }
  const id = String(x.prospectId || ""),
    outcome = String(x.outcome || ""),
    note = String(x.note || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id) || !outcomes.has(outcome))
    return NextResponse.json(
      { error: "invalid_visit" },
      { status: 400, headers: noStore },
    );
  try {
    const rows = await db().begin(async (sql) => {
      const visit =
        await sql`insert into field_visits(prospect_id,outcome,note,latitude,longitude) select id,${outcome},${note || null},${Number.isFinite(Number(x.latitude)) ? Number(x.latitude) : null},${Number.isFinite(Number(x.longitude)) ? Number(x.longitude) : null} from prospects where id=${id} and deleted_at is null returning id`;
      if (!visit.length) return [];
      const status =
          outcome === "not_interested"
            ? "Perdu"
            : outcome === "callback"
              ? "Relance"
              : outcome === "visited"
                ? "Qualifié"
                : null,
        next =
          outcome === "absent"
            ? "Repasser ou appeler"
            : outcome === "callback"
              ? "Programmer la relance"
              : outcome === "visited"
                ? "Obtenir le décideur et proposer un RDV"
                : outcome === "not_found"
                  ? "Vérifier l’adresse"
                  : outcome === "closed"
                    ? "Reprogrammer le passage"
                    : outcome === "not_interested"
                      ? "Aucune relance"
                      : "À planifier";
      await sql`update prospects set last_field_visit_at=now(),field_visit_count=field_visit_count+1,status=coalesce(${status},status),next_action=${next},updated_at=now() where id=${id}`;
      await sql`update prospects set planned_route_date=null where id=${id}`;
      await sql`update route_plan_stops s set status=${outcome === "visited" ? "visited" : "skipped"} from route_plans rp where s.route_plan_id=rp.id and s.prospect_id=${id} and rp.route_date=current_date and rp.status in ('planned','started')`;
      await sql`update route_plans rp set status=case when exists(select 1 from route_plan_stops s where s.route_plan_id=rp.id and s.status='pending') then 'started' else 'completed' end,updated_at=now() where rp.route_date=current_date and rp.status in ('planned','started')`;
      await sql`insert into prospect_events(prospect_id,event_type,payload) values(${id},'field_visit',${sql.json({ outcome, note, visitId: visit[0].id })})`;
      const task =
        outcome === "visited"
          ? {
              type: "appointment_follow_up",
              title: "Appeler pour convenir d’un rendez-vous",
              days: 1,
              priority: 85,
            }
          : outcome === "callback"
            ? {
                type: "field_callback",
                title: "Effectuer la relance demandée",
                days: 2,
                priority: 90,
              }
            : outcome === "absent"
              ? {
                  type: "field_retry",
                  title: "Rappeler ou repasser dans l’entreprise",
                  days: 3,
                  priority: 70,
                }
              : outcome === "closed"
                ? {
                    type: "field_retry",
                    title: "Reprogrammer le passage terrain",
                    days: 2,
                    priority: 65,
                  }
                : outcome === "not_found"
                  ? {
                      type: "address_check",
                      title: "Vérifier l’adresse de l’entreprise",
                      days: 1,
                      priority: 75,
                    }
                  : null;
      if (task)
        await sql`insert into sales_tasks(prospect_id,field_visit_id,task_type,title,priority,due_at,source) values(${id},${visit[0].id},${task.type},${task.title},${task.priority},now()+(${task.days}||' days')::interval,'terrain') on conflict(field_visit_id,task_type) where field_visit_id is not null do nothing`;
      return [
        { ...visit[0], nextAction: next, taskTitle: task?.title || null },
      ];
    });
    return rows.length
      ? NextResponse.json({ ok: true, ...rows[0] }, { headers: noStore })
      : NextResponse.json(
          { error: "not_found" },
          { status: 404, headers: noStore },
        );
  } catch {
    return NextResponse.json(
      { error: "visit_not_saved" },
      { status: 503, headers: noStore },
    );
  }
}

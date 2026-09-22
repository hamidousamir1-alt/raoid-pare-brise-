import { NextRequest, NextResponse } from "next/server";
import { authConfigured, sessionValid } from "../../../lib/auth";
import { databaseConfigured, db } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
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
    const [funnel, activity, revenue, emails, calls, rankings, risks, goals] =
      await Promise.all([
        db()`select count(*)::int as total,count(*) filter(where status in ('Qualifié','Relance','RDV','Offre','Gagné'))::int as qualified,count(*) filter(where status in ('RDV','Offre','Gagné'))::int as appointments,count(*) filter(where status in ('Offre','Gagné'))::int as offers,count(*) filter(where status='Gagné')::int as won,count(*) filter(where status='Perdu')::int as lost from prospects where deleted_at is null`,
        db()`select (select count(*) from call_logs where started_at>=date_trunc('month',now()))::int as calls,(select count(*) from appointments where created_at>=date_trunc('month',now()))::int as appointments,(select count(*) from field_visits where visited_at>=date_trunc('month',now()))::int as visits,(select count(*) from commercial_offers where created_at>=date_trunc('month',now()))::int as offers,(select count(*) from prospects where status='Gagné' and updated_at>=date_trunc('month',now()))::int as partners`,
        db()`select coalesce(sum(generated_revenue),0)::float8 as generated,coalesce(sum(signed_revenue),0)::float8 as signed,coalesce(sum(potential_revenue) filter(where status not in ('Gagné','Perdu')),0)::float8 as pipeline,coalesce((select sum(amount) from commercial_offers where status in ('sent','viewed')),0)::float8 as "openOffers",coalesce((select sum(amount) from service_cases where status='completed' and completed_at>=date_trunc('month',now())),0)::float8 as "monthRevenue" from prospects where deleted_at is null`,
        db()`select count(*) filter(where direction='outbound' and status in ('sent','delivered','replied'))::int as sent,count(*) filter(where direction='inbound')::int as replies from email_messages where created_at>=date_trunc('month',now())`,
        db()`select count(*)::int as total,count(*) filter(where outcome in ('interested','appointment'))::int as positive,count(*) filter(where outcome='appointment')::int as appointments,count(*) filter(where outcome='no_answer')::int as unanswered from call_logs where started_at>=date_trunc('month',now())`,
        db()`select coalesce(nullif(sector,''),'Non renseigné') as label,count(*)::int as prospects,count(*) filter(where status='Gagné')::int as won,coalesce(sum(generated_revenue),0)::float8 as revenue from prospects where deleted_at is null group by 1 order by revenue desc,won desc,prospects desc limit 8`,
        db()`select count(*) filter(where next_action_at<now() and status not in ('Gagné','Perdu'))::int as overdue,count(*) filter(where updated_at<now()-make_interval(days=>coalesce((select numeric_value from automation_settings where setting_key='stale_opportunity'),14)) and status not in ('Gagné','Perdu'))::int as stale,count(*) filter(where data_quality_score<70)::int as incomplete,(select count(*) from commercial_offers where status in ('sent','viewed') and valid_until<=current_date+3)::int as "urgentOffers" from prospects where deleted_at is null`,
        db()`select revenue_target as "revenueTarget",calls_target as "callsTarget",appointments_target as "appointmentsTarget",partners_target as "partnersTarget" from performance_goals where period_month=date_trunc('month',current_date)::date`,
      ]);
    const f = funnel[0],
      a = activity[0],
      e = emails[0],
      c = calls[0],
      r = risks[0];
    const recommendations: Array<{
      level: string;
      title: string;
      detail: string;
      href: string;
    }> = [];
    if (r.overdue)
      recommendations.push({
        level: "urgent",
        title: `${r.overdue} action(s) en retard`,
        detail:
          "Traitez d’abord les échéances dépassées pour éviter les opportunités silencieuses.",
        href: "/actions",
      });
    if (r.urgentOffers)
      recommendations.push({
        level: "urgent",
        title: `${r.urgentOffers} offre(s) à relancer`,
        detail: "La validité arrive à échéance dans trois jours ou moins.",
        href: "/offres",
      });
    if (c.total >= 5 && c.positive / c.total < 0.2)
      recommendations.push({
        level: "watch",
        title: "Conversion des appels faible",
        detail:
          "Revoyez les secteurs ciblés, l’accroche et le choix des interlocuteurs.",
        href: "/appels",
      });
    if (e.sent >= 5 && e.replies / e.sent < 0.1)
      recommendations.push({
        level: "watch",
        title: "Peu de réponses aux e-mails",
        detail:
          "Personnalisez l’objet et le premier message avant d’augmenter le volume.",
        href: "/messages",
      });
    if (r.stale)
      recommendations.push({
        level: "watch",
        title: `${r.stale} dossier(s) sans mouvement`,
        detail: "Réactivez-les ou clôturez-les pour garder un pipeline fiable.",
        href: "/pipeline",
      });
    if (!recommendations.length)
      recommendations.push({
        level: "good",
        title: "Portefeuille sous contrôle",
        detail:
          "Les indicateurs prioritaires ne signalent aucun blocage majeur.",
        href: "/pipeline",
      });
    return NextResponse.json(
      {
        funnel: f,
        activity: a,
        revenue: revenue[0],
        emails: e,
        calls: c,
        rankings,
        risks: r,
        goals: goals[0] || {
          revenueTarget: 0,
          callsTarget: 0,
          appointmentsTarget: 0,
          partnersTarget: 0,
        },
        recommendations,
      },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json(
      { error: "performance_unavailable" },
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
  const revenue = Number(x.revenueTarget || 0),
    calls = Number(x.callsTarget || 0),
    appointments = Number(x.appointmentsTarget || 0),
    partners = Number(x.partnersTarget || 0);
  if (
    ![revenue, calls, appointments, partners].every(Number.isFinite) ||
    [revenue, calls, appointments, partners].some((n) => n < 0) ||
    ![calls, appointments, partners].every(Number.isInteger)
  )
    return NextResponse.json(
      { error: "invalid_goals" },
      { status: 400, headers: noStore },
    );
  try {
    await db()`insert into performance_goals(period_month,revenue_target,calls_target,appointments_target,partners_target) values(date_trunc('month',current_date)::date,${revenue},${calls},${appointments},${partners}) on conflict(period_month) do update set revenue_target=excluded.revenue_target,calls_target=excluded.calls_target,appointments_target=excluded.appointments_target,partners_target=excluded.partners_target,updated_at=now()`;
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch {
    return NextResponse.json(
      { error: "goals_failed" },
      { status: 503, headers: noStore },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { authConfigured, sessionValid } from "../../../lib/auth";
import { databaseConfigured, db } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const offerTypes = new Set(["partnership", "service", "quote"]);
const offerStatuses = new Set([
  "draft",
  "sent",
  "viewed",
  "accepted",
  "refused",
  "expired",
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
    const [offers, prospects, stats] = await Promise.all([
      db()`select o.id,o.prospect_id as "prospectId",p.name as prospect,p.email,p.contact_name as "contactName",o.title,o.offer_type as "offerType",o.status,o.amount,o.valid_until as "validUntil",o.summary,o.terms,o.sent_at as "sentAt",o.viewed_at as "viewedAt",o.decided_at as "decidedAt",o.refusal_reason as "refusalReason",o.created_at as "createdAt" from commercial_offers o join prospects p on p.id=o.prospect_id order by o.created_at desc limit 100`,
      db()`select id,name,email,contact_name as "contactName",status,potential_revenue as "potentialRevenue" from prospects where deleted_at is null and status not in ('Perdu','Gagné') order by name`,
      db()`select count(*) filter(where status in ('sent','viewed'))::int as active,count(*) filter(where status='accepted')::int as accepted,coalesce(sum(amount) filter(where status='accepted'),0)::float8 as "acceptedAmount",count(*) filter(where status in ('sent','viewed') and valid_until<=current_date+3)::int as urgent from commercial_offers`,
    ]);
    return NextResponse.json(
      { offers, prospects, stats: stats[0] },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json(
      { error: "offers_unavailable" },
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
    if (x.action === "create") {
      const prospectId = String(x.prospectId || "");
      const title = String(x.title || "").trim();
      const offerType = String(x.offerType || "partnership");
      const amount = Number(x.amount || 0);
      const validUntil = x.validUntil ? new Date(String(x.validUntil)) : null;
      if (
        !UUID.test(prospectId) ||
        !title ||
        !offerTypes.has(offerType) ||
        !Number.isFinite(amount) ||
        amount < 0 ||
        (validUntil && Number.isNaN(validUntil.getTime()))
      )
        return NextResponse.json(
          { error: "invalid_offer" },
          { status: 400, headers: noStore },
        );
      const rows =
        await db()`insert into commercial_offers(prospect_id,title,offer_type,amount,valid_until,summary,terms) select id,${title},${offerType},${amount},${validUntil?.toISOString().slice(0, 10) || null},${String(x.summary || "")},${String(x.terms || "")} from prospects where id=${prospectId} and deleted_at is null returning id`;
      if (!rows.length)
        return NextResponse.json(
          { error: "prospect_not_found" },
          { status: 404, headers: noStore },
        );
      await db()`insert into prospect_events(prospect_id,event_type,payload) values(${prospectId},'offer_created',${db().json({ offerId: rows[0].id, title, offerType, amount })})`;
      return NextResponse.json(
        { ok: true, id: rows[0].id },
        { status: 201, headers: noStore },
      );
    }

    if (x.action !== "status")
      return NextResponse.json(
        { error: "unknown_action" },
        { status: 400, headers: noStore },
      );
    const offerId = String(x.offerId || "");
    const status = String(x.status || "");
    const refusalReason = String(x.refusalReason || "").trim();
    if (
      !UUID.test(offerId) ||
      !offerStatuses.has(status) ||
      (status === "refused" && !refusalReason)
    )
      return NextResponse.json(
        { error: "invalid_status" },
        { status: 400, headers: noStore },
      );
    const rows = await db().begin(async (sql) => {
      const changed =
        await sql`update commercial_offers set status=${status},sent_at=case when ${status}='sent' then coalesce(sent_at,now()) else sent_at end,viewed_at=case when ${status}='viewed' then coalesce(viewed_at,now()) else viewed_at end,decided_at=case when ${status} in ('accepted','refused') then now() else decided_at end,refusal_reason=case when ${status}='refused' then ${refusalReason} else refusal_reason end,updated_at=now() where id=${offerId} returning prospect_id as "prospectId",title,amount`;
      if (!changed.length) return [];
      const offer = changed[0];
      if (status === "sent") {
        const due = new Date(Date.now() + 3 * 86400000).toISOString();
        await sql`update prospects set status='Offre',next_action='Relancer l’offre commerciale',next_action_at=${due},updated_at=now() where id=${offer.prospectId}`;
        await sql`insert into sales_tasks(prospect_id,offer_id,task_type,title,priority,due_at,source) values(${offer.prospectId},${offerId},'offer_follow_up','Relancer l’offre commerciale',88,${due},'offer') on conflict(offer_id,task_type) where offer_id is not null do nothing`;
      }
      if (status === "viewed")
        await sql`update prospects set status='Offre',next_action='Contacter le prospect après consultation',next_action_at=now()+interval '1 day',updated_at=now() where id=${offer.prospectId}`;
      if (status === "accepted") {
        await sql`update prospects set status='Gagné',signed_revenue=greatest(signed_revenue,${Number(offer.amount)}),next_action='Organiser le démarrage du partenariat',next_action_at=now()+interval '1 day',updated_at=now() where id=${offer.prospectId}`;
        await sql`update sales_tasks set status='completed',completed_at=now(),updated_at=now() where offer_id=${offerId} and status='open'`;
        await sql`insert into sales_tasks(prospect_id,offer_id,task_type,title,priority,due_at,source) values(${offer.prospectId},${offerId},'partnership_onboarding','Organiser le démarrage du partenariat',95,now()+interval '1 day','offer') on conflict(offer_id,task_type) where offer_id is not null do nothing`;
      }
      if (status === "refused") {
        await sql`update prospects set status='Qualifié',next_action='Analyser le refus et décider de la suite',next_action_at=now()+interval '2 days',objections=case when coalesce(objections,'')='' then ${refusalReason} else objections||E'\n'||${refusalReason} end,updated_at=now() where id=${offer.prospectId}`;
        await sql`update sales_tasks set status='completed',completed_at=now(),updated_at=now() where offer_id=${offerId} and status='open'`;
      }
      await sql`insert into prospect_events(prospect_id,event_type,payload) values(${offer.prospectId},'offer_status_changed',${sql.json({ offerId, status, refusalReason })})`;
      return changed;
    });
    return rows.length
      ? NextResponse.json({ ok: true }, { headers: noStore })
      : NextResponse.json(
          { error: "not_found" },
          { status: 404, headers: noStore },
        );
  } catch {
    return NextResponse.json(
      { error: "offer_operation_failed" },
      { status: 503, headers: noStore },
    );
  }
}

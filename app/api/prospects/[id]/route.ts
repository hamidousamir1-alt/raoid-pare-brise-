import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured, db } from "../../../../lib/db";
import { authConfigured, sessionValid } from "../../../../lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "Cache-Control": "no-store" },
  statuses = new Set([
    "Nouveau",
    "À contacter",
    "Relance",
    "Qualifié",
    "RDV",
    "Offre",
    "Gagné",
    "Perdu",
  ]);
const finiteNonNegative = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
async function guard() {
  if (!databaseConfigured())
    return NextResponse.json(
      { error: "database_not_configured" },
      { status: 503, headers: noStore },
    );
  if (!authConfigured())
    return NextResponse.json(
      { error: "secure_access_not_configured" },
      { status: 503, headers: noStore },
    );
  if (!(await sessionValid()))
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: noStore },
    );
  return null;
}
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  if (!UUID.test(id))
    return NextResponse.json(
      { error: "invalid_id" },
      { status: 400, headers: noStore },
    );
  try {
    const rows =
      await db()`select id,name,sector,zone,address,fleet,phone,email,contact_name as "contactName",contact_role as "contactRole",email_status as "emailStatus",do_not_contact as "doNotContact",status,score,notes,next_action as "next",access,insurance,potential_revenue as "potentialRevenue",signed_revenue as "signedRevenue",generated_revenue as "generatedRevenue",created_at as "createdAt",updated_at as "updatedAt" from prospects where id=${id} and deleted_at is null limit 1`;
    if (!rows.length)
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers: noStore },
      );
    const events =
      await db()`select id,event_type as "eventType",payload,created_at as "createdAt" from prospect_events where prospect_id=${id} order by created_at desc limit 100`;
    return NextResponse.json(
      { mode: "postgresql", item: rows[0], events },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json(
      { error: "database_unavailable" },
      { status: 503, headers: noStore },
    );
  }
}
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  if (!UUID.test(id))
    return NextResponse.json(
      { error: "invalid_id" },
      { status: 400, headers: noStore },
    );
  let x: any;
  try {
    x = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: noStore },
    );
  }
  const name = String(x.name || "").trim(),
    status = String(x.status || "Nouveau"),
    score = Number(x.score ?? 50),
    potential = finiteNonNegative(x.potentialRevenue),
    signed = finiteNonNegative(x.signedRevenue),
    generated = finiteNonNegative(x.generatedRevenue),
    email = String(x.email || "")
      .trim()
      .toLowerCase();
  if (
    !name ||
    !statuses.has(status) ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > 100 ||
    potential === null ||
    signed === null ||
    generated === null ||
    (email && !/^\S+@\S+\.\S+$/.test(email))
  )
    return NextResponse.json(
      { error: "invalid_prospect" },
      { status: 400, headers: noStore },
    );
  try {
    const rows = await db().begin(async (sql) => {
      const updated =
        await sql`update prospects set name=${name},sector=${String(x.sector || "")},zone=${String(x.zone || "")},address=${String(x.address || "")},fleet=${String(x.fleet || "")},phone=${String(x.phone || "")},email=${email || null},contact_name=${String(x.contactName || "")},contact_role=${String(x.contactRole || "")},email_status=${String(x.emailStatus || "À vérifier")},do_not_contact=${Boolean(x.doNotContact)},status=${status},score=${score},notes=${String(x.notes || "")},next_action=${String(x.next || "")},access=${String(x.access || "À vérifier")},insurance=${String(x.insurance || "À vérifier")},potential_revenue=${potential},signed_revenue=${signed},generated_revenue=${generated},updated_at=now() where id=${id} and deleted_at is null returning id,name,sector,zone,address,fleet,phone,email,contact_name as "contactName",contact_role as "contactRole",email_status as "emailStatus",do_not_contact as "doNotContact",status,score,notes,next_action as "next",access,insurance,potential_revenue as "potentialRevenue",signed_revenue as "signedRevenue",generated_revenue as "generatedRevenue",updated_at as "updatedAt"`;
      if (!updated.length) return [];
      await sql`insert into prospect_events(prospect_id,event_type,payload) values(${id},'updated',${sql.json({ source: "crm" })})`;
      return updated;
    });
    return rows.length
      ? NextResponse.json({ item: rows[0] }, { headers: noStore })
      : NextResponse.json(
          { error: "not_found" },
          { status: 404, headers: noStore },
        );
  } catch {
    return NextResponse.json(
      { error: "database_unavailable" },
      { status: 503, headers: noStore },
    );
  }
}
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  if (!UUID.test(id))
    return NextResponse.json(
      { error: "invalid_id" },
      { status: 400, headers: noStore },
    );
  try {
    const result = await db().begin(async (tx) => {
      const rows =
        await tx`update prospects set deleted_at=now(),updated_at=now() where id=${id} and deleted_at is null returning id`;
      if (!rows.length) return false;
      await tx`insert into prospect_events(prospect_id,event_type,payload) values(${id},'archived',${tx.json({ source: "crm" })})`;
      return true;
    });
    return result
      ? NextResponse.json({ ok: true, archived: true }, { headers: noStore })
      : NextResponse.json(
          { error: "not_found" },
          { status: 404, headers: noStore },
        );
  } catch {
    return NextResponse.json(
      { error: "database_unavailable" },
      { status: 503, headers: noStore },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured, db } from "../../../lib/db";
import { authConfigured, sessionValid } from "../../../lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
async function authorized() {
  return authConfigured() && (await sessionValid());
}
const statuses = new Set([
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
export async function GET() {
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
  try {
    const rows =
      await db()`select id,name,sector,zone,address,fleet,phone,email,contact_name as "contactName",contact_role as "contactRole",email_status as "emailStatus",do_not_contact as "doNotContact",status,score,notes,next_action as "next",access,insurance,potential_revenue as "potentialRevenue",signed_revenue as "signedRevenue",generated_revenue as "generatedRevenue",updated_at as "updatedAt" from prospects where deleted_at is null order by updated_at desc`;
    return NextResponse.json(
      { mode: "postgresql", items: rows },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json(
      { error: "database_unavailable" },
      { status: 503, headers: noStore },
    );
  }
}
export async function POST(req: NextRequest) {
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
  if (!(await authorized()))
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: noStore },
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
      const created =
        await sql`insert into prospects(name,sector,zone,address,fleet,phone,email,contact_name,contact_role,email_status,do_not_contact,status,score,notes,next_action,access,insurance,potential_revenue,signed_revenue,generated_revenue) values(${name},${String(x.sector || "")},${String(x.zone || "")},${String(x.address || "")},${String(x.fleet || "")},${String(x.phone || "")},${email || null},${String(x.contactName || "")},${String(x.contactRole || "")},${String(x.emailStatus || "À vérifier")},${Boolean(x.doNotContact)},${status},${score},${String(x.notes || "")},${String(x.next || "")},${String(x.access || "À vérifier")},${String(x.insurance || "À vérifier")},${potential},${signed},${generated}) returning id,name,sector,zone,address,fleet,phone,email,contact_name as "contactName",contact_role as "contactRole",email_status as "emailStatus",do_not_contact as "doNotContact",status,score,notes,next_action as "next",access,insurance,potential_revenue as "potentialRevenue",signed_revenue as "signedRevenue",generated_revenue as "generatedRevenue",updated_at as "updatedAt"`;
      await sql`insert into prospect_events(prospect_id,event_type,payload) values(${created[0].id},'created',${sql.json({ source: "crm" })})`;
      return created;
    });
    return NextResponse.json(
      { item: rows[0] },
      { status: 201, headers: noStore },
    );
  } catch {
    return NextResponse.json(
      { error: "database_unavailable" },
      { status: 503, headers: noStore },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured, db } from "../../../lib/db";
import { authConfigured, sessionValid } from "../../../lib/auth";
import { prospectQuality } from "../../../lib/prospect-quality";
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
      await db()`select id,name,sector,zone,address,postal_code as "postalCode",city,website,siret,company_size as "companySize",fleet,fleet_count as "fleetCount",fleet_confidence as "fleetConfidence",fleet_types as "fleetTypes",usage_intensity as "usageIntensity",phone,email,contact_name as "contactName",contact_role as "contactRole",email_status as "emailStatus",do_not_contact as "doNotContact",current_glass_partner as "currentGlassPartner",glass_partner_details as "glassPartnerDetails",lead_source as "leadSource",best_contact_time as "bestContactTime",decision_process as "decisionProcess",objections,data_quality_score as "dataQualityScore",latitude,longitude,last_field_visit_at as "lastFieldVisitAt",field_visit_count as "fieldVisitCount",last_contact_at as "lastContactAt",next_action_at as "nextActionAt",planned_route_date as "plannedRouteDate",status,score,notes,next_action as "next",access,insurance,potential_revenue as "potentialRevenue",signed_revenue as "signedRevenue",generated_revenue as "generatedRevenue",updated_at as "updatedAt" from prospects where deleted_at is null order by updated_at desc`;
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
      .toLowerCase(),
    fleetCount =
      x.fleetCount === "" || x.fleetCount === null || x.fleetCount === undefined
        ? null
        : Number(x.fleetCount),
    contacts = Array.isArray(x.contacts)
      ? x.contacts.slice(0, 20).map((contact: any) => ({
          name: String(contact.name || "").trim(),
          role: String(contact.role || "").trim(),
          email: String(contact.email || "")
            .trim()
            .toLowerCase(),
          phone: String(contact.phone || "").trim(),
          isDecisionMaker: Boolean(contact.isDecisionMaker),
          isPrimary: Boolean(contact.isPrimary),
          preferredChannel: String(contact.preferredChannel || "Téléphone"),
          notes: String(contact.notes || "").trim(),
        }))
      : [],
    quality = prospectQuality({ ...x, email, fleetCount });
  if (
    !name ||
    !statuses.has(status) ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > 100 ||
    potential === null ||
    signed === null ||
    generated === null ||
    (email && !/^\S+@\S+\.\S+$/.test(email)) ||
    (fleetCount !== null &&
      (!Number.isInteger(fleetCount) ||
        fleetCount < 0 ||
        fleetCount > 100000)) ||
    contacts.some(
      (contact: any) =>
        !contact.name ||
        (contact.email && !/^\S+@\S+\.\S+$/.test(contact.email)),
    )
  )
    return NextResponse.json(
      { error: "invalid_prospect" },
      { status: 400, headers: noStore },
    );
  try {
    const rows = await db().begin(async (sql) => {
      const created =
        await sql`insert into prospects(name,sector,zone,address,postal_code,city,website,siret,company_size,fleet,fleet_count,fleet_confidence,fleet_types,usage_intensity,phone,email,contact_name,contact_role,email_status,do_not_contact,current_glass_partner,glass_partner_details,lead_source,best_contact_time,decision_process,objections,data_quality_score,status,score,notes,next_action,next_action_at,access,insurance,potential_revenue,signed_revenue,generated_revenue) values(${name},${String(x.sector || "")},${String(x.zone || "")},${String(x.address || "")},${String(x.postalCode || "")},${String(x.city || "")},${String(x.website || "")},${String(x.siret || "")},${String(x.companySize || "À qualifier")},${String(x.fleet || "")},${fleetCount},${String(x.fleetConfidence || "À vérifier")},${String(x.fleetTypes || "")},${String(x.usageIntensity || "À vérifier")},${String(x.phone || "")},${email || null},${String(x.contactName || "")},${String(x.contactRole || "")},${String(x.emailStatus || "À vérifier")},${Boolean(x.doNotContact)},${String(x.currentGlassPartner || "Inconnu")},${String(x.glassPartnerDetails || "")},${String(x.leadSource || "Prospection terrain")},${String(x.bestContactTime || "")},${String(x.decisionProcess || "")},${String(x.objections || "")},${quality.score},${status},${score},${String(x.notes || "")},${String(x.next || "")},${x.nextActionAt || null},${String(x.access || "À vérifier")},${String(x.insurance || "À vérifier")},${potential},${signed},${generated}) returning id,name,sector,zone,address,postal_code as "postalCode",city,website,siret,company_size as "companySize",fleet,fleet_count as "fleetCount",fleet_confidence as "fleetConfidence",fleet_types as "fleetTypes",usage_intensity as "usageIntensity",phone,email,contact_name as "contactName",contact_role as "contactRole",email_status as "emailStatus",do_not_contact as "doNotContact",current_glass_partner as "currentGlassPartner",glass_partner_details as "glassPartnerDetails",lead_source as "leadSource",best_contact_time as "bestContactTime",decision_process as "decisionProcess",objections,data_quality_score as "dataQualityScore",status,score,notes,next_action as "next",next_action_at as "nextActionAt",access,insurance,potential_revenue as "potentialRevenue",signed_revenue as "signedRevenue",generated_revenue as "generatedRevenue",updated_at as "updatedAt"`;
      if (contacts.length)
        for (const contact of contacts)
          await sql`insert into prospect_contacts(prospect_id,name,role,email,phone,is_decision_maker,is_primary,preferred_channel,notes) values(${created[0].id},${contact.name},${contact.role},${contact.email || null},${contact.phone},${contact.isDecisionMaker},${contact.isPrimary},${contact.preferredChannel},${contact.notes})`;
      else if (String(x.contactName || "").trim())
        await sql`insert into prospect_contacts(prospect_id,name,role,email,phone,is_decision_maker,is_primary) values(${created[0].id},${String(x.contactName).trim()},${String(x.contactRole || "")},${email || null},${String(x.phone || "")},true,true)`;
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

import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured, db } from "../../../../lib/db";
import { authConfigured, sessionValid } from "../../../../lib/auth";
import { prospectQuality } from "../../../../lib/prospect-quality";
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
      await db()`select id,name,sector,zone,address,postal_code as "postalCode",city,website,siret,company_size as "companySize",fleet,fleet_count as "fleetCount",fleet_confidence as "fleetConfidence",fleet_types as "fleetTypes",usage_intensity as "usageIntensity",phone,email,contact_name as "contactName",contact_role as "contactRole",email_status as "emailStatus",do_not_contact as "doNotContact",current_glass_partner as "currentGlassPartner",glass_partner_details as "glassPartnerDetails",lead_source as "leadSource",best_contact_time as "bestContactTime",decision_process as "decisionProcess",objections,data_quality_score as "dataQualityScore",last_contact_at as "lastContactAt",last_field_visit_at as "lastFieldVisitAt",field_visit_count as "fieldVisitCount",status,score,notes,next_action as "next",next_action_at as "nextActionAt",access,insurance,potential_revenue as "potentialRevenue",signed_revenue as "signedRevenue",generated_revenue as "generatedRevenue",created_at as "createdAt",updated_at as "updatedAt" from prospects where id=${id} and deleted_at is null limit 1`;
    if (!rows.length)
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers: noStore },
      );
    const [events, contacts, documents, appointments, calls] =
      await Promise.all([
        db()`select id,event_type as "eventType",payload,created_at as "createdAt" from prospect_events where prospect_id=${id} order by created_at desc limit 100`,
        db()`select id,name,role,email,phone,is_decision_maker as "isDecisionMaker",is_primary as "isPrimary",preferred_channel as "preferredChannel",notes from prospect_contacts where prospect_id=${id} and deleted_at is null order by is_primary desc,created_at`,
        db()`select id,name,file_name as "fileName",category,created_at as "createdAt" from documents where prospect_id=${id} and deleted_at is null order by created_at desc`,
        db()`select id,title,meeting_type as "meetingType",starts_at as "startsAt",ends_at as "endsAt",location,status,outcome,next_action as "nextAction" from appointments where prospect_id=${id} order by starts_at desc limit 20`,
        db()`select id,direction,outcome,started_at as "startedAt",duration_seconds as "durationSeconds",notes,next_action as "nextAction",next_action_at as "nextActionAt",previous_status as "previousStatus",resulting_status as "resultingStatus" from call_logs where prospect_id=${id} order by started_at desc limit 30`,
      ]);
    return NextResponse.json(
      {
        mode: "postgresql",
        item: rows[0],
        events,
        contacts,
        documents,
        appointments,
        calls,
      },
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
      .toLowerCase(),
    fleetCount =
      x.fleetCount === "" || x.fleetCount === null || x.fleetCount === undefined
        ? null
        : Number(x.fleetCount),
    contacts = Array.isArray(x.contacts)
      ? x.contacts.slice(0, 20).map((contact: any) => ({
          id: String(contact.id || ""),
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
      : null,
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
    Boolean(
      contacts?.some(
        (contact: any) =>
          !contact.name ||
          (contact.email && !/^\S+@\S+\.\S+$/.test(contact.email)),
      ),
    )
  )
    return NextResponse.json(
      { error: "invalid_prospect" },
      { status: 400, headers: noStore },
    );
  try {
    const rows = await db().begin(async (sql) => {
      const updated =
        await sql`update prospects set name=${name},sector=${String(x.sector || "")},zone=${String(x.zone || "")},address=${String(x.address || "")},postal_code=${String(x.postalCode || "")},city=${String(x.city || "")},website=${String(x.website || "")},siret=${String(x.siret || "")},company_size=${String(x.companySize || "À qualifier")},fleet=${String(x.fleet || "")},fleet_count=${fleetCount},fleet_confidence=${String(x.fleetConfidence || "À vérifier")},fleet_types=${String(x.fleetTypes || "")},usage_intensity=${String(x.usageIntensity || "À vérifier")},phone=${String(x.phone || "")},email=${email || null},contact_name=${String(x.contactName || "")},contact_role=${String(x.contactRole || "")},email_status=${String(x.emailStatus || "À vérifier")},do_not_contact=${Boolean(x.doNotContact)},current_glass_partner=${String(x.currentGlassPartner || "Inconnu")},glass_partner_details=${String(x.glassPartnerDetails || "")},lead_source=${String(x.leadSource || "Prospection terrain")},best_contact_time=${String(x.bestContactTime || "")},decision_process=${String(x.decisionProcess || "")},objections=${String(x.objections || "")},data_quality_score=${quality.score},status=${status},score=${score},notes=${String(x.notes || "")},next_action=${String(x.next || "")},next_action_at=${x.nextActionAt || null},access=${String(x.access || "À vérifier")},insurance=${String(x.insurance || "À vérifier")},potential_revenue=${potential},signed_revenue=${signed},generated_revenue=${generated},updated_at=now() where id=${id} and deleted_at is null returning id,name,sector,zone,address,postal_code as "postalCode",city,website,siret,company_size as "companySize",fleet,fleet_count as "fleetCount",fleet_confidence as "fleetConfidence",fleet_types as "fleetTypes",usage_intensity as "usageIntensity",phone,email,contact_name as "contactName",contact_role as "contactRole",email_status as "emailStatus",do_not_contact as "doNotContact",current_glass_partner as "currentGlassPartner",glass_partner_details as "glassPartnerDetails",lead_source as "leadSource",best_contact_time as "bestContactTime",decision_process as "decisionProcess",objections,data_quality_score as "dataQualityScore",status,score,notes,next_action as "next",next_action_at as "nextActionAt",access,insurance,potential_revenue as "potentialRevenue",signed_revenue as "signedRevenue",generated_revenue as "generatedRevenue",updated_at as "updatedAt"`;
      if (!updated.length) return [];
      if (contacts) {
        const existingIds: string[] = [];
        for (const contact of contacts) {
          if (UUID.test(contact.id)) {
            const changed =
              await sql`update prospect_contacts set name=${contact.name},role=${contact.role},email=${contact.email || null},phone=${contact.phone},is_decision_maker=${contact.isDecisionMaker},is_primary=${contact.isPrimary},preferred_channel=${contact.preferredChannel},notes=${contact.notes},updated_at=now(),deleted_at=null where id=${contact.id} and prospect_id=${id} returning id`;
            if (changed.length) existingIds.push(changed[0].id);
          } else {
            const created =
              await sql`insert into prospect_contacts(prospect_id,name,role,email,phone,is_decision_maker,is_primary,preferred_channel,notes) values(${id},${contact.name},${contact.role},${contact.email || null},${contact.phone},${contact.isDecisionMaker},${contact.isPrimary},${contact.preferredChannel},${contact.notes}) returning id`;
            existingIds.push(created[0].id);
          }
        }
        if (existingIds.length)
          await sql`update prospect_contacts set deleted_at=now(),updated_at=now() where prospect_id=${id} and deleted_at is null and id not in ${sql(existingIds)}`;
        else
          await sql`update prospect_contacts set deleted_at=now(),updated_at=now() where prospect_id=${id} and deleted_at is null`;
      }
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

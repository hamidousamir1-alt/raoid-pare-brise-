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
    const [
      events,
      contacts,
      documents,
      appointments,
      calls,
      offers,
      vehicles,
      serviceCases,
      messages,
      tasks,
      visits,
      notes,
    ] = await Promise.all([
      db()`select id,event_type as "eventType",payload,created_at as "createdAt" from prospect_events where prospect_id=${id} order by created_at desc limit 100`,
      db()`select id,name,role,email,phone,is_decision_maker as "isDecisionMaker",is_primary as "isPrimary",preferred_channel as "preferredChannel",notes from prospect_contacts where prospect_id=${id} and deleted_at is null order by is_primary desc,created_at`,
      db()`select id,name,file_name as "fileName",category,created_at as "createdAt" from documents where prospect_id=${id} and deleted_at is null order by created_at desc`,
      db()`select id,title,meeting_type as "meetingType",starts_at as "startsAt",ends_at as "endsAt",location,status,outcome,next_action as "nextAction" from appointments where prospect_id=${id} order by starts_at desc limit 20`,
      db()`select id,direction,outcome,started_at as "startedAt",duration_seconds as "durationSeconds",notes,next_action as "nextAction",next_action_at as "nextActionAt",previous_status as "previousStatus",resulting_status as "resultingStatus" from call_logs where prospect_id=${id} order by started_at desc limit 30`,
      db()`select id,title,offer_type as "offerType",status,amount,valid_until as "validUntil",summary,terms,sent_at as "sentAt",viewed_at as "viewedAt",decided_at as "decidedAt",refusal_reason as "refusalReason",created_at as "createdAt" from commercial_offers where prospect_id=${id} order by created_at desc limit 30`,
      db()`select id,registration,make,model,vehicle_year as "vehicleYear",driver_name as "driverName",notes,active from fleet_vehicles where prospect_id=${id} order by active desc,registration`,
      db()`select id,vehicle_id as "vehicleId",request_type as "requestType",status,requested_at as "requestedAt",scheduled_at as "scheduledAt",completed_at as "completedAt",insurer,claim_number as "claimNumber",amount,notes,satisfaction from service_cases where prospect_id=${id} order by requested_at desc limit 50`,
      db()`select id,direction,status,subject,scheduled_at as "scheduledAt",sent_at as "sentAt",replied_at as "repliedAt",created_at as "createdAt",reply_category as "replyCategory" from email_messages where prospect_id=${id} order by created_at desc limit 50`,
      db()`select id,title,task_type as "taskType",status,priority,due_at as "dueAt",completed_at as "completedAt",created_at as "createdAt" from sales_tasks where prospect_id=${id} order by created_at desc limit 50`,
      db()`select id,outcome,note,visited_at as "visitedAt" from field_visits where prospect_id=${id} order by visited_at desc limit 50`,
      db()`select id,note_type as "noteType",content,next_action as "nextAction",next_action_at as "nextActionAt",created_at as "createdAt" from prospect_notes where prospect_id=${id} order by created_at desc limit 100`,
    ]);
    const timeline = [
      ...(events as any[]).map((event) => ({
        id: `event:${event.id}`,
        category: "system",
        title: String(event.eventType).replaceAll("_", " "),
        detail:
          typeof event.payload?.note === "string" ? event.payload.note : "",
        status: "recorded",
        at: event.createdAt,
      })),
      ...(calls as any[]).map((call) => ({
        id: `call:${call.id}`,
        category: "call",
        title: `Appel ${call.direction === "inbound" ? "entrant" : "sortant"}`,
        detail: call.notes || call.nextAction || "Compte rendu non renseigné",
        status: call.outcome || "logged",
        at: call.startedAt,
      })),
      ...(messages as any[]).map((message) => ({
        id: `email:${message.id}`,
        category: "email",
        title: `${message.direction === "inbound" ? "E-mail reçu" : "E-mail envoyé"} · ${message.subject}`,
        detail: message.replyCategory
          ? `Réponse détectée : ${message.replyCategory}`
          : "",
        status: message.status,
        at:
          message.repliedAt ||
          message.sentAt ||
          message.scheduledAt ||
          message.createdAt,
      })),
      ...(visits as any[]).map((visit) => ({
        id: `visit:${visit.id}`,
        category: "field",
        title: "Passage dans l’entreprise",
        detail: visit.note || "Aucune note ajoutée",
        status: visit.outcome,
        at: visit.visitedAt,
      })),
      ...(appointments as any[]).map((appointment) => ({
        id: `appointment:${appointment.id}`,
        category: "appointment",
        title: appointment.title,
        detail: `${appointment.meetingType}${appointment.location ? ` · ${appointment.location}` : ""}`,
        status: appointment.status,
        at: appointment.startsAt,
      })),
      ...(offers as any[]).map((offer) => ({
        id: `offer:${offer.id}`,
        category: "offer",
        title: offer.title,
        detail: offer.summary || `${Number(offer.amount || 0).toFixed(0)} €`,
        status: offer.status,
        at: offer.sentAt || offer.createdAt,
      })),
      ...(tasks as any[]).map((task) => ({
        id: `task:${task.id}`,
        category: "task",
        title: task.title,
        detail: `Priorité ${task.priority}/100`,
        status: task.status,
        at: task.completedAt || task.dueAt || task.createdAt,
      })),
      ...(documents as any[]).map((document) => ({
        id: `document:${document.id}`,
        category: "document",
        title: document.name,
        detail: document.category,
        status: "linked",
        at: document.createdAt,
      })),
      ...(serviceCases as any[]).map((serviceCase) => ({
        id: `service:${serviceCase.id}`,
        category: "service",
        title: serviceCase.requestType,
        detail:
          serviceCase.notes || serviceCase.insurer || "Intervention vitrage",
        status: serviceCase.status,
        at:
          serviceCase.completedAt ||
          serviceCase.scheduledAt ||
          serviceCase.requestedAt,
      })),
      ...(notes as any[]).map((note) => ({
        id: `note:${note.id}`,
        category: "note",
        title:
          note.noteType === "qualification"
            ? "Qualification commerciale"
            : note.noteType === "need"
              ? "Besoin identifié"
              : note.noteType === "objection"
                ? "Objection relevée"
                : note.noteType === "meeting_note"
                  ? "Compte rendu d’échange"
                  : "Note commerciale",
        detail: `${note.content}${note.nextAction ? ` · Suite : ${note.nextAction}` : ""}`,
        status: note.nextActionAt ? "suivi planifié" : "information",
        at: note.createdAt,
      })),
    ]
      .filter((item) => item.at)
      .sort(
        (first, second) =>
          new Date(second.at).getTime() - new Date(first.at).getTime(),
      )
      .slice(0, 200);
    const lastInteraction = timeline.find((item) =>
      ["call", "email", "field", "appointment", "offer", "service"].includes(
        item.category,
      ),
    );
    return NextResponse.json(
      {
        mode: "postgresql",
        item: rows[0],
        events,
        contacts,
        documents,
        appointments,
        calls,
        offers,
        vehicles,
        serviceCases,
        messages,
        tasks,
        visits,
        notes,
        timeline,
        activitySummary: {
          total: timeline.length,
          calls: calls.length,
          emails: messages.length,
          visits: visits.length,
          appointments: appointments.length,
          offers: offers.length,
          lastInteractionAt: lastInteraction?.at || null,
        },
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
export async function POST(
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
  const noteTypes = new Set([
      "note",
      "qualification",
      "need",
      "objection",
      "meeting_note",
    ]),
    noteType = String(x.noteType || "note"),
    content = String(x.content || "")
      .trim()
      .slice(0, 5000),
    nextAction = String(x.nextAction || "")
      .trim()
      .slice(0, 500),
    nextActionAt = x.nextActionAt ? new Date(x.nextActionAt) : null;
  if (
    !noteTypes.has(noteType) ||
    !content ||
    (nextActionAt && Number.isNaN(nextActionAt.getTime()))
  )
    return NextResponse.json(
      { error: "invalid_note" },
      { status: 400, headers: noStore },
    );
  try {
    const result = await db().begin(async (sql) => {
      const note =
        await sql`insert into prospect_notes(prospect_id,note_type,content,next_action,next_action_at) select id,${noteType},${content},${nextAction || null},${nextActionAt?.toISOString() || null} from prospects where id=${id} and deleted_at is null returning id`;
      if (!note.length) return [];
      if (nextAction) {
        const due = nextActionAt?.toISOString() || new Date().toISOString();
        await sql`insert into sales_tasks(prospect_id,task_type,title,priority,due_at,source) values(${id},'note_follow_up',${nextAction},75,${due},'prospect_note')`;
        await sql`update prospects set next_action=${nextAction},next_action_at=${due},status=case when status in ('Nouveau','À contacter') then 'Relance' else status end,updated_at=now() where id=${id}`;
      } else await sql`update prospects set updated_at=now() where id=${id}`;
      await sql`insert into prospect_events(prospect_id,event_type,payload) values(${id},'commercial_note_added',${sql.json({ noteId: note[0].id, noteType, hasFollowUp: Boolean(nextAction) })})`;
      return note;
    });
    const created = result as Array<{ id: string }>;
    return created.length
      ? NextResponse.json(
          { ok: true, id: created[0].id },
          { status: 201, headers: noStore },
        )
      : NextResponse.json(
          { error: "not_found" },
          { status: 404, headers: noStore },
        );
  } catch {
    return NextResponse.json(
      { error: "note_not_saved" },
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

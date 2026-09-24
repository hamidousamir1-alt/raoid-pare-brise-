import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authConfigured, sessionValid } from "../../../lib/auth";
import { databaseConfigured, db } from "../../../lib/db";
import {
  MAIL_FROM,
  marketingFrameHtml,
  renderTemplate,
  signatureHtml,
  signatureText,
  microsoftConfigured,
} from "../../../lib/mailing";
import {
  replyCategories,
  type ReplyCategory,
} from "../../../lib/reply-intelligence";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRESENCE_SEQUENCE = "Présence Rapid Pare-Brise J0/J+7/J+14/J+21/J+35";
function bodyToHtml(body: string) {
  const escape = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  return body
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escape(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}
function finalHtml(body: string, category?: string) {
  const rendered = category === "Présence marketing" ? marketingFrameHtml(body) : body;
  return rendered + signatureHtml();
}
async function ensurePresenceSequence() {
  const templates = [
    {
      key: "presence_j0",
      name: "Présence J0 — Découverte Rapid Pare-Brise",
      subject: "Une solution vitrage locale pour {{entreprise}}",
      body: "Bonjour {{contact}},\n\nRapid Pare-Brise Marseille accompagne les entreprises pour le remplacement de pare-brise et de tout vitrage automobile.\n\nNotre objectif : une prise en charge simple et moins d’immobilisation pour vos véhicules. Seriez-vous disponible pour un court échange ?",
      delay: 0,
    },
    {
      key: "presence_j7",
      name: "Présence J+7 — Mobilité de la flotte",
      subject: "Limiter l’immobilisation de vos véhicules",
      body: "Bonjour {{contact}},\n\nUn vitrage endommagé peut rapidement perturber l’activité d’une flotte. Rapid Pare-Brise Marseille organise le remplacement de pare-brise et de tout vitrage pour limiter cette immobilisation.\n\nJe peux vous présenter notre fonctionnement en quelques minutes.",
      delay: 7,
    },
    {
      key: "presence_j14",
      name: "Présence J+14 — Gestion simplifiée",
      subject: "Simplifier vos prochaines interventions vitrage",
      body: "Bonjour {{contact}},\n\nPour {{entreprise}}, nous pouvons simplifier le suivi des interventions : remplacement de pare-brise, vitrage latéral, lunette arrière et autres vitrages automobiles.\n\nL’idée est simple : un interlocuteur local et une organisation claire lorsque le besoin se présente.",
      delay: 14,
    },
    {
      key: "presence_j21",
      name: "Présence J+21 — Force du réseau",
      subject: "La proximité locale, la force d’un grand réseau",
      body: "Bonjour {{contact}},\n\nRapid Pare-Brise s’appuie sur un grand réseau de franchisés tout en conservant un accompagnement de proximité à Marseille.\n\nNous restons disponibles pour les besoins de {{entreprise}} en remplacement de pare-brise et de tout vitrage automobile.",
      delay: 21,
    },
    {
      key: "presence_j35",
      name: "Présence J+35 — Contact utile",
      subject: "Gardez notre contact pour vos besoins vitrage",
      body: "Bonjour {{contact}},\n\nJe vous laisse simplement nos coordonnées pour vos prochains besoins de remplacement de pare-brise ou de tout vitrage automobile.\n\nMême sans besoin immédiat, Rapid Pare-Brise Marseille restera disponible pour {{entreprise}}. Souhaitez-vous convenir d’un rendez-vous de présentation ?",
      delay: 35,
    },
  ];
  await db().begin(async (sql) => {
    for (const template of templates) {
      await sql`insert into email_templates(scenario_key,category,name,situation,subject,body_text,body_html,recommended_delay_days,tone,active) values(${template.key},'Présence marketing',${template.name},'Campagne de notoriété sans réponse',${template.subject},${template.body},${bodyToHtml(template.body)},${template.delay},'Court et attractif',true) on conflict(scenario_key) where scenario_key is not null do nothing`;
    }
    let sequences = await sql`select id from email_sequences where name=${PRESENCE_SEQUENCE} and deleted_at is null limit 1`;
    if (!sequences.length)
      sequences = await sql`insert into email_sequences(name,description,active,stop_on_reply) values(${PRESENCE_SEQUENCE},'Présence marketing espacée, arrêt immédiat sur réponse puis veille 90 jours.',true,true) returning id`;
    for (let index = 0; index < templates.length; index += 1) {
      const template = templates[index],
        rows = await sql`select id from email_templates where scenario_key=${template.key} and deleted_at is null limit 1`;
      if (rows.length)
        await sql`insert into email_sequence_steps(sequence_id,template_id,step_order,delay_days,send_automatically) values(${sequences[0].id},${rows[0].id},${index + 1},${template.delay},true) on conflict(sequence_id,step_order) do update set template_id=excluded.template_id,delay_days=excluded.delay_days,send_automatically=true`;
    }
  });
}
const replyActions: Record<
  ReplyCategory,
  { title: string; next: string; status?: string; doNotContact?: boolean }
> = {
  interested: {
    title: "Appeler pour convenir d’un rendez-vous",
    next: "Appeler pour convenir d’un rendez-vous",
    status: "Relance",
  },
  callback: {
    title: "Programmer le rappel demandé",
    next: "Rappeler à la date convenue",
    status: "Relance",
  },
  information: {
    title: "Préparer les informations demandées",
    next: "Valider et envoyer une réponse personnalisée",
    status: "Relance",
  },
  wrong_contact: {
    title: "Identifier le bon interlocuteur",
    next: "Obtenir les coordonnées du décideur",
  },
  objection: {
    title: "Traiter l’objection et décider de la suite",
    next: "Analyser l’objection avant de répondre",
    status: "Relance",
  },
  not_interested: {
    title: "Refus validé",
    next: "Aucune action commerciale",
    status: "Perdu",
  },
  out_of_office: {
    title: "Relancer après l’absence",
    next: "Relancer après le retour de l’interlocuteur",
    status: "Relance",
  },
  unsubscribe: {
    title: "Désinscription enregistrée",
    next: "Aucun contact — désinscription reçue",
    doNotContact: true,
  },
  ambiguous: {
    title: "Lire et qualifier la réponse",
    next: "Examiner la réponse reçue",
  },
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

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  try {
    await ensurePresenceSequence();
    const [stats, prospects, templates, sequences, recent, tasks, replies, campaignRuns] =
      await Promise.all([
        db()`select count(*) filter(where status='scheduled')::int as scheduled,count(*) filter(where status='sent')::int as sent,count(*) filter(where status='replied')::int as replied,count(*) filter(where status='failed')::int as failed from email_messages`,
        db()`select id,name,email,contact_name as "contactName",contact_role as "contactRole",email_status as "emailStatus",do_not_contact as "doNotContact",status,sector,zone,company_size as "companySize",fleet_count as "fleetCount",score from prospects where deleted_at is null order by updated_at desc`,
        db()`select id,name,subject,body_text as "bodyText",active,scenario_key as "scenarioKey",category,situation,recommended_delay_days as "recommendedDelayDays",requires_field_visit as "requiresFieldVisit",tone,updated_at as "updatedAt" from email_templates where deleted_at is null order by category,name`,
        db()`select s.id,s.name,s.description,s.active,s.stop_on_reply as "stopOnReply",count(st.id)::int as steps from email_sequences s left join email_sequence_steps st on st.sequence_id=s.id where s.deleted_at is null group by s.id order by s.updated_at desc`,
        db()`select m.id,p.name as prospect,m.recipient_email as recipient,m.subject,m.status,m.scheduled_at as "scheduledAt",m.sent_at as "sentAt",m.error_message as error from email_messages m join prospects p on p.id=m.prospect_id order by m.created_at desc limit 50`,
        db()`select t.id,t.title,t.task_type as "taskType",t.priority,t.due_at as "dueAt",p.id as "prospectId",p.name as prospect,m.reply_category as "replyCategory" from sales_tasks t join prospects p on p.id=t.prospect_id left join email_messages m on m.id=t.message_id where t.status='open' order by t.due_at asc nulls first,t.priority desc limit 30`,
        db()`select m.id,m.prospect_id as "prospectId",p.name as prospect,m.sender_email as sender,m.subject,m.body_text as preview,m.replied_at as "receivedAt",m.reply_category as category,m.reply_confidence as confidence,m.review_status as "reviewStatus" from email_messages m join prospects p on p.id=m.prospect_id where m.direction='inbound' order by m.replied_at desc nulls last limit 30`,
        db()`select coalesce(pe.payload->>'campaignId',e.id::text) as id,coalesce(max(pe.payload->>'campaignName'),max(s.name)) as name,min(e.enrolled_at) as "startedAt",count(*)::int as recipients,count(*) filter(where e.status='active')::int as active,count(*) filter(where e.status='paused')::int as paused,count(*) filter(where e.status='replied')::int as replied,count(*) filter(where e.status='completed')::int as completed,count(*) filter(where e.status='cancelled')::int as cancelled,coalesce(sum(ms.sent),0)::int as sent,coalesce(sum(ms.scheduled),0)::int as scheduled,count(*) filter(where outcome.appointment)::int as appointments,count(*) filter(where outcome.offer)::int as offers,count(*) filter(where outcome.won)::int as won,coalesce(sum(outcome.generated_revenue) filter(where outcome.won),0)::float8 as "generatedRevenue" from email_enrollments e join email_sequences s on s.id=e.sequence_id join lateral(select payload from prospect_events where prospect_id=e.prospect_id and event_type='email_campaign_started' and payload->>'enrollmentId'=e.id::text order by created_at desc limit 1) pe on true left join lateral(select count(*) filter(where status in('sent','delivered','replied'))::int as sent,count(*) filter(where status='scheduled')::int as scheduled from email_messages where enrollment_id=e.id) ms on true join lateral(select exists(select 1 from appointments a where a.prospect_id=e.prospect_id and a.created_at between e.enrolled_at and e.enrolled_at+interval '90 days' and coalesce(a.status,'') not in('cancelled','no_show')) as appointment,exists(select 1 from commercial_offers o where o.prospect_id=e.prospect_id and o.created_at between e.enrolled_at and e.enrolled_at+interval '90 days') as offer,(p.status='Gagné' and p.updated_at between e.enrolled_at and e.enrolled_at+interval '90 days') as won,coalesce(p.generated_revenue,0)::float8 as generated_revenue from prospects p where p.id=e.prospect_id) outcome on true group by coalesce(pe.payload->>'campaignId',e.id::text) order by min(e.enrolled_at) desc limit 20`,
      ]);
    return NextResponse.json(
      {
        configured: microsoftConfigured(),
        sender: MAIL_FROM,
        stats: stats[0],
        prospects,
        templates,
        sequences,
        recent,
        tasks,
        replies,
        campaignRuns,
      },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json(
      { error: "mailing_schema_unavailable" },
      { status: 503, headers: noStore },
    );
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
  try {
    if (x.action === "complete_task" || x.action === "dismiss_task") {
      const id = String(x.taskId || ""),
        status = x.action === "complete_task" ? "completed" : "dismissed";
      const rows =
        await db()`update sales_tasks set status=${status},completed_at=case when ${status}='completed' then now() else null end,updated_at=now() where id=${id} and status='open' returning prospect_id as "prospectId"`;
      if (!rows.length)
        return NextResponse.json(
          { error: "not_found" },
          { status: 404, headers: noStore },
        );
      await db()`insert into prospect_events(prospect_id,event_type,payload) values(${rows[0].prospectId},'sales_task_closed',${db().json({ taskId: id, status })})`;
      return NextResponse.json({ ok: true }, { headers: noStore });
    }
    if (x.action === "review_reply") {
      const id = String(x.messageId || ""),
        category = String(x.category || "") as ReplyCategory;
      if (!replyCategories.includes(category))
        return NextResponse.json(
          { error: "invalid_category" },
          { status: 400, headers: noStore },
        );
      const action = replyActions[category],
        rows =
          await db()`update email_messages set reply_category=${category},review_status=case when reply_category=${category} then 'approved' else 'changed' end,updated_at=now() where id=${id} and direction='inbound' returning prospect_id as "prospectId"`;
      if (!rows.length)
        return NextResponse.json(
          { error: "not_found" },
          { status: 404, headers: noStore },
        );
      await db().begin(async (sql) => {
        await sql`update sales_tasks set title=${action.title},updated_at=now() where message_id=${id} and status='open'`;
        await sql`update prospects set status=coalesce(${action.status || null},status),do_not_contact=case when ${Boolean(action.doNotContact)} then true else do_not_contact end,next_action=${action.next},next_action_at=now(),updated_at=now() where id=${rows[0].prospectId}`;
        await sql`insert into prospect_events(prospect_id,event_type,payload) values(${rows[0].prospectId},'email_reply_reviewed',${sql.json({ messageId: id, category })})`;
      });
      return NextResponse.json({ ok: true }, { headers: noStore });
    }
    if (x.action === "update_contact") {
      const id = String(x.prospectId || ""),
        email = String(x.email || "")
          .trim()
          .toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email))
        return NextResponse.json(
          { error: "invalid_email" },
          { status: 400, headers: noStore },
        );
      const rows =
        await db()`update prospects set email=${email},contact_name=${String(x.contactName || "")},contact_role=${String(x.contactRole || "")},email_status='Valide',do_not_contact=${Boolean(x.doNotContact)},updated_at=now() where id=${id} and deleted_at is null returning id`;
      return rows.length
        ? NextResponse.json({ ok: true }, { headers: noStore })
        : NextResponse.json(
            { error: "not_found" },
            { status: 404, headers: noStore },
          );
    }
    if (x.action === "create_template") {
      const name = String(x.name || "").trim(),
        subject = String(x.subject || "").trim(),
        body = String(x.body || "").trim(),
        category = String(x.category || "Personnalisé").trim(),
        situation = String(x.situation || "").trim(),
        tone = String(x.tone || "Professionnel").trim(),
        delay = Math.min(365, Math.max(0, Number(x.recommendedDelayDays) || 0));
      if (!name || !subject || !body)
        return NextResponse.json(
          { error: "missing_fields" },
          { status: 400, headers: noStore },
        );
      const rows =
        await db()`insert into email_templates(name,subject,body_html,body_text,category,situation,recommended_delay_days,tone) values(${name},${subject},${bodyToHtml(body)},${body},${category},${situation},${delay},${tone}) returning id`;
      return NextResponse.json(
        { ok: true, id: rows[0].id },
        { status: 201, headers: noStore },
      );
    }
    if (x.action === "update_template") {
      const id = String(x.templateId || ""),
        name = String(x.name || "").trim(),
        subject = String(x.subject || "").trim(),
        body = String(x.bodyText || "").trim(),
        category = String(x.category || "Personnalisé").trim(),
        situation = String(x.situation || "").trim(),
        tone = String(x.tone || "Professionnel").trim(),
        delay = Math.min(365, Math.max(0, Number(x.recommendedDelayDays) || 0));
      if (!id || !name || !subject || !body)
        return NextResponse.json(
          { error: "missing_fields" },
          { status: 400, headers: noStore },
        );
      const rows =
        await db()`update email_templates set name=${name},subject=${subject},body_html=${bodyToHtml(body)},body_text=${body},category=${category},situation=${situation},recommended_delay_days=${delay},tone=${tone},updated_at=now() where id=${id} and deleted_at is null returning id`;
      return rows.length
        ? NextResponse.json({ ok: true }, { headers: noStore })
        : NextResponse.json(
            { error: "not_found" },
            { status: 404, headers: noStore },
          );
    }
    if (x.action === "enroll") {
      const prospectId = String(x.prospectId || ""),
        sequenceId = String(x.sequenceId || "");
      const [p] =
        await db()`select id,name,sector,email,contact_name as "contactName",do_not_contact as "doNotContact" from prospects where id=${prospectId} and deleted_at is null`;
      if (!p)
        return NextResponse.json(
          { error: "not_found" },
          { status: 404, headers: noStore },
        );
      if (p.doNotContact)
        return NextResponse.json(
          { error: "do_not_contact" },
          { status: 409, headers: noStore },
        );
      if (!p.email)
        return NextResponse.json(
          { error: "missing_email" },
          { status: 409, headers: noStore },
        );
      const steps =
        await db()`select st.step_order as "stepOrder",st.delay_days as "delayDays",st.template_id as "templateId",t.subject,t.body_html as "bodyHtml",t.body_text as "bodyText",t.category from email_sequence_steps st join email_templates t on t.id=st.template_id and t.active=true and t.deleted_at is null join email_sequences s on s.id=st.sequence_id and s.active=true and s.deleted_at is null where st.sequence_id=${sequenceId} order by st.step_order`;
      if (!steps.length)
        return NextResponse.json(
          { error: "sequence_empty" },
          { status: 409, headers: noStore },
        );
      const data = {
        company: p.name,
        contact: p.contactName,
        sector: p.sector,
      };
      await db().begin(async (sql) => {
        const existing =
          await sql`select id from email_enrollments where prospect_id=${p.id} and status='active'`;
        if (existing.length) throw new Error("already_enrolled");
        const enrollment =
          await sql`insert into email_enrollments(prospect_id,sequence_id,status,current_step,next_send_at) values(${p.id},${sequenceId},'active',1,now()+make_interval(days=>${steps[0].delayDays})) returning id`;
        for (const step of steps) {
          const scheduledAt = new Date(
              Date.now() + Number(step.delayDays) * 86400_000,
            ),
            subject = renderTemplate(step.subject, data),
            html = finalHtml(renderTemplate(step.bodyHtml, data), step.category),
            plain = renderTemplate(step.bodyText, data) + signatureText(),
            key = `sequence:${enrollment[0].id}:step:${step.stepOrder}`;
          await sql`insert into email_messages(prospect_id,enrollment_id,template_id,status,recipient_email,sender_email,sender_name,subject,body_html,body_text,scheduled_at,idempotency_key) values(${p.id},${enrollment[0].id},${step.templateId},'scheduled',${p.email},${MAIL_FROM.email},${MAIL_FROM.name},${subject},${html},${plain},${scheduledAt.toISOString()},${key})`;
        }
        await sql`update prospects set next_action='Premier message de la séquence programmé',next_action_at=now()+make_interval(days=>${steps[0].delayDays}),updated_at=now() where id=${p.id}`;
        await sql`insert into prospect_events(prospect_id,event_type,payload) values(${p.id},'email_sequence_started',${sql.json({ sequenceId, enrollmentId: enrollment[0].id })})`;
      });
      return NextResponse.json(
        { ok: true, willSend: microsoftConfigured() },
        { status: 201, headers: noStore },
      );
    }
    if (x.action === "bulk_enroll") {
      const campaignName = String(x.campaignName || "").trim().slice(0, 120),
        sequenceId = String(x.sequenceId || ""),
        requestedIds = (Array.isArray(x.prospectIds)
          ? Array.from(new Set(x.prospectIds.map(String).filter((id: string) => UUID.test(id)))).slice(0, 500)
          : []) as string[],
        startsAt = new Date(String(x.startsAt || "")),
        dailyLimit = Math.min(50, Math.max(1, Number(x.dailyLimit) || 20));
      if (!campaignName || !UUID.test(sequenceId) || !requestedIds.length || Number.isNaN(startsAt.getTime()))
        return NextResponse.json({ error: "invalid_campaign" }, { status: 400, headers: noStore });
      const steps = await db()`select st.step_order as "stepOrder",st.delay_days as "delayDays",st.template_id as "templateId",t.subject,t.body_html as "bodyHtml",t.body_text as "bodyText",t.category from email_sequence_steps st join email_templates t on t.id=st.template_id and t.active=true and t.deleted_at is null join email_sequences s on s.id=st.sequence_id and s.active=true and s.deleted_at is null where st.sequence_id=${sequenceId} order by st.step_order`;
      if (!steps.length)
        return NextResponse.json({ error: "sequence_empty" }, { status: 409, headers: noStore });
      const prospects = await db()`select id,name,sector,email,contact_name as "contactName",do_not_contact as "doNotContact",email_status as "emailStatus",status from prospects where id in ${db()(requestedIds)} and deleted_at is null order by score desc,name`;
      const seen = new Set<string>();
      const eligible = prospects.filter((p: any) => {
        const email = String(p.email || "").toLowerCase();
        if (!email || p.doNotContact || ["Gagné", "Perdu"].includes(p.status) || ["Invalide", "Rejeté", "Bounce"].includes(p.emailStatus) || seen.has(email)) return false;
        seen.add(email);
        return true;
      });
      const campaignId = randomUUID();
      let enrolled = 0,
        skipped = prospects.length - eligible.length;
      await db().begin(async (sql) => {
        for (const p of eligible) {
          const existing = await sql`select id from email_enrollments where prospect_id=${p.id} and status='active'`;
          if (existing.length) { skipped += 1; continue; }
          const position = enrolled,
            batchDays = Math.floor(position / dailyLimit),
            minuteOffset = (position % dailyLimit) * 5,
            firstSend = new Date(startsAt.getTime() + batchDays * 86400_000 + minuteOffset * 60_000),
            enrollment = await sql`insert into email_enrollments(prospect_id,sequence_id,status,current_step,next_send_at) values(${p.id},${sequenceId},'active',1,${firstSend.toISOString()}) returning id`;
          const templateData = { company: p.name, contact: p.contactName, sector: p.sector };
          for (const step of steps) {
            const scheduledAt = new Date(firstSend.getTime() + Number(step.delayDays) * 86400_000),
              subject = renderTemplate(step.subject, templateData),
              html = finalHtml(renderTemplate(step.bodyHtml, templateData), step.category),
              plain = renderTemplate(step.bodyText, templateData) + signatureText(),
              key = `campaign:${enrollment[0].id}:step:${step.stepOrder}`;
            await sql`insert into email_messages(prospect_id,enrollment_id,template_id,status,recipient_email,sender_email,sender_name,subject,body_html,body_text,scheduled_at,idempotency_key) values(${p.id},${enrollment[0].id},${step.templateId},'scheduled',${p.email},${MAIL_FROM.email},${MAIL_FROM.name},${subject},${html},${plain},${scheduledAt.toISOString()},${key})`;
          }
          await sql`update prospects set next_action='Campagne marketing programmée — premier message à venir',next_action_at=${firstSend.toISOString()},updated_at=now() where id=${p.id}`;
          await sql`insert into prospect_events(prospect_id,event_type,payload) values(${p.id},'email_campaign_started',${sql.json({ campaignId, campaignName, sequenceId, enrollmentId: enrollment[0].id, position: position + 1 })})`;
          enrolled += 1;
        }
      });
      return NextResponse.json({ ok: true, campaignId, enrolled, skipped, willSend: microsoftConfigured() }, { status: 201, headers: noStore });
    }
    if (x.action === "campaign_control") {
      const campaignId = String(x.campaignId || ""),
        operation = String(x.operation || "");
      if (!UUID.test(campaignId) || !["pause", "resume", "cancel"].includes(operation))
        return NextResponse.json({ error: "invalid_campaign_control" }, { status: 400, headers: noStore });
      const enrollments = await db()`select e.id,e.prospect_id as "prospectId",e.status from email_enrollments e join prospect_events pe on pe.prospect_id=e.prospect_id and pe.event_type='email_campaign_started' and pe.payload->>'enrollmentId'=e.id::text where pe.payload->>'campaignId'=${campaignId} or (pe.payload->>'campaignId' is null and e.id=${campaignId})`;
      if (!enrollments.length)
        return NextResponse.json({ error: "campaign_not_found" }, { status: 404, headers: noStore });
      await db().begin(async (sql) => {
        for (const enrollment of enrollments) {
          if (operation === "pause" && enrollment.status === "active") {
            await sql`update email_enrollments set status='paused',stop_reason='manual_pause',updated_at=now() where id=${enrollment.id}`;
            await sql`update prospects set next_action='Campagne marketing mise en pause',next_action_at=null,updated_at=now() where id=${enrollment.prospectId}`;
          } else if (operation === "cancel" && ["active","paused"].includes(enrollment.status)) {
            await sql`update email_enrollments set status='cancelled',stop_reason='manual_cancel',next_send_at=null,updated_at=now() where id=${enrollment.id}`;
            await sql`update email_messages set status='cancelled',updated_at=now() where enrollment_id=${enrollment.id} and status='scheduled'`;
            await sql`update prospects set next_action='Décider de la suite après l’arrêt de la campagne',next_action_at=now(),updated_at=now() where id=${enrollment.prospectId}`;
          } else if (operation === "resume" && enrollment.status === "paused") {
            const messages = await sql`select id,scheduled_at as "scheduledAt" from email_messages where enrollment_id=${enrollment.id} and status='scheduled' order by scheduled_at`;
            for (let index = 0; index < messages.length; index += 1) {
              if (new Date(messages[index].scheduledAt).getTime() <= Date.now())
                await sql`update email_messages set scheduled_at=${new Date(Date.now() + index * 5 * 60_000).toISOString()},updated_at=now() where id=${messages[index].id}`;
            }
            const next = await sql`select scheduled_at as "scheduledAt" from email_messages where enrollment_id=${enrollment.id} and status='scheduled' order by scheduled_at limit 1`;
            await sql`update email_enrollments set status='active',stop_reason=null,next_send_at=${next[0]?.scheduledAt || null},updated_at=now() where id=${enrollment.id}`;
            await sql`update prospects set next_action='Campagne réactivée — prochaine relance automatique',next_action_at=${next[0]?.scheduledAt || null},updated_at=now() where id=${enrollment.prospectId}`;
          }
          await sql`insert into prospect_events(prospect_id,event_type,payload) values(${enrollment.prospectId},'email_campaign_controlled',${sql.json({ campaignId, operation, enrollmentId: enrollment.id })})`;
        }
      });
      return NextResponse.json({ ok: true, affected: enrollments.length }, { headers: noStore });
    }
    if (x.action === "schedule") {
      const prospectId = String(x.prospectId || ""),
        templateId = String(x.templateId || ""),
        when = x.scheduledAt ? new Date(x.scheduledAt) : new Date();
      if (Number.isNaN(when.getTime()))
        return NextResponse.json(
          { error: "invalid_date" },
          { status: 400, headers: noStore },
        );
      const [p] =
        await db()`select id,name,sector,email,contact_name as "contactName",do_not_contact as "doNotContact" from prospects where id=${prospectId} and deleted_at is null`;
      const [t] =
        await db()`select id,subject,body_html as "bodyHtml",body_text as "bodyText",category from email_templates where id=${templateId} and active=true and deleted_at is null`;
      if (!p || !t)
        return NextResponse.json(
          { error: "not_found" },
          { status: 404, headers: noStore },
        );
      if (p.doNotContact)
        return NextResponse.json(
          { error: "do_not_contact" },
          { status: 409, headers: noStore },
        );
      if (!p.email)
        return NextResponse.json(
          { error: "missing_email" },
          { status: 409, headers: noStore },
        );
      const data = {
          company: p.name,
          contact: p.contactName,
          sector: p.sector,
        },
        subject = renderTemplate(t.subject, data),
        html = finalHtml(renderTemplate(t.bodyHtml, data), t.category),
        plain = renderTemplate(t.bodyText, data) + signatureText(),
        key = `manual:${p.id}:${t.id}:${when.toISOString()}`;
      await db()`insert into email_messages(prospect_id,template_id,status,recipient_email,sender_email,sender_name,subject,body_html,body_text,scheduled_at,idempotency_key) values(${p.id},${t.id},'scheduled',${p.email},${MAIL_FROM.email},${MAIL_FROM.name},${subject},${html},${plain},${when.toISOString()},${key}) on conflict(idempotency_key) do nothing`;
      await db()`insert into prospect_events(prospect_id,event_type,payload) values(${p.id},'email_scheduled',${db().json({ scheduledAt: when.toISOString(), subject })})`;
      return NextResponse.json(
        { ok: true, willSend: microsoftConfigured() },
        { status: 201, headers: noStore },
      );
    }
    return NextResponse.json(
      { error: "unknown_action" },
      { status: 400, headers: noStore },
    );
  } catch {
    return NextResponse.json(
      { error: "mailing_operation_failed" },
      { status: 503, headers: noStore },
    );
  }
}

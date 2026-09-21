import { NextRequest, NextResponse } from "next/server";
import { authConfigured, sessionValid } from "../../../lib/auth";
import { databaseConfigured, db } from "../../../lib/db";
import {
  MAIL_FROM,
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
    const [stats, prospects, templates, sequences, recent, tasks, replies] =
      await Promise.all([
        db()`select count(*) filter(where status='scheduled')::int as scheduled,count(*) filter(where status='sent')::int as sent,count(*) filter(where status='replied')::int as replied,count(*) filter(where status='failed')::int as failed from email_messages`,
        db()`select id,name,email,contact_name as "contactName",contact_role as "contactRole",email_status as "emailStatus",do_not_contact as "doNotContact",status from prospects where deleted_at is null order by updated_at desc`,
        db()`select id,name,subject,body_text as "bodyText",active,updated_at as "updatedAt" from email_templates where deleted_at is null order by updated_at desc`,
        db()`select s.id,s.name,s.description,s.active,s.stop_on_reply as "stopOnReply",count(st.id)::int as steps from email_sequences s left join email_sequence_steps st on st.sequence_id=s.id where s.deleted_at is null group by s.id order by s.updated_at desc`,
        db()`select m.id,p.name as prospect,m.recipient_email as recipient,m.subject,m.status,m.scheduled_at as "scheduledAt",m.sent_at as "sentAt",m.error_message as error from email_messages m join prospects p on p.id=m.prospect_id order by m.created_at desc limit 50`,
        db()`select t.id,t.title,t.task_type as "taskType",t.priority,t.due_at as "dueAt",p.id as "prospectId",p.name as prospect,m.reply_category as "replyCategory" from sales_tasks t join prospects p on p.id=t.prospect_id left join email_messages m on m.id=t.message_id where t.status='open' order by t.due_at asc nulls first,t.priority desc limit 30`,
        db()`select m.id,m.prospect_id as "prospectId",p.name as prospect,m.sender_email as sender,m.subject,m.body_text as preview,m.replied_at as "receivedAt",m.reply_category as category,m.reply_confidence as confidence,m.review_status as "reviewStatus" from email_messages m join prospects p on p.id=m.prospect_id where m.direction='inbound' order by m.replied_at desc nulls last limit 30`,
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
        body = String(x.body || "").trim();
      if (!name || !subject || !body)
        return NextResponse.json(
          { error: "missing_fields" },
          { status: 400, headers: noStore },
        );
      const rows =
        await db()`insert into email_templates(name,subject,body_html,body_text) values(${name},${subject},${body
          .split("\n")
          .map((line: string) => `<p>${line}</p>`)
          .join("")},${body}) returning id`;
      return NextResponse.json(
        { ok: true, id: rows[0].id },
        { status: 201, headers: noStore },
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
        await db()`select st.step_order as "stepOrder",st.delay_days as "delayDays",st.template_id as "templateId",t.subject,t.body_html as "bodyHtml",t.body_text as "bodyText" from email_sequence_steps st join email_templates t on t.id=st.template_id and t.active=true and t.deleted_at is null join email_sequences s on s.id=st.sequence_id and s.active=true and s.deleted_at is null where st.sequence_id=${sequenceId} order by st.step_order`;
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
            html = renderTemplate(step.bodyHtml, data) + signatureHtml(),
            plain = renderTemplate(step.bodyText, data) + signatureText(),
            key = `sequence:${enrollment[0].id}:step:${step.stepOrder}`;
          await sql`insert into email_messages(prospect_id,enrollment_id,template_id,status,recipient_email,sender_email,sender_name,subject,body_html,body_text,scheduled_at,idempotency_key) values(${p.id},${enrollment[0].id},${step.templateId},'scheduled',${p.email},${MAIL_FROM.email},${MAIL_FROM.name},${subject},${html},${plain},${scheduledAt.toISOString()},${key})`;
        }
        await sql`insert into prospect_events(prospect_id,event_type,payload) values(${p.id},'email_sequence_started',${sql.json({ sequenceId, enrollmentId: enrollment[0].id })})`;
      });
      return NextResponse.json(
        { ok: true, willSend: microsoftConfigured() },
        { status: 201, headers: noStore },
      );
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
        await db()`select id,subject,body_html as "bodyHtml",body_text as "bodyText" from email_templates where id=${templateId} and active=true and deleted_at is null`;
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
        html = renderTemplate(t.bodyHtml, data) + signatureHtml(),
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

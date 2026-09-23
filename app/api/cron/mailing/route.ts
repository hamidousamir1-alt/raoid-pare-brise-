import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured, db } from "../../../../lib/db";
import {
  escapeHtml,
  MAIL_FROM,
  microsoftConfigured,
} from "../../../../lib/mailing";
import { recentInbox, sendMicrosoftMail } from "../../../../lib/microsoft-mail";
import { classifyReply } from "../../../../lib/reply-intelligence";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(
    secret && req.headers.get("authorization") === `Bearer ${secret}`,
  );
}
export async function GET(req: NextRequest) {
  if (!authorized(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!databaseConfigured())
    return NextResponse.json(
      { error: "database_not_configured" },
      { status: 503 },
    );
  const automation =
    await db()`select enabled from automation_settings where setting_key='mailing_sequence'`;
  if (automation.length && !automation[0].enabled)
    return NextResponse.json({ ok: true, paused: true, sent: 0, replies: 0 });
  if (!microsoftConfigured())
    return NextResponse.json({
      ok: true,
      configured: false,
      sent: 0,
      replies: 0,
    });
  let sent = 0,
    replies = 0,
    failed = 0;
  try {
    const due =
      await db()`update email_messages set status='sending',updated_at=now() where id in(select m.id from email_messages m where m.status='scheduled' and m.scheduled_at<=now() and (m.enrollment_id is null or exists(select 1 from email_enrollments e where e.id=m.enrollment_id and e.status='active')) order by m.scheduled_at limit 20 for update skip locked) returning id,prospect_id as "prospectId",enrollment_id as "enrollmentId",recipient_email as recipient,subject,body_html as html`;
    for (const m of due) {
      try {
        const logo = `${process.env.CRM_PUBLIC_URL!.replace(/\/$/, "")}/rapid-logo.png`,
          html = String(m.html).replaceAll("{{logo_url}}", logo);
        await sendMicrosoftMail({ to: m.recipient, subject: m.subject, html });
        await db().begin(async (sql) => {
          await sql`update email_messages set status='sent',sent_at=now(),updated_at=now() where id=${m.id} and status='sending'`;
          const next = m.enrollmentId
            ? await sql`select scheduled_at as "scheduledAt" from email_messages where enrollment_id=${m.enrollmentId} and status='scheduled' order by scheduled_at limit 1`
            : [];
          await sql`update prospects set status=case when status in('Nouveau','À contacter') then 'Relance' else status end,last_contact_at=now(),next_action=${next.length ? "Campagne active — prochaine relance automatique" : "Cycle marketing envoyé — attendre une réponse"},next_action_at=${next[0]?.scheduledAt || null},updated_at=now() where id=${m.prospectId}`;
          await sql`insert into prospect_events(prospect_id,event_type,payload) values(${m.prospectId},'email_sent',${sql.json({ messageId: m.id, subject: m.subject, enrollmentId: m.enrollmentId, nextScheduledAt: next[0]?.scheduledAt || null })})`;
        });
        sent++;
      } catch (e) {
        await db()`update email_messages set status='failed',error_code='provider_error',error_message=${e instanceof Error ? e.message : "provider_error"},updated_at=now() where id=${m.id}`;
        failed++;
      }
    }
    const completedPresence =
      await db()`update email_enrollments e set status='completed',stop_reason='sequence_completed',next_send_at=null,updated_at=now() from email_sequences s where e.sequence_id=s.id and e.status='active' and s.name like 'Présence Rapid Pare-Brise%' and not exists(select 1 from email_messages m where m.enrollment_id=e.id and m.status in('scheduled','sending')) and exists(select 1 from email_messages m where m.enrollment_id=e.id and m.status in('sent','delivered')) returning e.prospect_id as "prospectId"`;
    for (const enrollment of completedPresence) {
      await db().begin(async (sql) => {
        await sql`update prospects set next_action='Réévaluer une présence marketing Rapid Pare-Brise',next_action_at=now()+interval '90 days',updated_at=now() where id=${enrollment.prospectId} and do_not_contact=false`;
        await sql`insert into sales_tasks(prospect_id,task_type,title,priority,due_at,source,generated_for_date) values(${enrollment.prospectId},'marketing_nurture','Réévaluer une nouvelle campagne de présence',45,now()+interval '90 days','mailing',(current_date+90)) on conflict(prospect_id,task_type,generated_for_date) where generated_for_date is not null do nothing`;
        await sql`insert into prospect_events(prospect_id,event_type,payload) values(${enrollment.prospectId},'email_presence_cycle_completed',${sql.json({ pauseDays: 90 })})`;
      });
    }
    const inbox = await recentInbox();
    for (const item of inbox) {
      const from = item.from?.emailAddress?.address?.toLowerCase();
      if (!from) continue;
      const decision = classifyReply(item.subject, item.bodyPreview || "");
      const rows = await db().begin(async (sql) => {
        const prospects =
          await sql`select id,name from prospects where lower(email)=${from} and deleted_at is null`;
        if (!prospects.length) return [];
        const p = prospects[0];
        const inbound =
          await sql`insert into email_messages(prospect_id,direction,status,provider_message_id,recipient_email,sender_email,sender_name,subject,body_html,body_text,replied_at,idempotency_key,reply_category,reply_confidence,review_status) values(${p.id},'inbound','replied',${item.id},${MAIL_FROM.email},${from},${p.name},${item.subject || "(Sans objet)"},${`<p>${escapeHtml(item.bodyPreview || "Aperçu indisponible")}</p>`},${item.bodyPreview || "Aperçu indisponible"},${item.receivedDateTime},${`inbound:${item.id}`},${decision.category},${decision.confidence},${decision.needsReview ? "pending" : "not_required"}) on conflict(idempotency_key) do nothing returning id`;
        if (!inbound.length) return [];
        const changed =
          await sql`update email_enrollments set status='replied',stop_reason='reply_received',updated_at=now() where prospect_id=${p.id} and status='active' returning id`;
        if (changed.length)
          await sql`update email_messages set status='cancelled',updated_at=now() where enrollment_id in ${sql(changed.map((row: any) => row.id))} and status='scheduled'`;
        await sql`update email_messages set status='replied',replied_at=${item.receivedDateTime},updated_at=now() where id=(select id from email_messages where prospect_id=${p.id} and direction='outbound' and status in('sent','delivered') order by sent_at desc nulls last limit 1)`;
        await sql`insert into sales_tasks(prospect_id,message_id,task_type,title,priority,due_at,source) values(${p.id},${inbound[0].id},${decision.taskType},${decision.taskTitle},${decision.priority},now()+make_interval(days=>${decision.dueInDays}),'email_reply') on conflict(message_id,task_type) where message_id is not null do nothing`;
        await sql`update prospects set do_not_contact=case when ${decision.category}='unsubscribe' then true else do_not_contact end,status=case when ${decision.category}='interested' then 'Relance' when ${decision.category}='not_interested' then 'Perdu' else status end,score=least(100,score+case when ${decision.category}='interested' then 15 when ${decision.category}='callback' then 10 when ${decision.category}='information' then 8 when ${decision.category}='objection' then 4 else 0 end),next_action=${decision.nextAction},next_action_at=now()+make_interval(days=>${decision.dueInDays}),last_contact_at=${item.receivedDateTime},updated_at=now() where id=${p.id}`;
        await sql`insert into prospect_events(prospect_id,event_type,payload) values(${p.id},'email_reply_classified',${sql.json({ messageId: inbound[0].id, subject: item.subject, receivedAt: item.receivedDateTime, category: decision.category, confidence: decision.confidence, needsReview: decision.needsReview })})`;
        return inbound;
      });
      if (rows.length) replies++;
    }
    return NextResponse.json({
      ok: true,
      configured: true,
      sent,
      replies,
      failed,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "mailing_cron_failed",
        sent,
        replies,
        failed,
      },
      { status: 503 },
    );
  }
}

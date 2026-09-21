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
      await db()`update email_messages set status='sending',updated_at=now() where id in(select id from email_messages where status='scheduled' and scheduled_at<=now() order by scheduled_at limit 20 for update skip locked) returning id,prospect_id as "prospectId",recipient_email as recipient,subject,body_html as html`;
    for (const m of due) {
      try {
        const logo = `${process.env.CRM_PUBLIC_URL!.replace(/\/$/, "")}/rapid-logo.png`,
          html = String(m.html).replaceAll("{{logo_url}}", logo);
        await sendMicrosoftMail({ to: m.recipient, subject: m.subject, html });
        await db()`update email_messages set status='sent',sent_at=now(),updated_at=now() where id=${m.id} and status='sending'`;
        await db()`insert into prospect_events(prospect_id,event_type,payload) values(${m.prospectId},'email_sent',${db().json({ messageId: m.id, subject: m.subject })})`;
        sent++;
      } catch (e) {
        await db()`update email_messages set status='failed',error_code='provider_error',error_message=${e instanceof Error ? e.message : "provider_error"},updated_at=now() where id=${m.id}`;
        failed++;
      }
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
        await sql`update prospects set do_not_contact=case when ${decision.category}='unsubscribe' then true else do_not_contact end,status=case when ${decision.category}='interested' then 'Relance' else status end,next_action=${decision.nextAction},next_action_at=now()+make_interval(days=>${decision.dueInDays}),last_contact_at=${item.receivedDateTime},updated_at=now() where id=${p.id}`;
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

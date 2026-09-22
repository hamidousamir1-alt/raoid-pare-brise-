import { NextRequest, NextResponse } from "next/server";
import { authConfigured, sessionValid } from "../../../lib/auth";
import { databaseConfigured, db } from "../../../lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
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
    const [settings, audit, sequences] = await Promise.all([
      db()`select setting_key as "key",label,category,enabled,numeric_value as "numericValue",unit,description,updated_at as "updatedAt" from automation_settings order by category,label`,
      db()`select a.id,a.setting_key as "key",s.label,a.new_value as "newValue",a.changed_at as "changedAt" from automation_audit a join automation_settings s on s.setting_key=a.setting_key order by a.changed_at desc limit 30`,
      db()`select s.id,s.name,s.active,s.stop_on_reply as "stopOnReply",count(st.id)::int as steps from email_sequences s left join email_sequence_steps st on st.sequence_id=s.id where s.deleted_at is null group by s.id order by s.name`,
    ]);
    return NextResponse.json(
      { settings, audit, sequences },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json(
      { error: "settings_unavailable" },
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
  const key = String(x.key || ""),
    enabled = Boolean(x.enabled),
    numericValue = Number(x.numericValue);
  if (
    !key ||
    !Number.isInteger(numericValue) ||
    numericValue < 0 ||
    numericValue > 3650
  )
    return NextResponse.json(
      { error: "invalid_setting" },
      { status: 400, headers: noStore },
    );
  try {
    const rows = await db().begin(async (sql) => {
      const before =
        await sql`select enabled,numeric_value as "numericValue" from automation_settings where setting_key=${key} for update`;
      if (!before.length) return [];
      const changed =
        await sql`update automation_settings set enabled=${enabled},numeric_value=${numericValue},updated_at=now() where setting_key=${key} returning setting_key`;
      await sql`insert into automation_audit(setting_key,previous_value,new_value) values(${key},${sql.json(before[0])},${sql.json({ enabled, numericValue })})`;
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
      { error: "setting_failed" },
      { status: 503, headers: noStore },
    );
  }
}

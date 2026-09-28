import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured } from "../../../../lib/db";
import { generateDailyActions } from "../../../../lib/daily-actions";
import { recordSystemRun } from "../../../../lib/system-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!databaseConfigured())
    return NextResponse.json(
      { error: "database_not_configured" },
      { status: 503 },
    );
  try {
    const result = await generateDailyActions();
    await recordSystemRun("daily_actions", "success", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    await recordSystemRun("daily_actions", "failed", {
      error: error instanceof Error ? error.message : "daily_plan_failed",
    }).catch(() => undefined);
    return NextResponse.json({ error: "daily_plan_failed" }, { status: 503 });
  }
}

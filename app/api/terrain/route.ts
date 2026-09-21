import { NextRequest, NextResponse } from "next/server";
import { authConfigured, sessionValid } from "../../../lib/auth";
import { databaseConfigured, db } from "../../../lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" },
  outcomes = new Set([
    "visited",
    "absent",
    "callback",
    "not_interested",
    "not_found",
    "closed",
  ]);
export async function POST(req: NextRequest) {
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
  let x: any;
  try {
    x = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: noStore },
    );
  }
  const id = String(x.prospectId || ""),
    outcome = String(x.outcome || ""),
    note = String(x.note || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id) || !outcomes.has(outcome))
    return NextResponse.json(
      { error: "invalid_visit" },
      { status: 400, headers: noStore },
    );
  try {
    const rows = await db().begin(async (sql) => {
      const visit =
        await sql`insert into field_visits(prospect_id,outcome,note,latitude,longitude) select id,${outcome},${note || null},${Number.isFinite(Number(x.latitude)) ? Number(x.latitude) : null},${Number.isFinite(Number(x.longitude)) ? Number(x.longitude) : null} from prospects where id=${id} and deleted_at is null returning id`;
      if (!visit.length) return [];
      const status =
          outcome === "not_interested"
            ? "Perdu"
            : outcome === "callback"
              ? "Relance"
              : outcome === "visited"
                ? "Qualifié"
                : null,
        next =
          outcome === "absent"
            ? "Repasser ou appeler"
            : outcome === "callback"
              ? "Programmer la relance"
              : outcome === "visited"
                ? "Obtenir le décideur et proposer un RDV"
                : outcome === "not_found"
                  ? "Vérifier l’adresse"
                  : outcome === "closed"
                    ? "Reprogrammer le passage"
                    : outcome === "not_interested"
                      ? "Aucune relance"
                      : "À planifier";
      await sql`update prospects set last_field_visit_at=now(),field_visit_count=field_visit_count+1,status=coalesce(${status},status),next_action=${next},updated_at=now() where id=${id}`;
      await sql`insert into prospect_events(prospect_id,event_type,payload) values(${id},'field_visit',${sql.json({ outcome, note, visitId: visit[0].id })})`;
      return visit;
    });
    return rows.length
      ? NextResponse.json({ ok: true }, { headers: noStore })
      : NextResponse.json(
          { error: "not_found" },
          { status: 404, headers: noStore },
        );
  } catch {
    return NextResponse.json(
      { error: "visit_not_saved" },
      { status: 503, headers: noStore },
    );
  }
}

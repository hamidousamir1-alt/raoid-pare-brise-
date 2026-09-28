import { NextRequest, NextResponse } from "next/server";
import { authConfigured, sessionValid } from "../../../../lib/auth";
import { databaseConfigured, db } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  if (!databaseConfigured())
    return NextResponse.json(
      { error: "database_not_configured" },
      { status: 503 },
    );
  if (!authConfigured() || !(await sessionValid()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const companies = Array.isArray(body.companies)
      ? body.companies.slice(0, 40)
      : [];
    if (!companies.length)
      return NextResponse.json({ error: "empty_selection" }, { status: 400 });
    const result = await db().begin(async (sql) => {
      const ids: string[] = [];
      let created = 0;
      let existing = 0;
      for (const company of companies) {
        const name = String(company.name || "").trim();
        const siret = String(company.siret || "").replace(/\D/g, "");
        if (!name || siret.length !== 14) continue;
        const duplicate =
          await sql`select id from prospects where siret=${siret} and deleted_at is null limit 1`;
        if (duplicate[0]) {
          await sql`update prospects set planned_route_date=current_date,updated_at=now() where id=${duplicate[0].id}`;
          ids.push(duplicate[0].id);
          existing++;
          continue;
        }
        const latitude = Number(company.latitude);
        const longitude = Number(company.longitude);
        const rows =
          await sql`insert into prospects(name,sector,zone,address,postal_code,city,siret,company_size,contact_name,contact_role,latitude,longitude,lead_source,status,score,notes,next_action,data_verified_at,planned_route_date) values(${name},${String(company.sector || "")},${String(company.city || "")},${String(company.address || "")},${String(company.postalCode || "")},${String(company.city || "")},${siret},${String(company.companySize || "À qualifier")},${String(company.manager || "")},${String(company.managerRole || "")},${Number.isFinite(latitude) ? latitude : null},${Number.isFinite(longitude) ? longitude : null},'Recherche entreprises','Nouveau',${Math.max(0, Math.min(100, Number(company.fleetPotential) || 50))},${`Source publique vérifiée. Potentiel flotte estimé : ${Number(company.fleetPotential) || 50}/100. Coordonnées et accessibilité à confirmer.`},'Passage terrain planifié aujourd’hui',now(),current_date) returning id`;
        await sql`insert into prospect_events(prospect_id,event_type,payload) values(${rows[0].id},'added_to_route',${sql.json({ source: "Recherche entreprises", date: new Date().toISOString().slice(0, 10) })})`;
        ids.push(rows[0].id);
        created++;
      }
      return { ids, created, existing, planned: ids.length };
    });
    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "route_creation_failed" },
      { status: 503 },
    );
  }
}

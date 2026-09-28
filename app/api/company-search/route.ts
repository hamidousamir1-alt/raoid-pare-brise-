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
      { status: 503 },
    );
  if (!authConfigured() || !(await sessionValid()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}
const fleetScore = (code = "", employees = "") => {
  const section = code.slice(0, 2);
  const high = [
    "49",
    "43",
    "41",
    "42",
    "81",
    "37",
    "38",
    "39",
    "53",
    "77",
  ].includes(section);
  const medium = ["46", "47", "33", "25", "10", "96"].includes(section);
  const size = Number.parseInt(employees, 10);
  return Math.min(
    95,
    (high ? 78 : medium ? 64 : 48) +
      (Number.isFinite(size) && size >= 11 ? 10 : 0),
  );
};
export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const postal = (req.nextUrl.searchParams.get("postalCode") || "")
    .replace(/\D/g, "")
    .slice(0, 5);
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || 1));
  if (q.length < 2 && postal.length !== 5)
    return NextResponse.json({ error: "search_required" }, { status: 400 });
  const url = new URL("https://recherche-entreprises.api.gouv.fr/search");
  if (q) url.searchParams.set("q", q);
  if (postal) url.searchParams.set("code_postal", postal);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", "20");
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Rapid-Pare-Brise-CRM/1.0" },
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error();
    const payload = await response.json();
    const sirets = (payload.results || [])
      .map((company: any) => company.siege?.siret)
      .filter(Boolean);
    const existing = sirets.length
      ? await db()`select id,siret from prospects where siret in ${db()(sirets)} and deleted_at is null`
      : [];
    const items = (payload.results || []).map((company: any) => {
      const matching = (company.matching_etablissements || []).find(
        (place: any) =>
          place.etat_administratif === "A" &&
          (!postal || place.code_postal === postal),
      );
      const place = matching || company.siege || {};
      const code =
        place.activite_principale || company.activite_principale || "";
      const score = fleetScore(
        code,
        place.tranche_effectif_salarie ||
          company.tranche_effectif_salarie ||
          "",
      );
      return {
        name: company.nom_complet || company.nom_raison_sociale,
        siren: company.siren,
        siret: place.siret || company.siege?.siret,
        address: place.adresse || "",
        postalCode: place.code_postal || "",
        city: place.libelle_commune || "",
        latitude: Number(place.latitude) || null,
        longitude: Number(place.longitude) || null,
        sector: company.libelle_activite_principale || `Activité NAF ${code}`,
        naf: code,
        companySize: company.categorie_entreprise || "À qualifier",
        employeeBand:
          place.tranche_effectif_salarie ||
          company.tranche_effectif_salarie ||
          "",
        manager: [
          company.dirigeants?.[0]?.prenoms,
          company.dirigeants?.[0]?.nom,
        ]
          .filter(Boolean)
          .join(" "),
        managerRole: company.dirigeants?.[0]?.qualite || "",
        fleetPotential: score,
        existingId:
          (existing as any[]).find(
            (item) => item.siret === (place.siret || company.siege?.siret),
          )?.id || null,
        source: "Annuaire des Entreprises / INSEE",
        verifiedAt: new Date().toISOString(),
      };
    });
    return NextResponse.json(
      {
        items,
        total: payload.total_results || items.length,
        page: payload.page || page,
        pages: payload.total_pages || 1,
      },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json(
      { error: "source_unavailable" },
      { status: 503, headers: noStore },
    );
  }
}
export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const x = await req.json(),
      name = String(x.name || "").trim(),
      siret = String(x.siret || "").replace(/\D/g, "");
    if (!name || siret.length !== 14)
      return NextResponse.json({ error: "invalid_company" }, { status: 400 });
    const duplicate =
      await db()`select id from prospects where siret=${siret} and deleted_at is null limit 1`;
    if (duplicate[0])
      return NextResponse.json(
        { error: "duplicate", existingId: duplicate[0].id },
        { status: 409 },
      );
    const created = await db().begin(async (sql) => {
      const rows =
        await sql`insert into prospects(name,sector,zone,address,postal_code,city,siret,company_size,contact_name,contact_role,latitude,longitude,lead_source,status,score,notes,next_action,data_verified_at) values(${name},${String(x.sector || "")},${String(x.zone || x.city || "")},${String(x.address || "")},${String(x.postalCode || "")},${String(x.city || "")},${siret},${String(x.companySize || "À qualifier")},${String(x.manager || "")},${String(x.managerRole || "")},${Number.isFinite(Number(x.latitude)) ? Number(x.latitude) : null},${Number.isFinite(Number(x.longitude)) ? Number(x.longitude) : null},'Recherche entreprises','Nouveau',${Math.max(0, Math.min(100, Number(x.fleetPotential) || 50))},${`Source publique vérifiée. Potentiel flotte estimé : ${Number(x.fleetPotential) || 50}/100. Téléphone, e-mail et accessibilité à confirmer.`},'Qualifier par téléphone ou passage terrain',now()) returning id`;
      await sql`insert into prospect_events(prospect_id,event_type,payload) values(${rows[0].id},'enriched_from_public_data',${sql.json({ source: "Annuaire des Entreprises / INSEE", siret })})`;
      return rows[0];
    });
    return NextResponse.json({ item: created }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "creation_failed" }, { status: 503 });
  }
}

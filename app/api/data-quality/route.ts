import { NextRequest, NextResponse } from "next/server";
import { authConfigured, sessionValid } from "../../../lib/auth";
import { databaseConfigured, db } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" },
  UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const normalize = (value: unknown) =>
  String(value || "")
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(sas|sarl|eurl|sa|ets|etablissement|societe)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
const phone = (value: unknown) =>
  String(value || "")
    .replace(/\D/g, "")
    .slice(-9);

type Prospect = Record<string, any> & { id: string; name: string };

function duplicateScore(a: Prospect, b: Prospect) {
  const reasons: string[] = [];
  let score = 0;
  if (a.siret && b.siret && normalize(a.siret) === normalize(b.siret)) {
    score = 100;
    reasons.push("Même SIRET");
  }
  if (a.email && b.email && normalize(a.email) === normalize(b.email)) {
    score = Math.max(score, 92);
    reasons.push("Même e-mail");
  }
  if (phone(a.phone) && phone(a.phone) === phone(b.phone)) {
    score = Math.max(score, 88);
    reasons.push("Même téléphone");
  }
  if (normalize(a.name) && normalize(a.name) === normalize(b.name)) {
    score = Math.max(score, 76);
    reasons.push("Même nom normalisé");
    if (normalize(a.address) && normalize(a.address) === normalize(b.address)) {
      score = Math.max(score, 95);
      reasons.push("Même adresse");
    } else if (a.postalCode && a.postalCode === b.postalCode) {
      score = Math.max(score, 84);
      reasons.push("Même code postal");
    }
  }
  return { score, reasons };
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  try {
    const prospects =
      (await db()`select id,name,sector,address,postal_code as "postalCode",city,phone,email,siret,status,score,data_quality_score as "dataQualityScore",fleet_count as "fleetCount",fleet_confidence as "fleetConfidence",next_action as "next",updated_at as "updatedAt",data_verified_at as "dataVerifiedAt" from prospects where deleted_at is null order by updated_at desc`) as Prospect[];
    const duplicates: Array<{
      first: Prospect;
      second: Prospect;
      score: number;
      reasons: string[];
    }> = [];
    for (let first = 0; first < prospects.length; first++)
      for (let second = first + 1; second < prospects.length; second++) {
        const match = duplicateScore(prospects[first], prospects[second]);
        if (match.score >= 76)
          duplicates.push({
            first: prospects[first],
            second: prospects[second],
            ...match,
          });
      }
    duplicates.sort((a, b) => b.score - a.score);
    const now = Date.now(),
      issues = prospects
        .map((prospect): Prospect & { reasons: string[]; age: number } => {
          const reasons: string[] = [];
          if ((prospect.dataQualityScore || 0) < 70)
            reasons.push(
              `Dossier complet à ${prospect.dataQualityScore || 0} %`,
            );
          if (!prospect.next && !["Gagné", "Perdu"].includes(prospect.status))
            reasons.push("Prochaine action manquante");
          if (prospect.email && !/^\S+@\S+\.\S+$/.test(prospect.email))
            reasons.push("E-mail invalide");
          if (!prospect.fleetCount || prospect.fleetConfidence === "À vérifier")
            reasons.push("Flotte à confirmer");
          const age =
            (now -
              new Date(
                prospect.dataVerifiedAt || prospect.updatedAt,
              ).getTime()) /
            86400000;
          if (age > 90)
            reasons.push(
              `Données non vérifiées depuis ${Math.floor(age)} jours`,
            );
          return { ...prospect, reasons, age: Math.floor(age) };
        })
        .filter((prospect) => prospect.reasons.length)
        .sort(
          (a, b) =>
            b.reasons.length - a.reasons.length ||
            (a.dataQualityScore || 0) - (b.dataQualityScore || 0),
        );
    return NextResponse.json(
      {
        duplicates,
        issues,
        stats: {
          total: prospects.length,
          possibleDuplicates: duplicates.length,
          incomplete: prospects.filter((p) => (p.dataQualityScore || 0) < 70)
            .length,
          stale: issues.filter((p) => p.age > 90).length,
        },
      },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json(
      { error: "data_quality_unavailable" },
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
    if (x.action === "verify") {
      const id = String(x.prospectId || "");
      if (!UUID.test(id))
        return NextResponse.json(
          { error: "invalid_id" },
          { status: 400, headers: noStore },
        );
      const rows =
        await db()`update prospects set data_verified_at=now(),updated_at=now() where id=${id} and deleted_at is null returning id`;
      if (rows.length)
        await db()`insert into prospect_events(prospect_id,event_type,payload) values(${id},'data_verified',${db().json({ source: "manual_review" })})`;
      return rows.length
        ? NextResponse.json({ ok: true }, { headers: noStore })
        : NextResponse.json(
            { error: "not_found" },
            { status: 404, headers: noStore },
          );
    }
    if (x.action !== "merge")
      return NextResponse.json(
        { error: "unknown_action" },
        { status: 400, headers: noStore },
      );
    const masterId = String(x.masterId || ""),
      duplicateId = String(x.duplicateId || "");
    if (
      !UUID.test(masterId) ||
      !UUID.test(duplicateId) ||
      masterId === duplicateId
    )
      return NextResponse.json(
        { error: "invalid_merge" },
        { status: 400, headers: noStore },
      );
    const merged = await db().begin(async (sql) => {
      const rows =
        await sql`select * from prospects where id in (${masterId},${duplicateId}) and deleted_at is null for update`;
      const master = rows.find((row: any) => row.id === masterId),
        duplicate = rows.find((row: any) => row.id === duplicateId);
      if (!master || !duplicate) return false;
      await sql`insert into prospect_merges(master_prospect_id,merged_prospect_id,master_snapshot,merged_snapshot) values(${masterId},${duplicateId},${sql.json(master)},${sql.json(duplicate)})`;
      await sql`update prospects set sector=coalesce(nullif(sector,''),${duplicate.sector}),zone=coalesce(nullif(zone,''),${duplicate.zone}),address=coalesce(nullif(address,''),${duplicate.address}),postal_code=coalesce(nullif(postal_code,''),${duplicate.postal_code}),city=coalesce(nullif(city,''),${duplicate.city}),phone=coalesce(nullif(phone,''),${duplicate.phone}),email=coalesce(nullif(email,''),${duplicate.email}),website=coalesce(nullif(website,''),${duplicate.website}),siret=coalesce(nullif(siret,''),${duplicate.siret}),fleet_count=coalesce(fleet_count,${duplicate.fleet_count}),fleet=coalesce(nullif(fleet,''),${duplicate.fleet}),fleet_types=coalesce(nullif(fleet_types,''),${duplicate.fleet_types}),contact_name=coalesce(nullif(contact_name,''),${duplicate.contact_name}),contact_role=coalesce(nullif(contact_role,''),${duplicate.contact_role}),notes=case when coalesce(notes,'')='' then ${duplicate.notes} when coalesce(${duplicate.notes},'')='' or notes=${duplicate.notes} then notes else notes||E'\n\nInformations fusionnées : '||${duplicate.notes} end,do_not_contact=do_not_contact or ${Boolean(duplicate.do_not_contact)},score=greatest(score,${Number(duplicate.score || 0)}),potential_revenue=greatest(potential_revenue,${Number(duplicate.potential_revenue || 0)}),signed_revenue=greatest(signed_revenue,${Number(duplicate.signed_revenue || 0)}),generated_revenue=greatest(generated_revenue,${Number(duplicate.generated_revenue || 0)}),data_quality_score=greatest(data_quality_score,${Number(duplicate.data_quality_score || 0)}),updated_at=now() where id=${masterId}`;
      const masterActive =
        await sql`select id from email_enrollments where prospect_id=${masterId} and status='active' limit 1`;
      if (masterActive.length)
        await sql`update email_enrollments set status='cancelled',stop_reason='duplicate_merged',updated_at=now() where prospect_id=${duplicateId} and status='active'`;
      await sql`update prospect_contacts set prospect_id=${masterId},updated_at=now() where prospect_id=${duplicateId}`;
      await sql`update documents set prospect_id=${masterId},updated_at=now() where prospect_id=${duplicateId}`;
      await sql`update email_enrollments set prospect_id=${masterId},updated_at=now() where prospect_id=${duplicateId}`;
      await sql`update email_messages set prospect_id=${masterId},updated_at=now() where prospect_id=${duplicateId}`;
      await sql`update field_visits set prospect_id=${masterId} where prospect_id=${duplicateId}`;
      await sql`update sales_tasks set prospect_id=${masterId},updated_at=now() where prospect_id=${duplicateId}`;
      await sql`update appointments set prospect_id=${masterId},updated_at=now() where prospect_id=${duplicateId}`;
      await sql`update prospect_events set prospect_id=${masterId} where prospect_id=${duplicateId}`;
      await sql`update prospects set deleted_at=now(),merged_into_id=${masterId},updated_at=now() where id=${duplicateId}`;
      await sql`insert into prospect_events(prospect_id,event_type,payload) values(${masterId},'prospects_merged',${sql.json({ mergedProspectId: duplicateId, mergedName: duplicate.name })})`;
      return true;
    });
    return merged
      ? NextResponse.json({ ok: true }, { headers: noStore })
      : NextResponse.json(
          { error: "not_found" },
          { status: 404, headers: noStore },
        );
  } catch {
    return NextResponse.json(
      { error: "merge_failed" },
      { status: 503, headers: noStore },
    );
  }
}

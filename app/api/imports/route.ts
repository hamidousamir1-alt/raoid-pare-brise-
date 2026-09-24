import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { Readable } from "stream";
import { authConfigured, sessionValid } from "../../../lib/auth";
import { databaseConfigured, db } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const fields = [
  "name",
  "sector",
  "address",
  "postalCode",
  "city",
  "phone",
  "email",
  "website",
  "siret",
  "contactName",
  "contactRole",
  "fleetCount",
  "notes",
  "zone",
  "companySize",
  "verificationStatus",
  "verificationConfidence",
  "officialName",
  "officialAddress",
  "officialActivity",
  "naf",
  "employeeBand",
  "siren",
  "activeEstablishment",
  "duplicateStatus",
  "recommendedAction",
  "source",
  "latitude",
  "longitude",
] as const;
type Field = (typeof fields)[number];
type Row = Partial<Record<Field, string>> & {
  sourceRow?: number;
  duplicateId?: string;
  duplicateName?: string;
};
const aliases: Record<Field, string[]> = {
  name: [
    "entreprise",
    "societe",
    "société",
    "raison sociale",
    "nom",
    "company",
  ],
  sector: ["secteur", "activite", "activité", "naf"],
  address: ["adresse", "address", "rue"],
  postalCode: ["code postal", "cp", "postal", "postal code"],
  city: ["ville", "commune", "city"],
  phone: ["telephone", "téléphone", "tel", "portable", "phone"],
  email: ["email", "e-mail", "mail", "courriel"],
  website: ["site", "site web", "website", "url"],
  siret: ["siret"],
  contactName: ["contact", "nom contact", "interlocuteur"],
  contactRole: ["fonction", "poste", "role", "rôle"],
  fleetCount: ["flotte", "vehicules", "véhicules", "nombre véhicules"],
  notes: ["notes", "commentaire", "commentaires"],
  zone: ["zone", "quartier", "secteur geographique"],
  companySize: ["taille entreprise", "companysize"],
  verificationStatus: ["statut de verification", "verificationstatus"],
  verificationConfidence: ["confiance verification", "verificationconfidence"],
  officialName: ["raison sociale officielle", "officialname"],
  officialAddress: ["adresse officielle", "officialaddress"],
  officialActivity: ["activite officielle", "officialactivity"],
  naf: ["code naf", "naf"],
  employeeBand: ["tranche effectif", "employeeband"],
  siren: ["siren"],
  activeEstablishment: ["etablissement actif", "activeestablishment"],
  duplicateStatus: ["statut doublon", "duplicatestatus"],
  recommendedAction: ["action recommandee", "recommendedaction"],
  source: ["source", "data source"],
  latitude: ["latitude"],
  longitude: ["longitude"],
};
const clean = (value: unknown) => String(value ?? "").trim();
const cellText = (value: ExcelJS.CellValue) => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value) return String(value.text);
    if ("result" in value) return clean(value.result);
    if ("richText" in value)
      return value.richText.map((part) => part.text).join("");
  }
  return clean(value);
};
const norm = (value: unknown) =>
  clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
function mapping(headers: string[]) {
  const result: Record<string, Field> = {};
  for (const header of headers) {
    const n = norm(header);
    const exact = fields.find((field) => norm(field) === n);
    const target =
      exact ||
      fields.find((field) =>
        aliases[field].some((alias) => norm(alias) === n),
      ) ||
      fields.find((field) =>
        aliases[field].some((alias) => n.includes(norm(alias))),
      );
    if (target && !Object.values(result).includes(target))
      result[header] = target;
  }
  return result;
}
function normalizeRow(
  raw: Record<string, unknown>,
  map: Record<string, Field>,
  index: number,
): Row {
  const row: Row = { sourceRow: index + 2 };
  Object.entries(map).forEach(([source, target]) => {
    row[target] = clean(raw[source]);
  });
  if (row.email) row.email = row.email.toLowerCase();
  if (row.phone) row.phone = row.phone.replace(/\s+/g, " ");
  if (row.siret) row.siret = row.siret.replace(/\D/g, "");
  return row;
}
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
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const batches =
    await db()`select id,file_name as "fileName",status,created_count as "createdCount",updated_count as "updatedCount",skipped_count as "skippedCount",created_at as "createdAt",rolled_back_at as "rolledBackAt" from import_batches order by created_at desc limit 20`;
  return NextResponse.json({ batches }, { headers: noStore });
}
export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size > 8 * 1024 * 1024)
        return NextResponse.json({ error: "invalid_file" }, { status: 400 });
      const workbook = new ExcelJS.Workbook();
      const content = Buffer.from(await file.arrayBuffer());
      if (file.name.toLowerCase().endsWith(".csv"))
        await workbook.csv.read(Readable.from(content));
      else
        await workbook.xlsx.load(
          content as unknown as Parameters<typeof workbook.xlsx.load>[0],
        );
      const sheet = workbook.worksheets[0];
      if (!sheet)
        return NextResponse.json({ error: "empty_file" }, { status: 400 });
      const headers = (sheet.getRow(1).values as ExcelJS.CellValue[])
        .slice(1)
        .map(cellText);
      const raw: Record<string, unknown>[] = [];
      sheet.eachRow((excelRow, rowNumber) => {
        if (rowNumber === 1 || raw.length >= 2000) return;
        const item: Record<string, unknown> = {};
        headers.forEach((header, index) => {
          item[header] = cellText(excelRow.getCell(index + 1).value);
        });
        if (Object.values(item).some(Boolean)) raw.push(item);
      });
      if (!raw.length)
        return NextResponse.json({ error: "empty_file" }, { status: 400 });
      const autoMap = mapping(headers);
      const existing =
        await db()`select id,name,email,phone,siret,address from prospects where deleted_at is null`;
      const rows = raw.slice(0, 2000).map((item, index) => {
        const row = normalizeRow(item, autoMap, index);
        const duplicate = existing.find(
          (p: any) =>
            (row.siret && norm(p.siret) === norm(row.siret)) ||
            (row.email && norm(p.email) === norm(row.email)) ||
            (row.phone && norm(p.phone) === norm(row.phone)) ||
            (row.name &&
              row.address &&
              norm(p.name) === norm(row.name) &&
              norm(p.address) === norm(row.address)),
        );
        if (duplicate) {
          row.duplicateId = duplicate.id;
          row.duplicateName = duplicate.name;
        }
        return row;
      });
      return NextResponse.json(
        {
          fileName: file.name,
          headers,
          mapping: autoMap,
          rawRows: raw.slice(0, 2000),
          rows,
          stats: {
            total: rows.length,
            valid: rows.filter((r) => r.name).length,
            duplicates: rows.filter((r) => r.duplicateId).length,
            invalid: rows.filter((r) => !r.name).length,
          },
        },
        { headers: noStore },
      );
    }
    const body = await req.json();
    if (body.action === "rollback") {
      const batchId = String(body.batchId || "");
      await db().begin(async (sql) => {
        const batch =
          await sql`select status from import_batches where id=${batchId} for update`;
        if (!batch[0] || batch[0].status !== "completed")
          throw new Error("invalid_batch");
        const rows =
          await sql`select prospect_id as "prospectId",operation,before_data as "beforeData" from import_batch_rows where batch_id=${batchId} order by created_at desc`;
        for (const row of rows as any[]) {
          if (row.operation === "created")
            await sql`update prospects set deleted_at=now(),updated_at=now() where id=${row.prospectId}`;
          else if (row.beforeData)
            await sql`update prospects set name=${row.beforeData.name},sector=${row.beforeData.sector},zone=${row.beforeData.zone},address=${row.beforeData.address},postal_code=${row.beforeData.postal_code},city=${row.beforeData.city},phone=${row.beforeData.phone},email=${row.beforeData.email},website=${row.beforeData.website},siret=${row.beforeData.siret},siren=${row.beforeData.siren},company_size=${row.beforeData.company_size},naf_code=${row.beforeData.naf_code},official_name=${row.beforeData.official_name},official_address=${row.beforeData.official_address},official_activity=${row.beforeData.official_activity},employee_band=${row.beforeData.employee_band},establishment_active=${row.beforeData.establishment_active},verification_status=${row.beforeData.verification_status},verification_confidence=${row.beforeData.verification_confidence},duplicate_status=${row.beforeData.duplicate_status},recommended_action=${row.beforeData.recommended_action},data_source=${row.beforeData.data_source},notes=${row.beforeData.notes},updated_at=now() where id=${row.prospectId}`;
        }
        await sql`update import_batches set status='rolled_back',rolled_back_at=now() where id=${batchId}`;
      });
      return NextResponse.json({ ok: true });
    }
    if (body.action !== "commit" || !Array.isArray(body.rows))
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    const rows = (body.rows as Row[]).slice(0, 2000),
      mode = body.duplicateMode === "update" ? "update" : "skip",
      fileName = clean(body.fileName || "Import");
    const result = await db().begin(async (sql) => {
      const batch =
        await sql`insert into import_batches(file_name) values(${fileName}) returning id`;
      let created = 0,
        updated = 0,
        skipped = 0;
      for (const source of rows) {
        const name = clean(source.name);
        if (!name) {
          skipped++;
          continue;
        }
        if (source.duplicateId) {
          if (mode === "skip") {
            skipped++;
            continue;
          }
          const before =
            await sql`select * from prospects where id=${source.duplicateId} and deleted_at is null`;
          if (!before[0]) {
            skipped++;
            continue;
          }
          await sql`update prospects set sector=coalesce(nullif(${clean(source.sector)},''),sector),zone=coalesce(nullif(${clean(source.zone)},''),zone),address=coalesce(nullif(${clean(source.address)},''),address),postal_code=coalesce(nullif(${clean(source.postalCode)},''),postal_code),city=coalesce(nullif(${clean(source.city)},''),city),phone=coalesce(nullif(${clean(source.phone)},''),phone),email=coalesce(nullif(${clean(source.email).toLowerCase()},''),email),website=coalesce(nullif(${clean(source.website)},''),website),siret=coalesce(nullif(${clean(source.siret)},''),siret),siren=coalesce(nullif(${clean(source.siren)},''),siren),company_size=coalesce(nullif(${clean(source.companySize)},''),company_size),naf_code=coalesce(nullif(${clean(source.naf)},''),naf_code),official_name=coalesce(nullif(${clean(source.officialName)},''),official_name),official_address=coalesce(nullif(${clean(source.officialAddress)},''),official_address),official_activity=coalesce(nullif(${clean(source.officialActivity)},''),official_activity),employee_band=coalesce(nullif(${clean(source.employeeBand)},''),employee_band),verification_status=coalesce(nullif(${clean(source.verificationStatus)},''),verification_status),verification_confidence=greatest(verification_confidence,${Math.min(100, Math.max(0, Number(source.verificationConfidence) || 0))}),duplicate_status=coalesce(nullif(${clean(source.duplicateStatus)},''),duplicate_status),recommended_action=coalesce(nullif(${clean(source.recommendedAction)},''),recommended_action),data_source=coalesce(nullif(${clean(source.source)},''),data_source),notes=concat_ws(E'\n',nullif(notes,''),nullif(${clean(source.notes)},'')),updated_at=now() where id=${source.duplicateId}`;
          await sql`insert into import_batch_rows(batch_id,prospect_id,operation,before_data) values(${batch[0].id},${source.duplicateId},'updated',${sql.json(before[0])})`;
          updated++;
          continue;
        }
        const fleet = Number.parseInt(clean(source.fleetCount), 10);
        const confidence = Math.min(
            100,
            Math.max(0, Number(source.verificationConfidence) || 0),
          ),
          latitude = Number(source.latitude),
          longitude = Number(source.longitude),
          verification = clean(source.verificationStatus) || "À vérifier",
          nextAction =
            clean(source.recommendedAction) || "Qualifier et contacter";
        const inserted =
          await sql`insert into prospects(name,sector,zone,address,postal_code,city,phone,email,website,siret,siren,contact_name,contact_role,fleet_count,company_size,naf_code,official_name,official_address,official_activity,employee_band,establishment_active,verification_status,verification_confidence,duplicate_status,recommended_action,data_source,latitude,longitude,notes,lead_source,status,next_action) values(${name},${clean(source.sector)},${clean(source.zone)},${clean(source.address)},${clean(source.postalCode)},${clean(source.city)},${clean(source.phone)},${clean(source.email).toLowerCase() || null},${clean(source.website)},${clean(source.siret)},${clean(source.siren)},${clean(source.contactName)},${clean(source.contactRole)},${Number.isFinite(fleet) ? fleet : null},${clean(source.companySize) || "À qualifier"},${clean(source.naf)},${clean(source.officialName)},${clean(source.officialAddress)},${clean(source.officialActivity)},${clean(source.employeeBand)},${clean(source.activeEstablishment).toLowerCase() === "oui" ? true : clean(source.activeEstablishment).toLowerCase() === "non" ? false : null},${verification},${confidence},${clean(source.duplicateStatus) || "Unique"},${nextAction},${clean(source.source) || "Import fichier"},${Number.isFinite(latitude) ? latitude : null},${Number.isFinite(longitude) ? longitude : null},${clean(source.notes)},'Import enrichi','Nouveau',${nextAction}) returning id`;
        await sql`insert into prospect_events(prospect_id,event_type,payload) values(${inserted[0].id},'imported',${sql.json({ batchId: batch[0].id, fileName })})`;
        await sql`insert into import_batch_rows(batch_id,prospect_id,operation) values(${batch[0].id},${inserted[0].id},'created')`;
        created++;
      }
      await sql`update import_batches set created_count=${created},updated_count=${updated},skipped_count=${skipped} where id=${batch[0].id}`;
      return { batchId: batch[0].id, created, updated, skipped };
    });
    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "import_failed" },
      { status: 503, headers: noStore },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured, db } from "../../../lib/db";
import { authConfigured, sessionValid } from "../../../lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const h = { "Cache-Control": "no-store" },
  UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  allowed = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ]);
async function guard() {
  if (!databaseConfigured())
    return NextResponse.json(
      { error: "database_not_configured" },
      { status: 503, headers: h },
    );
  if (!authConfigured())
    return NextResponse.json(
      { error: "secure_access_not_configured" },
      { status: 503, headers: h },
    );
  if (!(await sessionValid()))
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: h },
    );
  return null;
}
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  try {
    const items =
      await db()`select id,name,file_name as "fileName",mime_type as "mimeType",size_bytes as "sizeBytes",category,created_at as "createdAt" from documents where deleted_at is null order by created_at desc`;
    return NextResponse.json({ items }, { headers: h });
  } catch {
    return NextResponse.json(
      { error: "documents_storage_unavailable" },
      { status: 503, headers: h },
    );
  }
}
export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: h },
    );
  }
  const file = form.get("file"),
    name = String(form.get("name") || "").trim(),
    category = String(form.get("category") || "Autre").trim(),
    prospectId = String(form.get("prospectId") || "").trim();
  if (
    !(file instanceof File) ||
    !name ||
    file.size < 1 ||
    file.size > 10485760 ||
    !allowed.has(file.type) ||
    (prospectId && !UUID.test(prospectId))
  )
    return NextResponse.json(
      { error: "invalid_document" },
      { status: 400, headers: h },
    );
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const rows =
      await db()`insert into documents(name,file_name,mime_type,size_bytes,category,content,prospect_id) values(${name},${file.name},${file.type},${file.size},${category},${bytes},${prospectId || null}) returning id,name,file_name as "fileName",mime_type as "mimeType",size_bytes as "sizeBytes",category,created_at as "createdAt"`;
    if (prospectId)
      await db()`insert into prospect_events(prospect_id,event_type,payload) values(${prospectId},'document_linked',${db().json({ documentId: rows[0].id, name, category })})`;
    return NextResponse.json({ item: rows[0] }, { status: 201, headers: h });
  } catch {
    return NextResponse.json(
      { error: "documents_storage_unavailable" },
      { status: 503, headers: h },
    );
  }
}

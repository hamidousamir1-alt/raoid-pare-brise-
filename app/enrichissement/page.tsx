"use client";
import { useEffect, useMemo, useState } from "react";

const targets = [
  ["", "Ignorer"],
  ["name", "Entreprise *"],
  ["sector", "Activité"],
  ["address", "Adresse"],
  ["postalCode", "Code postal"],
  ["city", "Ville"],
  ["phone", "Téléphone"],
  ["email", "E-mail"],
  ["website", "Site web"],
  ["siret", "SIRET"],
  ["contactName", "Contact"],
  ["contactRole", "Fonction"],
  ["fleetCount", "Nombre de véhicules"],
  ["notes", "Notes"],
  ["zone", "Zone"],
  ["companySize", "Taille d’entreprise"],
  ["verificationStatus", "Statut de vérification"],
  ["verificationConfidence", "Confiance de vérification"],
  ["officialName", "Raison sociale officielle"],
  ["officialAddress", "Adresse officielle"],
  ["officialActivity", "Activité officielle"],
  ["naf", "Code NAF"],
  ["employeeBand", "Tranche d’effectif"],
  ["siren", "SIREN"],
  ["activeEstablishment", "Établissement actif"],
  ["duplicateStatus", "Statut doublon"],
  ["recommendedAction", "Action recommandée"],
  ["source", "Source"],
  ["latitude", "Latitude"],
  ["longitude", "Longitude"],
] as const;
type ImportRow = Record<string, string | number | undefined> & {
  duplicateId?: string;
  duplicateName?: string;
};
type Preview = {
  fileName: string;
  headers: string[];
  mapping: Record<string, string>;
  rawRows: Record<string, unknown>[];
  rows: ImportRow[];
  stats: { total: number; valid: number; duplicates: number; invalid: number };
};
type Batch = {
  id: string;
  fileName: string;
  status: string;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  createdAt: string;
};
type Company = {
  name: string;
  siret: string;
  address: string;
  postalCode: string;
  city: string;
  sector: string;
  companySize: string;
  manager: string;
  managerRole: string;
  fleetPotential: number;
  latitude?: number;
  longitude?: number;
  existingId?: string | null;
  source: string;
};
const clean = (v: unknown) => String(v ?? "").trim();
function mappedRows(preview: Preview, map: Record<string, string>) {
  return preview.rawRows.map((raw, index) => {
    const row: ImportRow = { sourceRow: index + 2 };
    Object.entries(map).forEach(([source, target]) => {
      if (target) row[target] = clean(raw[source]);
    });
    const original = preview.rows[index];
    if (original?.duplicateId) {
      row.duplicateId = original.duplicateId;
      row.duplicateName = original.duplicateName;
    }
    return row;
  });
}
export default function EnrichmentPage() {
  const [tab, setTab] = useState<"search" | "import">("search"),
    [preview, setPreview] = useState<Preview | null>(null),
    [map, setMap] = useState<Record<string, string>>({}),
    [file, setFile] = useState<File | null>(null),
    [duplicateMode, setDuplicateMode] = useState("skip"),
    [confidenceMode, setConfidenceMode] = useState("safe"),
    [batches, setBatches] = useState<Batch[]>([]),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState("");
  const [q, setQ] = useState(""),
    [postal, setPostal] = useState("13014"),
    [companies, setCompanies] = useState<Company[]>([]),
    [searchInfo, setSearchInfo] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  async function loadBatches() {
    const r = await fetch("/api/imports", { cache: "no-store" });
    if (r.ok) setBatches((await r.json()).batches || []);
  }
  useEffect(() => {
    loadBatches().catch(() => {});
  }, []);
  const rows = useMemo(
    () => (preview ? mappedRows(preview, map) : []),
    [preview, map],
  );
  const safeRowsCount = useMemo(
    () =>
      rows.filter((row) => {
        const status = clean(row.verificationStatus).toLowerCase();
        const duplicate = clean(row.duplicateStatus).toLowerCase();
        return (
          Boolean(clean(row.name)) &&
          (status === "vérifiée" ||
            status === "verifiee" ||
            status === "probable") &&
          !duplicate.includes("doublon")
        );
      }).length,
    [rows],
  );
  async function inspect() {
    if (!file) return;
    setBusy("preview");
    setMessage("");
    const form = new FormData();
    form.append("file", file);
    const r = await fetch("/api/imports", { method: "POST", body: form });
    const data = await r.json();
    setBusy("");
    if (!r.ok) {
      setMessage(
        "Fichier illisible. Utilisez un fichier .xlsx, .xls ou .csv de moins de 8 Mo.",
      );
      return;
    }
    setPreview(data);
    setMap(data.mapping);
    setMessage(
      `${data.stats.total} lignes analysées. Vérifiez les colonnes avant validation.`,
    );
  }
  async function commit() {
    if (!preview || !rows.some((row) => clean(row.name))) return;
    const importRows = rows.filter((row) => {
      if (!clean(row.name)) return false;
      if (confidenceMode === "all") return true;
      const status = clean(row.verificationStatus).toLowerCase();
      const duplicate = clean(row.duplicateStatus).toLowerCase();
      return (
        (status === "vérifiée" ||
          status === "verifiee" ||
          status === "probable") &&
        !duplicate.includes("doublon")
      );
    });
    setBusy("commit");
    const r = await fetch("/api/imports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "commit",
        fileName: preview.fileName,
        rows: importRows,
        duplicateMode,
      }),
    });
    const data = await r.json();
    setBusy("");
    if (!r.ok) {
      setMessage("L’import n’a pas pu être enregistré.");
      return;
    }
    setMessage(
      `Import terminé : ${data.created} créations, ${data.updated} mises à jour, ${data.skipped} lignes ignorées.`,
    );
    setPreview(null);
    setFile(null);
    loadBatches();
  }
  async function rollback(batch: Batch) {
    if (
      !confirm(
        `Annuler l’import « ${batch.fileName} » ? Les fiches créées seront archivées et les fiches complétées reviendront à leur état précédent.`,
      )
    )
      return;
    setBusy(batch.id);
    const r = await fetch("/api/imports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rollback", batchId: batch.id }),
    });
    setBusy("");
    if (r.ok) {
      setMessage("Import annulé sans suppression définitive.");
      loadBatches();
    } else setMessage("Impossible d’annuler cet import.");
  }
  async function search() {
    setBusy("search");
    setSearchInfo("");
    const params = new URLSearchParams({ q, postalCode: postal });
    const r = await fetch(`/api/company-search?${params}`, {
      cache: "no-store",
    });
    const data = await r.json();
    setBusy("");
    if (!r.ok) {
      setSearchInfo("La source publique est momentanément indisponible.");
      return;
    }
    setCompanies(data.items || []);
    setSelected([]);
    setSearchInfo(
      `${data.total || data.items.length} entreprises trouvées — données publiques INSEE.`,
    );
  }
  async function add(company: Company) {
    setBusy(company.siret);
    const r = await fetch("/api/company-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(company),
    });
    const data = await r.json();
    setBusy("");
    if (r.ok)
      setCompanies((old) =>
        old.map((item) =>
          item.siret === company.siret
            ? { ...item, existingId: data.item.id }
            : item,
        ),
      );
    else if (r.status === 409)
      setCompanies((old) =>
        old.map((item) =>
          item.siret === company.siret
            ? { ...item, existingId: data.existingId }
            : item,
        ),
      );
    else setSearchInfo("L’entreprise n’a pas pu être ajoutée.");
  }
  async function planSelection() {
    const chosen = companies.filter((company) =>
      selected.includes(company.siret),
    );
    if (!chosen.length) return;
    setBusy("plan");
    const response = await fetch("/api/company-search/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companies: chosen }),
    });
    const data = await response.json();
    setBusy("");
    if (!response.ok) {
      setSearchInfo("La tournée n’a pas pu être préparée.");
      return;
    }
    setSearchInfo(
      `${data.planned} entreprises ajoutées à la tournée du jour, dont ${data.created} nouvelles fiches.`,
    );
    setSelected([]);
  }
  return (
    <main className="workspace enrichPage">
      <style>{`.enrichPage{display:grid;gap:18px}.enrichHead{display:flex;justify-content:space-between;gap:18px;align-items:flex-end}.enrichHead h1{margin:4px 0 7px}.tabs{display:flex;gap:7px;padding:5px;background:#eef1f5;border-radius:12px}.tabs button{border:0;background:transparent}.tabs .active{background:#fff;box-shadow:0 3px 12px #13223a14}.panel,.stat{background:#fff;border:1px solid #e7eaf0;border-radius:16px;padding:20px}.searchForm{display:grid;grid-template-columns:1fr 150px auto;gap:9px}.searchForm input,.mapping select,.fileBox input{width:100%}.info{padding:12px 14px;background:#f4f7fa;border-radius:10px;color:#58667a;font-size:11px}.companyGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.companyCard{padding:17px;border:1px solid #e6eaf0;border-radius:14px;display:grid;gap:10px}.companyCard.selected{border-color:#d34848;box-shadow:0 0 0 2px #d3484818}.companyCard header{display:flex;justify-content:space-between;gap:12px}.companyCard h3{margin:0;font-size:16px}.selectCompany{display:flex;align-items:center;gap:8px;font-size:10px}.selectCompany input{width:17px;height:17px}.selectionBar{position:sticky;bottom:78px;z-index:5;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 18px;background:#111827;color:#fff;border-radius:14px;box-shadow:0 12px 35px #11182740}.selectionBar p{margin:0;font-size:11px}.selectionBar a{color:#fff}.companyMeta{color:#647187;font-size:10px;line-height:1.6}.score{min-width:62px;text-align:center}.score b{display:block;font-size:19px}.verified{color:#287348}.importTop{display:grid;grid-template-columns:1.2fr .8fr;gap:16px}.fileBox{border:1px dashed #ccd3dd;border-radius:14px;padding:20px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:14px 0}.stat{padding:13px}.stat small,.stat b{display:block}.stat b{font-size:21px;margin-top:5px}.mapping{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.mapping label{font-size:9px;color:#6e798b}.mapping span{display:block;margin-bottom:5px;overflow:hidden;text-overflow:ellipsis}.previewTable{overflow:auto;max-height:390px;margin-top:15px}.previewTable table{width:100%;border-collapse:collapse;font-size:9px}.previewTable th,.previewTable td{padding:9px;border-bottom:1px solid #edf0f4;text-align:left;white-space:nowrap}.duplicate{color:#b14a42}.actionsRow{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:14px}.historyLine{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid #edf0f4}.historyLine small{display:block;color:#778297;margin-top:4px}@media(max-width:850px){.enrichHead,.actionsRow{align-items:stretch;flex-direction:column}.tabs{width:100%}.tabs button{flex:1}.searchForm,.importTop,.companyGrid{grid-template-columns:1fr}.mapping{grid-template-columns:1fr 1fr}.kpis{grid-template-columns:1fr 1fr}.selectionBar{bottom:72px;flex-direction:column;align-items:stretch}}`}</style>
      <header className="enrichHead">
        <div>
          <p className="eyebrow">DONNÉES & PROSPECTION</p>
          <h1>Trouver, enrichir et importer.</h1>
          <p className="muted">
            Des entreprises exploitables, sans ressaisie et sans abonnement
            payant.
          </p>
        </div>
        <div className="tabs">
          <button
            className={tab === "search" ? "active" : ""}
            onClick={() => setTab("search")}
          >
            Recherche par zone
          </button>
          <button
            className={tab === "import" ? "active" : ""}
            onClick={() => setTab("import")}
          >
            Import Excel / CSV
          </button>
        </div>
      </header>
      {message && <div className="info">{message}</div>}
      {tab === "search" ? (
        <>
          <section className="panel">
            <p className="eyebrow">SOURCE PUBLIQUE FRANÇAISE</p>
            <h2>Entreprises autour de votre prochaine zone</h2>
            <div className="searchForm">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Activité ou nom : plombier, transport, nettoyage…"
              />
              <input
                value={postal}
                onChange={(e) => setPostal(e.target.value)}
                inputMode="numeric"
                placeholder="Code postal"
              />
              <button
                className="primary"
                onClick={search}
                disabled={busy === "search"}
              >
                {busy === "search" ? "Recherche…" : "Rechercher"}
              </button>
            </div>
            {searchInfo && <p className="info">{searchInfo}</p>}
          </section>
          <section className="companyGrid">
            {companies.map((company) => (
              <article
                className={`companyCard ${selected.includes(company.siret) ? "selected" : ""}`}
                key={company.siret}
              >
                <label className="selectCompany">
                  <input
                    type="checkbox"
                    checked={selected.includes(company.siret)}
                    onChange={(event) =>
                      setSelected((old) =>
                        event.target.checked
                          ? [...old, company.siret]
                          : old.filter((siret) => siret !== company.siret),
                      )
                    }
                  />
                  Sélectionner pour la tournée du jour
                </label>
                <header>
                  <div>
                    <h3>{company.name}</h3>
                    <small className="verified">
                      ✓ Identité et adresse vérifiées
                    </small>
                  </div>
                  <div className="score">
                    <b>{company.fleetPotential}</b>
                    <small>/100 flotte</small>
                  </div>
                </header>
                <div className="companyMeta">
                  {company.sector}
                  <br />
                  {company.address}
                  <br />
                  {company.postalCode} {company.city}
                  <br />
                  SIRET {company.siret}
                  {company.manager && (
                    <>
                      <br />
                      Direction : {company.manager} · {company.managerRole}
                    </>
                  )}
                </div>
                <div>
                  {company.existingId ? (
                    <a href={`/prospection?prospect=${company.existingId}`}>
                      Déjà dans le CRM →
                    </a>
                  ) : (
                    <button
                      className="primary"
                      disabled={busy === company.siret}
                      onClick={() => add(company)}
                    >
                      {busy === company.siret
                        ? "Ajout…"
                        : "Ajouter et qualifier"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
          {selected.length > 0 && (
            <aside className="selectionBar">
              <p>
                <b>{selected.length} entreprises sélectionnées</b>
                <br />
                Création des fiches et optimisation dans Terrain.
              </p>
              <button
                className="primary"
                disabled={busy === "plan"}
                onClick={planSelection}
              >
                {busy === "plan" ? "Préparation…" : "Préparer ma tournée"}
              </button>
              <a href="/terrain">Ouvrir Terrain →</a>
            </aside>
          )}
        </>
      ) : (
        <>
          <section className="importTop">
            <article className="panel fileBox">
              <p className="eyebrow">1 — CHOISIR LE FICHIER</p>
              <h2>Excel ou CSV</h2>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setPreview(null);
                }}
              />
              <p className="muted">Maximum 8 Mo et 2 000 lignes par import.</p>
              <button
                className="primary"
                onClick={inspect}
                disabled={!file || busy === "preview"}
              >
                {busy === "preview" ? "Analyse…" : "Analyser avant l’import"}
              </button>
            </article>
            <article className="panel">
              <p className="eyebrow">PROTECTION</p>
              <h2>Import réversible</h2>
              <p className="muted">
                Aucune ligne n’est enregistrée avant votre validation. Les
                doublons sont signalés et chaque import peut être annulé.
              </p>
            </article>
          </section>
          {preview && (
            <section className="panel">
              <p className="eyebrow">2 — VÉRIFIER ET CORRIGER</p>
              <h2>Correspondance des colonnes</h2>
              <div className="kpis">
                <div className="stat">
                  <small>LIGNES</small>
                  <b>{rows.length}</b>
                </div>
                <div className="stat">
                  <small>VALIDES</small>
                  <b>{rows.filter((r) => clean(r.name)).length}</b>
                </div>
                <div className="stat">
                  <small>DOUBLONS</small>
                  <b>{rows.filter((r) => r.duplicateId).length}</b>
                </div>
                <div className="stat">
                  <small>À CORRIGER</small>
                  <b>{rows.filter((r) => !clean(r.name)).length}</b>
                </div>
              </div>
              <div className="mapping">
                {preview.headers.map((header) => (
                  <label key={header}>
                    <span>{header}</span>
                    <select
                      value={map[header] || ""}
                      onChange={(e) =>
                        setMap((old) => ({ ...old, [header]: e.target.value }))
                      }
                    >
                      {targets.map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="previewTable">
                <table>
                  <thead>
                    <tr>
                      <th>Ligne</th>
                      <th>Entreprise</th>
                      <th>Adresse</th>
                      <th>Ville</th>
                      <th>Téléphone</th>
                      <th>E-mail</th>
                      <th>Vérification</th>
                      <th>État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 100).map((row, index) => (
                      <tr key={index}>
                        <td>{row.sourceRow}</td>
                        <td>{clean(row.name) || "Nom manquant"}</td>
                        <td>{clean(row.address)}</td>
                        <td>{clean(row.city)}</td>
                        <td>{clean(row.phone)}</td>
                        <td>{clean(row.email)}</td>
                        <td>
                          {clean(row.verificationStatus) || "Non renseignée"}
                          {clean(row.verificationConfidence)
                            ? ` · ${clean(row.verificationConfidence)}%`
                            : ""}
                        </td>
                        <td className={row.duplicateId ? "duplicate" : ""}>
                          {row.duplicateId
                            ? `Doublon : ${row.duplicateName}`
                            : clean(row.name)
                              ? "Prêt"
                              : "À corriger"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="actionsRow">
                <label>
                  Fiabilité :{" "}
                  <select
                    value={confidenceMode}
                    onChange={(e) => setConfidenceMode(e.target.value)}
                  >
                    <option value="safe">
                      Vérifiées et probables, sans doublon
                    </option>
                    <option value="all">
                      Toutes les lignes, y compris à revoir
                    </option>
                  </select>
                </label>
                {confidenceMode === "safe" ? (
                  <small>{safeRowsCount} lignes sûres seront importées</small>
                ) : null}
                <label>
                  Doublons :{" "}
                  <select
                    value={duplicateMode}
                    onChange={(e) => setDuplicateMode(e.target.value)}
                  >
                    <option value="skip">
                      Ignorer et conserver l’existant
                    </option>
                    <option value="update">Compléter la fiche existante</option>
                  </select>
                </label>
                <button
                  className="primary"
                  onClick={commit}
                  disabled={
                    busy === "commit" ||
                    !rows.some((r) => clean(r.name)) ||
                    (confidenceMode === "safe" && safeRowsCount === 0)
                  }
                >
                  {busy === "commit" ? "Import…" : "Valider l’import"}
                </button>
              </div>
            </section>
          )}
          <section className="panel">
            <p className="eyebrow">HISTORIQUE</p>
            <h2>Derniers imports</h2>
            {batches.map((batch) => (
              <div className="historyLine" key={batch.id}>
                <div>
                  <b>{batch.fileName}</b>
                  <small>
                    {new Date(batch.createdAt).toLocaleString("fr-FR")} ·{" "}
                    {batch.createdCount} créées · {batch.updatedCount}{" "}
                    complétées · {batch.skippedCount} ignorées
                  </small>
                </div>
                {batch.status === "completed" ? (
                  <button
                    disabled={busy === batch.id}
                    onClick={() => rollback(batch)}
                  >
                    Annuler
                  </button>
                ) : (
                  <mark>Annulé</mark>
                )}
              </div>
            ))}
            {!batches.length && (
              <p className="muted">Aucun import enregistré.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

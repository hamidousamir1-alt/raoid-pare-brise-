"use client";
import { useEffect, useState } from "react";
type Data = {
  backups: Array<{
    id: string;
    label: string;
    recordCount: number;
    createdAt: string;
  }>;
  stats: {
    prospects: number;
    events: number;
    documents: number;
    backups: number;
  };
  audit: Array<{ subject: string; eventType: string; createdAt: string }>;
  security: Record<string, boolean>;
  health: {
    overall: "ok" | "warning" | "critical";
    checks: Array<{
      key: string;
      label: string;
      status: "ok" | "warning" | "critical";
      detail: string;
      href: string;
    }>;
    summary: {
      critical: number;
      warning: number;
      ok: number;
      activeCampaigns: number;
      pausedCampaigns: number;
      repliesWeek: number;
    };
  };
};
const eventLabels: Record<string, string> = {
  updated: "Fiche modifiée",
  archived: "Fiche archivée",
  call_logged: "Appel enregistré",
  appointment_created: "Rendez-vous créé",
  offer_created: "Offre créée",
  offer_status_changed: "Statut d’offre modifié",
  service_case_created: "Demande vitrage créée",
  service_case_status_changed: "Intervention mise à jour",
  prospects_merged: "Fiches fusionnées",
};
export default function AdministrationPage() {
  const [data, setData] = useState<Data | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    try {
      const r = await fetch("/api/admin", { cache: "no-store" });
      if (r.status === 401) {
        location.href = "/login";
        return;
      }
      if (!r.ok) throw new Error();
      setData(await r.json());
      setError("");
    } catch {
      setError(
        "L’administration sera disponible après la mise à jour de la base.",
      );
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function backup() {
    const label = prompt("Nom de la sauvegarde :", "Point de contrôle manuel");
    if (!label) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "backup", label }),
      });
      if (!r.ok) throw new Error();
      await load();
    } catch {
      alert("La sauvegarde n’a pas pu être créée.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="workspace adminPage">
      <style>
        {
          ".adminPage{display:grid;gap:18px}.adminHead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px}.adminHead h1{margin:4px 0 7px}.adminActions{display:flex;gap:8px}.adminActions a{text-decoration:none}.healthHero{display:grid;grid-template-columns:1fr auto;align-items:center;gap:20px;padding:22px;border-radius:18px;background:linear-gradient(120deg,#07111f,#172536);color:#fff}.healthHero p{color:#aeb8c5}.healthState{padding:10px 13px;border-radius:10px;font-weight:700}.healthState.ok{background:#e8f7ed;color:#25703e}.healthState.warning{background:#fff4e5;color:#9a5a0a}.healthState.critical{background:#fff0f1;color:#a72c35}.healthGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.healthCheck{padding:14px;border:1px solid #e7eaf0;border-radius:12px}.healthCheck header{display:flex;justify-content:space-between;gap:10px}.healthCheck p{margin:7px 0;color:#687587;font-size:11px;line-height:1.45}.healthCheck a{font-size:10px}.healthDot{width:9px;height:9px;border-radius:50%;margin-top:3px;background:#287141}.healthDot.warning{background:#d98b16}.healthDot.critical{background:#d1343f}.adminKpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.adminKpis article,.adminPanel{background:#fff;border:1px solid #e7eaf0;border-radius:16px;padding:19px}.adminKpis small{display:block;color:#7b8797;font-size:9px}.adminKpis b{display:block;font-size:23px;margin-top:7px}.adminGrid{display:grid;grid-template-columns:.85fr 1.15fr;gap:18px}.securityLine,.backupLine,.auditLine{display:flex;justify-content:space-between;gap:12px;padding:13px 0;border-top:1px solid #edf0f4}.securityLine:first-of-type,.backupLine:first-of-type,.auditLine:first-of-type{border-top:0}.statusOk{color:#25703e;background:#e8f7ed;border-radius:8px;padding:5px 8px;font-size:9px}.statusMissing{color:#a72c35;background:#fff0f1;border-radius:8px;padding:5px 8px;font-size:9px}.adminNote{padding:13px;border-left:3px solid #ef3340;background:#fff5f5;color:#687587;border-radius:9px;font-size:11px;line-height:1.5}.auditLine small,.backupLine small{color:#7b8797}@media(max-width:900px){.adminGrid,.healthGrid{grid-template-columns:1fr}.adminKpis{grid-template-columns:1fr 1fr}.adminHead{align-items:flex-start;flex-direction:column}.adminActions{width:100%;flex-wrap:wrap}.healthHero{grid-template-columns:1fr}}"
        }{" "}
      </style>
      <header className="adminHead">
        <div>
          <p className="eyebrow">SÉCURITÉ & ADMINISTRATION</p>
          <h1>Vos données restent contrôlées et récupérables.</h1>
          <p className="muted">
            État du système, exports, sauvegardes et traçabilité des actions.
          </p>
        </div>
        <div className="adminActions">
          <a className="ghost" href="/api/admin?download=1">
            Exporter les données
          </a>
          <button className="primary" disabled={busy} onClick={backup}>
            {busy ? "Sauvegarde…" : "Créer une sauvegarde"}
          </button>
        </div>
      </header>
      {error && <section className="adminPanel">{error}</section>}
      {data?.health && (
        <>
          <section className="healthHero">
            <div>
              <p className="eyebrow">SANTÉ DU CRM</p>
              <h2>{data.health.overall === "ok" ? "Tous les systèmes sont opérationnels." : data.health.overall === "warning" ? "Quelques points nécessitent une vérification." : "Une intervention est nécessaire."}</h2>
              <p>{data.health.summary.activeCampaigns} campagne(s) active(s) · {data.health.summary.repliesWeek} réponse(s) cette semaine</p>
            </div>
            <span className={`healthState ${data.health.overall}`}>{data.health.overall === "ok" ? "Système sain" : data.health.overall === "warning" ? `${data.health.summary.warning} attention(s)` : `${data.health.summary.critical} blocage(s)`}</span>
          </section>
          <section className="adminPanel">
            <p className="eyebrow">DIAGNOSTIC AUTOMATIQUE</p>
            <h2>Contrôles essentiels</h2>
            <div className="healthGrid">
              {data.health.checks.map((check) => (
                <article className="healthCheck" key={check.key}>
                  <header><b>{check.label}</b><span className={`healthDot ${check.status}`} aria-label={check.status} /></header>
                  <p>{check.detail}</p>
                  <a href={check.href}>Examiner →</a>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      <section className="adminKpis">
        <article>
          <small>ENTREPRISES</small>
          <b>{data?.stats.prospects || 0}</b>
        </article>
        <article>
          <small>ÉVÉNEMENTS AUDITÉS</small>
          <b>{data?.stats.events || 0}</b>
        </article>
        <article>
          <small>DOCUMENTS</small>
          <b>{data?.stats.documents || 0}</b>
        </article>
        <article>
          <small>SAUVEGARDES</small>
          <b>{data?.stats.backups || 0}</b>
        </article>
      </section>
      <section className="adminGrid">
        <div>
          <article className="adminPanel">
            <p className="eyebrow">ÉTAT DU SYSTÈME</p>
            <h2>Contrôles de sécurité</h2>
            {data &&
              Object.entries(data.security).map(([key, ok]) => (
                <div className="securityLine" key={key}>
                  <b>
                    {key === "authentication"
                      ? "Accès sécurisé"
                      : key === "database"
                        ? "Base de données"
                        : key === "mail"
                          ? "Connexion Outlook"
                          : key === "cron"
                            ? "Automatisation planifiée"
                            : "Connexion HTTPS"}
                  </b>
                  <span className={ok ? "statusOk" : "statusMissing"}>
                    {ok ? "Configuré" : "À configurer"}
                  </span>
                </div>
              ))}
          </article>
          <article className="adminPanel" style={{ marginTop: 18 }}>
            <p className="eyebrow">POINTS DE CONTRÔLE</p>
            <h2>Sauvegardes internes</h2>
            <p className="adminNote">
              Une sauvegarde ne supprime rien. La restauration restera
              volontairement bloquée tant qu’une vérification complète n’aura
              pas été effectuée.
            </p>
            {data?.backups.length ? (
              data.backups.map((item) => (
                <div className="backupLine" key={item.id}>
                  <div>
                    <b>{item.label}</b>
                    <small>
                      {new Date(item.createdAt).toLocaleString("fr-FR")}
                    </small>
                  </div>
                  <span>{item.recordCount} éléments</span>
                </div>
              ))
            ) : (
              <p className="muted">Aucune sauvegarde manuelle.</p>
            )}
          </article>
        </div>
        <article className="adminPanel">
          <p className="eyebrow">JOURNAL D’AUDIT</p>
          <h2>Dernières actions</h2>
          {data?.audit.map((item, index) => (
            <div className="auditLine" key={item.createdAt + index}>
              <div>
                <b>{item.subject}</b>
                <small>{eventLabels[item.eventType] || item.eventType}</small>
              </div>
              <small>{new Date(item.createdAt).toLocaleString("fr-FR")}</small>
            </div>
          ))}
        </article>
      </section>
    </main>
  );
}

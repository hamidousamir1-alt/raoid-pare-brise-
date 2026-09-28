"use client";
import { useEffect, useState } from "react";
type Setting = {
  key: string;
  label: string;
  category: string;
  enabled: boolean;
  numericValue: number;
  unit?: string;
  description?: string;
};
type Audit = {
  id: string;
  label: string;
  newValue: { enabled: boolean; numericValue: number };
  changedAt: string;
};
type Data = {
  settings: Setting[];
  audit: Audit[];
  sequences: Array<{
    id: string;
    name: string;
    active: boolean;
    stopOnReply: boolean;
    steps: number;
  }>;
};
export default function SettingsPage() {
  const [data, setData] = useState<Data | null>(null),
    [drafts, setDrafts] = useState<Record<string, number>>({}),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function load() {
    try {
      const r = await fetch("/api/settings", { cache: "no-store" });
      if (r.status === 401) {
        location.href = "/login";
        return;
      }
      if (!r.ok) throw new Error();
      const payload = (await r.json()) as Data;
      setData(payload);
      setDrafts(
        Object.fromEntries(
          payload.settings.map((x) => [x.key, x.numericValue]),
        ),
      );
      setError("");
    } catch {
      setError(
        "Les réglages seront disponibles après la mise à jour de la base.",
      );
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function save(
    setting: Setting,
    enabled = setting.enabled,
    numericValue = drafts[setting.key] ?? setting.numericValue,
  ) {
    setBusy(setting.key);
    try {
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: setting.key, enabled, numericValue }),
      });
      if (!r.ok) throw new Error();
      await load();
    } catch {
      alert("Le réglage n’a pas pu être enregistré.");
    } finally {
      setBusy("");
    }
  }
  const categories = [...new Set(data?.settings.map((x) => x.category) || [])];
  return (
    <main className="workspace settingsPage">
      <style>
        {
          ".settingsPage{display:grid;gap:18px}.settingsHead h1{margin:4px 0 7px}.settingsGrid{display:grid;grid-template-columns:1.2fr .8fr;gap:18px}.settingsPanel{background:#fff;border:1px solid #e7eaf0;border-radius:16px;padding:20px}.settingGroup{margin-top:18px}.settingGroup h3{font-size:10px;color:#778395;letter-spacing:1px}.settingLine{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:12px;padding:14px 0;border-top:1px solid #edf0f4}.settingLine p{margin:4px 0 0;color:#718094;font-size:10px}.delay{white-space:nowrap;color:#687587;font-size:10px}.delay input{width:68px;padding:8px;border:1px solid #dce2e9;border-radius:8px}.toggle{border:0;border-radius:20px;padding:7px 10px;font-size:9px}.toggle.on{background:#e7f6eb;color:#25703e}.toggle.off{background:#f1f3f6;color:#718094}.auditLine{padding:12px 0;border-top:1px solid #edf0f4}.auditLine:first-of-type{border-top:0}.auditLine small{display:block;color:#7b8797;margin-top:4px}.sequence{padding:12px;border-radius:10px;background:#f6f8fa;margin-top:8px;font-size:11px}.safeNote{padding:13px;border-left:3px solid #ef3340;background:#fff5f5;border-radius:9px;color:#6c7788;font-size:11px}@media(max-width:900px){.settingsGrid{grid-template-columns:1fr}.settingLine{grid-template-columns:1fr auto}.delay{grid-column:1}.settingsHead{padding-right:0}}"
        }{" "}
      </style>
      <header className="settingsHead">
        <p className="eyebrow">CONFIGURATION & AUTOMATISATION</p>
        <h1>Automatique, mais toujours sous votre contrôle.</h1>
        <p className="muted">
          Activez, désactivez ou ajustez les délais sans modifier le code du
          CRM.
        </p>
      </header>
      {error && <section className="settingsPanel">{error}</section>}
      <section className="settingsGrid">
        <article className="settingsPanel">
          <p className="eyebrow">RÈGLES</p>
          <h2>Automatisations commerciales</h2>
          <p className="safeNote">
            Chaque modification est enregistrée dans le journal. Désactiver une
            règle empêche la création des prochaines actions automatiques sans
            effacer l’historique.
          </p>
          {categories.map((category) => (
            <div className="settingGroup" key={category}>
              <h3>{category.toUpperCase()}</h3>
              {data?.settings
                .filter((x) => x.category === category)
                .map((setting) => (
                  <div className="settingLine" key={setting.key}>
                    <div>
                      <b>{setting.label}</b>
                      <p>{setting.description}</p>
                    </div>
                    <label className="delay">
                      <input
                        type="number"
                        min="0"
                        value={drafts[setting.key] ?? setting.numericValue}
                        disabled={busy === setting.key}
                        onChange={(e) =>
                          setDrafts((old) => ({
                            ...old,
                            [setting.key]: Number(e.target.value),
                          }))
                        }
                        onBlur={() => save(setting)}
                      />{" "}
                      {setting.unit}
                    </label>
                    <button
                      className={"toggle " + (setting.enabled ? "on" : "off")}
                      disabled={busy === setting.key}
                      onClick={() => save(setting, !setting.enabled)}
                    >
                      {setting.enabled ? "Activée" : "Désactivée"}
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </article>
        <aside>
          <section className="settingsPanel">
            <p className="eyebrow">MAILING</p>
            <h2>Séquences disponibles</h2>
            {data?.sequences.map((s) => (
              <div className="sequence" key={s.id}>
                <b>{s.name}</b>
                <p>
                  {s.steps} étapes ·{" "}
                  {s.stopOnReply
                    ? "arrêt sur réponse"
                    : "continue après réponse"}{" "}
                  · {s.active ? "active" : "inactive"}
                </p>
              </div>
            ))}
          </section>
          <section className="settingsPanel" style={{ marginTop: 18 }}>
            <p className="eyebrow">JOURNAL</p>
            <h2>Dernières modifications</h2>
            {data?.audit.length ? (
              data.audit.map((a) => (
                <div className="auditLine" key={a.id}>
                  <b>{a.label}</b>
                  <small>
                    {a.newValue.enabled ? "Activée" : "Désactivée"} · délai{" "}
                    {a.newValue.numericValue} ·{" "}
                    {new Date(a.changedAt).toLocaleString("fr-FR")}
                  </small>
                </div>
              ))
            ) : (
              <p className="muted">Aucune modification enregistrée.</p>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}

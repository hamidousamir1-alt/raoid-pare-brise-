"use client";

import { useEffect, useState } from "react";

type Prospect = {
  id: string;
  name: string;
  sector?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
  email?: string;
  siret?: string;
  status: string;
  score: number;
  dataQualityScore: number;
  updatedAt: string;
  reasons?: string[];
};
type Duplicate = {
  first: Prospect;
  second: Prospect;
  score: number;
  reasons: string[];
};
type Data = {
  duplicates: Duplicate[];
  issues: Prospect[];
  stats: {
    total: number;
    possibleDuplicates: number;
    incomplete: number;
    stale: number;
  };
};

export default function DataQualityPage() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const response = await fetch("/api/data-quality", { cache: "no-store" });
      if (response.status === 401) {
        location.href = "/login";
        return;
      }
      if (!response.ok) throw new Error();
      setData(await response.json());
      setError("");
    } catch {
      setError(
        "Le contrôle des données sera disponible après la mise à jour de la base.",
      );
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function action(payload: Record<string, string>, key: string) {
    setBusy(key);
    try {
      const response = await fetch("/api/data-quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      alert("L’opération n’a pas pu être enregistrée.");
    } finally {
      setBusy("");
    }
  }

  async function merge(master: Prospect, duplicate: Prospect) {
    if (
      !confirm(
        `Conserver « ${master.name} » et fusionner « ${duplicate.name} » ?\n\nLes contacts, rendez-vous, messages, documents et tout l’historique seront rattachés à la fiche conservée. L’autre fiche sera archivée, jamais supprimée physiquement.`,
      )
    )
      return;
    await action(
      {
        action: "merge",
        masterId: master.id,
        duplicateId: duplicate.id,
      },
      `${master.id}:${duplicate.id}`,
    );
  }

  return (
    <main className="workspace dataPage">
      <style>{`.dataPage{display:grid;gap:18px}.dataHead{display:flex;justify-content:space-between;align-items:flex-end;gap:20px}.dataHead h1{margin:4px 0 7px}.dataKpis{display:grid;grid-template-columns:repeat(4,1fr);gap:13px}.dataKpis article,.dataPanel{padding:20px;background:#fff;border:1px solid #e7eaf0;border-radius:16px}.dataKpis small{display:block;color:#7c8797;font-size:9px}.dataKpis b{display:block;margin-top:7px;font-size:25px}.dataGrid{display:grid;grid-template-columns:1.1fr .9fr;gap:18px}.dataPanel h2{margin:3px 0 16px}.duplicateCard,.qualityLine{padding:15px 0;border-top:1px solid #edf0f4}.duplicateCard:first-of-type,.qualityLine:first-of-type{border-top:0}.matchHead,.qualityLine header{display:flex;justify-content:space-between;gap:12px}.matchHead mark{white-space:nowrap}.compare{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:11px 0}.compare article{padding:12px;border-radius:11px;background:#f6f8fa}.compare b,.compare small{display:block}.compare small{margin-top:5px;color:#748095;line-height:1.5}.mergeButtons{display:flex;gap:8px;flex-wrap:wrap}.mergeButtons button{font-size:10px}.reasons{display:flex;gap:5px;flex-wrap:wrap;margin:8px 0}.reasons span{padding:5px 7px;border-radius:7px;background:#fff1f2;color:#ac3039;font-size:8px}.qualityLine p{margin:7px 0;color:#687587;font-size:11px}.qualityActions{display:flex;gap:8px}.qualityActions a,.qualityActions button{font-size:10px}.emptyData{padding:18px;border-radius:12px;background:#f1f8f4;color:#27633e;font-size:12px}@media(max-width:850px){.dataGrid{grid-template-columns:1fr}.dataKpis{grid-template-columns:1fr 1fr}.dataHead{align-items:flex-start;flex-direction:column}.compare{grid-template-columns:1fr}}`}</style>
      <header className="dataHead">
        <div>
          <p className="eyebrow">QUALITÉ & FIABILITÉ</p>
          <h1>Une base propre, sans perte d’information.</h1>
          <p className="muted">
            Le CRM détecte les risques. Vous gardez toujours la décision finale.
          </p>
        </div>
        <button onClick={load}>↻ Relancer le contrôle</button>
      </header>
      {error && <section className="dataPanel">{error}</section>}
      {data && (
        <>
          <section className="dataKpis">
            <article>
              <small>ENTREPRISES</small>
              <b>{data.stats.total}</b>
            </article>
            <article>
              <small>DOUBLONS POSSIBLES</small>
              <b>{data.stats.possibleDuplicates}</b>
            </article>
            <article>
              <small>DOSSIERS INCOMPLETS</small>
              <b>{data.stats.incomplete}</b>
            </article>
            <article>
              <small>DONNÉES ANCIENNES</small>
              <b>{data.stats.stale}</b>
            </article>
          </section>
          <section className="dataGrid">
            <article className="dataPanel">
              <p className="eyebrow">DOUBLONS</p>
              <h2>Fusions à vérifier</h2>
              {data.duplicates.length ? (
                data.duplicates.map((duplicate) => (
                  <div
                    className="duplicateCard"
                    key={`${duplicate.first.id}:${duplicate.second.id}`}
                  >
                    <div className="matchHead">
                      <b>Correspondance détectée</b>
                      <mark>{duplicate.score}%</mark>
                    </div>
                    <div className="reasons">
                      {duplicate.reasons.map((reason) => (
                        <span key={reason}>{reason}</span>
                      ))}
                    </div>
                    <div className="compare">
                      {[duplicate.first, duplicate.second].map((prospect) => (
                        <article key={prospect.id}>
                          <b>{prospect.name}</b>
                          <small>
                            {prospect.address || "Adresse manquante"}
                            <br />
                            {prospect.phone || "Téléphone manquant"}
                            <br />
                            {prospect.email || "E-mail manquant"}
                            <br />
                            Qualité {prospect.dataQualityScore || 0}%
                          </small>
                        </article>
                      ))}
                    </div>
                    <div className="mergeButtons">
                      <button
                        className="primary"
                        disabled={Boolean(busy)}
                        onClick={() => merge(duplicate.first, duplicate.second)}
                      >
                        Conserver {duplicate.first.name}
                      </button>
                      <button
                        disabled={Boolean(busy)}
                        onClick={() => merge(duplicate.second, duplicate.first)}
                      >
                        Conserver {duplicate.second.name}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="emptyData">Aucun doublon probable détecté.</p>
              )}
            </article>
            <article className="dataPanel">
              <p className="eyebrow">À CONTRÔLER</p>
              <h2>Qualité des dossiers</h2>
              {data.issues.slice(0, 30).map((prospect) => (
                <div className="qualityLine" key={prospect.id}>
                  <header>
                    <b>{prospect.name}</b>
                    <mark>{prospect.dataQualityScore || 0}%</mark>
                  </header>
                  <div className="reasons">
                    {prospect.reasons?.map((reason) => (
                      <span key={reason}>{reason}</span>
                    ))}
                  </div>
                  <div className="qualityActions">
                    <a href={`/prospection?prospect=${prospect.id}`}>
                      Compléter la fiche →
                    </a>
                    <button
                      disabled={busy === prospect.id}
                      onClick={() =>
                        action(
                          { action: "verify", prospectId: prospect.id },
                          prospect.id,
                        )
                      }
                    >
                      Données vérifiées
                    </button>
                  </div>
                </div>
              ))}
              {!data.issues.length && (
                <p className="emptyData">Tous les dossiers sont à jour.</p>
              )}
            </article>
          </section>
        </>
      )}
    </main>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  suggestedNextAction,
  weightedPipelinePotential,
} from "../../lib/commercial";
type Stage = "À contacter" | "Qualifiés" | "RDV" | "Offres" | "Gagnés";
type StoredProspect = {
  id: string;
  name: string;
  score: number;
  next?: string;
  zone?: string;
  status?: string;
  fleet?: string;
  sector?: string;
  access?: string;
  insurance?: string;
  potentialRevenue?: number;
  signedRevenue?: number;
  generatedRevenue?: number;
  updatedAt?: string;
  [key: string]: unknown;
};
type Deal = StoredProspect & { stage: Stage; next: string };
const stages: Stage[] = ["À contacter", "Qualifiés", "RDV", "Offres", "Gagnés"];
const money = (n = 0) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
const toStage = (s = "Nouveau"): Stage =>
  s === "Gagné"
    ? "Gagnés"
    : s === "Offre"
      ? "Offres"
      : s === "RDV"
        ? "RDV"
        : s === "Qualifié" || s === "Relance"
          ? "Qualifiés"
          : "À contacter";
const toStatus = (s: Stage) =>
  s === "Gagnés"
    ? "Gagné"
    : s === "Offres"
      ? "Offre"
      : s === "RDV"
        ? "RDV"
        : s === "Qualifiés"
          ? "Qualifié"
          : "À contacter";
export default function PipelineBoard() {
  const [deals, setDeals] = useState<Deal[]>([]),
    [blocked, setBlocked] = useState(true);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await fetch("/api/prospects", { cache: "no-store" });
        if (r.status === 401) {
          location.href = "/login";
          return;
        }
        if (!r.ok) return;
        const d = await r.json();
        if (d.mode !== "postgresql") return;
        const valid = (d.items || []).filter(
          (x: StoredProspect) => x.status !== "Perdu",
        );
        if (live) {
          setDeals(
            valid.map((x: StoredProspect) => {
              const stage = toStage(x.status);
              return {
                ...x,
                stage,
                next: x.next || suggestedNextAction(toStatus(stage)),
                potentialRevenue: weightedPipelinePotential(x),
              };
            }),
          );
          setBlocked(false);
        }
      } catch {}
    })();
    return () => {
      live = false;
    };
  }, []);
  const stats = useMemo(() => {
    const active = deals.filter((d) => d.stage !== "Gagnés"),
      potential = active.reduce((a, d) => a + (d.potentialRevenue || 0), 0),
      signed = deals.reduce((a, d) => a + (d.signedRevenue || 0), 0),
      hot = deals.filter(
        (d) => d.stage === "RDV" || d.stage === "Offres",
      ).length;
    return { active, potential, signed, hot };
  }, [deals]);
  async function move(d: Deal, dir: number) {
    if (blocked) {
      alert("Stockage sécurisé indisponible. Modification bloquée.");
      return;
    }
    const i = stages.indexOf(d.stage),
      n = i + dir;
    if (n < 0 || n >= stages.length) return;
    const stage = stages[n],
      status = toStatus(stage),
      next = suggestedNextAction(status),
      updated = { ...d, stage, status, next },
      potentialRevenue = weightedPipelinePotential(updated);
    try {
      const r = await fetch(`/api/prospects/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...updated, potentialRevenue }),
      });
      if (r.status === 401) {
        location.href = "/login";
        return;
      }
      if (!r.ok) {
        if (r.status >= 500) setBlocked(true);
        alert(
          "Déplacement impossible. Le serveur n’a pas validé la modification.",
        );
        return;
      }
      const data = await r.json(),
        saved = data.item as StoredProspect;
      setDeals((old) =>
        old.map((x) =>
          x.id === d.id
            ? {
                ...saved,
                stage: toStage(saved.status),
                next: saved.next || suggestedNextAction(saved.status),
                potentialRevenue: weightedPipelinePotential(saved),
              }
            : x,
        ),
      );
    } catch {
      setBlocked(true);
      alert(
        "Connexion au stockage sécurisé interrompue. Modification annulée.",
      );
    }
  }
  return (
    <>
      <section className="pipelineHero">
        <div>
          <p className="eyebrow">PILOTAGE COMMERCIAL</p>
          <h2>Du premier contact au partenaire actif</h2>
          <p>
            Chaque mouvement met à jour le statut du prospect et son potentiel
            pondéré avec le même moteur de calcul que la fiche entreprise.
          </p>
        </div>
        <div className="pipelineKpis">
          <div>
            <small>OPPORTUNITÉS ACTIVES</small>
            <b>{stats.active.length}</b>
          </div>
          <div>
            <small>POTENTIEL PONDÉRÉ</small>
            <b>{money(stats.potential)}</b>
          </div>
          <div>
            <small>RDV + OFFRES</small>
            <b>{stats.hot}</b>
          </div>
          <div>
            <small>CA SIGNÉ RENSEIGNÉ</small>
            <b>{money(stats.signed)}</b>
          </div>
        </div>
      </section>
      <div className="pipelineLegend">
        <span>
          <i /> À travailler
        </span>
        <span>
          <i /> En progression
        </span>
        <span>
          <i /> Proche décision
        </span>
        <span className="pipelineHint">
          Priorité : faire avancer les dossiers, pas remplir des colonnes.
        </span>
      </div>
      <div className="kanban">
        {stages.map((stage, i) => {
          const list = deals
            .filter((d) => d.stage === stage)
            .sort(
              (a, b) => (b.potentialRevenue || 0) - (a.potentialRevenue || 0),
            );
          const total = list.reduce((a, d) => a + (d.potentialRevenue || 0), 0);
          return (
            <section className={`kanbancol stage${i}`} key={stage}>
              <header>
                <div>
                  <span className="stageLabel">
                    <b>{stage}</b>
                    <span className="stageCount">{list.length}</span>
                  </span>
                  <small>{money(total)}</small>
                </div>
              </header>
              <div className="kanbanCards">
                {list.map((d) => (
                  <article className="dealcard" key={d.id}>
                    <div className="dealTop">
                      <small>{d.sector || "PROSPECT B2B"}</small>
                      <span className={d.score >= 85 ? "hotScore" : "score"}>
                        {d.score}/100
                      </span>
                    </div>
                    <h3>{d.name}</h3>
                    <p className="dealMeta">
                      {d.zone || "Zone à renseigner"}
                      {d.fleet ? ` · 🚐 ${d.fleet}` : ""}
                    </p>
                    <div className="dealValue">
                      <small>POTENTIEL PONDÉRÉ</small>
                      <b>{money(d.potentialRevenue)}</b>
                    </div>
                    <div className="nextAction">
                      <small>PROCHAINE ACTION</small>
                      <p>{d.next}</p>
                    </div>
                    <div className="dealSignals">
                      <span>Accès {d.access || "à vérifier"}</span>
                      <span>Assurance {d.insurance || "à vérifier"}</span>
                    </div>
                    <footer>
                      <Link
                        className="callDeal"
                        href={`/appels?prospect=${d.id}`}
                        aria-label={`Journaliser un appel avec ${d.name}`}
                      >
                        ☎
                      </Link>
                      <button
                        disabled={i === 0 || blocked}
                        onClick={() => move(d, -1)}
                        aria-label="Reculer l'opportunité"
                      >
                        ←
                      </button>
                      <button
                        className="advance"
                        disabled={i === stages.length - 1 || blocked}
                        onClick={() => move(d, 1)}
                      >
                        {i === stages.length - 1
                          ? "Partenaire actif"
                          : "Avancer →"}
                      </button>
                    </footer>
                  </article>
                ))}
                {!list.length && (
                  <div className="emptyStage">
                    <b>Colonne vide</b>
                    <span>
                      {i === 0
                        ? "Les nouveaux prospects apparaîtront ici."
                        : "Fais avancer les opportunités depuis la colonne précédente."}
                    </span>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

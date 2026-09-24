"use client";
import { useEffect, useMemo, useState } from "react";
type Prospect = {
  id: string;
  name: string;
  sector: string;
  zone: string;
  fleet: string;
  score: number;
  status: string;
  access?: string;
  doNotContact?: boolean;
  lastFieldVisitAt?: string | null;
  updatedAt?: string;
};
type DailyAction = {
  id: string;
  prospect: string;
  title: string;
  priority: number;
};
type ActionSummary = {
  tasks: DailyAction[];
  replies: Array<{ id: string; reviewStatus: string }>;
};
type AppointmentSummary = {
  id: string;
  prospect: string;
  startsAt: string;
  status: string;
};
const stage = (s: string) =>
  s === "Gagné"
    ? "Gagnés"
    : s === "Offre"
      ? "Offres"
      : s === "RDV"
        ? "RDV"
        : s === "Qualifié" || s === "Relance"
          ? "Qualifiés"
          : "Nouveaux";
export default function Home() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [actions, setActions] = useState<ActionSummary>({
    tasks: [],
    replies: [],
  });
  const [appointments, setAppointments] = useState<AppointmentSummary[]>([]);
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
        if (d.mode === "postgresql" && live) setProspects(d.items || []);
      } catch {}
    })();
    (async () => {
      try {
        const response = await fetch("/api/appointments", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (live) setAppointments(payload.appointments || []);
      } catch {}
    })();
    (async () => {
      try {
        const response = await fetch("/api/mailing", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (live)
          setActions({
            tasks: payload.tasks || [],
            replies: payload.replies || [],
          });
      } catch {}
    })();
    return () => {
      live = false;
    };
  }, []);
  const todayKey = new Date().toDateString(),
    todayAppointments = appointments.filter(
      (appointment) =>
        new Date(appointment.startsAt).toDateString() === todayKey &&
        !["cancelled", "completed"].includes(appointment.status),
    );
  const data = useMemo(() => {
    const active = prospects.filter(
        (p) => !["Gagné", "Perdu"].includes(p.status),
      ),
      relance = prospects.filter((p) => p.status === "Relance"),
      rdv = prospects.filter((p) => p.status === "RDV"),
      won = prospects.filter((p) => p.status === "Gagné").length,
      lost = prospects.filter((p) => p.status === "Perdu").length,
      decided = won + lost,
      conversion = decided ? Math.round((won / decided) * 100) : 0,
      priority = [...active].sort((a, b) => b.score - a.score).slice(0, 4),
      names = ["Nouveaux", "Qualifiés", "RDV", "Offres", "Gagnés"],
      pipeline = names.map(
        (n) =>
          [n, prospects.filter((p) => stage(p.status) === n).length] as const,
      );
    const terrainCandidates = active.filter(
      (p) =>
        !p.doNotContact &&
        p.access !== "Difficile" &&
        (!p.lastFieldVisitAt ||
          Date.now() - new Date(p.lastFieldVisitAt).getTime() >
            7 * 24 * 60 * 60 * 1000),
    );
    const zoneGroups = terrainCandidates.reduce<Record<string, Prospect[]>>(
      (groups, prospect) => {
        const zone = prospect.zone?.trim() || "Marseille Est";
        (groups[zone] ||= []).push(prospect);
        return groups;
      },
      {},
    );
    const preferred = ["Arnavaux", "Saint-Pierre", "Marseille Est", "Aubagne"];
    const terrainZone = Object.entries(zoneGroups).sort(
      ([zoneA, listA], [zoneB, listB]) => {
        const preferenceA = preferred.indexOf(zoneA);
        const preferenceB = preferred.indexOf(zoneB);
        const scoreA =
          listA.length * 100 +
          listA.reduce((sum, p) => sum + p.score, 0) +
          (preferenceA >= 0 ? preferred.length - preferenceA : 0) * 20;
        const scoreB =
          listB.length * 100 +
          listB.reduce((sum, p) => sum + p.score, 0) +
          (preferenceB >= 0 ? preferred.length - preferenceB : 0) * 20;
        return scoreB - scoreA;
      },
    )[0];
    const terrainPreview = (terrainZone?.[1] || [])
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    return {
      active,
      relance,
      rdv,
      conversion,
      priority,
      pipeline,
      terrainZone: terrainZone?.[0] || "À préparer",
      terrainCount: terrainZone?.[1].length || 0,
      terrainPreview,
    };
  }, [prospects]);
  return (
    <main className="shell">
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">CENTRE DE COMMANDE</p>
            <h1>Bonjour Samir 👋</h1>
            <p className="muted">
              Voici ce qui mérite votre attention aujourd’hui.
            </p>
          </div>
          <a className="primary" href="/prospection">
            ＋ Nouveau prospect
          </a>
        </header>
        <div className="kpis">
          <article>
            <label>PROSPECTS ACTIFS</label>
            <strong>{data.active.length}</strong>
            <em>hors gagnés et perdus</em>
          </article>
          <article>
            <label>À RELANCER</label>
            <strong>{data.relance.length}</strong>
            <em className="amber">dossiers à reprendre</em>
          </article>
          <article>
            <label>RDV AUJOURD’HUI</label>
            <strong>{todayAppointments.length}</strong>
            <em>
              {todayAppointments[0]
                ? `${todayAppointments[0].prospect} à ${new Date(
                    todayAppointments[0].startsAt,
                  ).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : "aucun rendez-vous planifié"}
            </em>
          </article>
          <article>
            <label>TAUX DE CONVERSION</label>
            <strong>{data.conversion}%</strong>
            <em>sur dossiers décidés</em>
          </article>
        </div>
        <div className="grid todayActions">
          <article className="panel focus">
            <p className="eyebrow">ACTIONS DU JOUR</p>
            <h2>
              {actions.tasks.length} action
              {actions.tasks.length > 1 ? "s" : ""} prioritaire
              {actions.tasks.length > 1 ? "s" : ""}
            </h2>
            <p>
              {actions.tasks[0]
                ? `${actions.tasks[0].prospect} — ${actions.tasks[0].title}`
                : "Aucun dossier urgent. Le CRM surveille les prochaines échéances."}
            </p>
            <a className="primary" href="/actions">
              Ouvrir le centre d’actions
            </a>
          </article>
          <article className="panel">
            <div className="panelhead">
              <div>
                <p className="eyebrow">RÉPONSES À VALIDER</p>
                <h2>
                  {
                    actions.replies.filter(
                      (reply) => reply.reviewStatus === "pending",
                    ).length
                  }{" "}
                  décision(s) en attente
                </h2>
              </div>
              <a href="/actions">Examiner →</a>
            </div>
            <p className="muted">
              Les réponses importantes restent sous votre contrôle avant toute
              action commerciale définitive.
            </p>
          </article>
        </div>
        <article className="homeMission">
          <div>
            <p className="eyebrow">MISSION TERRAIN DU JOUR</p>
            <h2>{data.terrainZone}</h2>
            <p>
              {data.terrainCount
                ? `${data.terrainCount} entreprises accessibles regroupées dans cette zone.`
                : "Ajoutez des prospects avec une zone pour générer automatiquement la tournée."}
            </p>
            {!!data.terrainPreview.length && (
              <div className="missionPreview">
                {data.terrainPreview.map((prospect, index) => (
                  <span key={prospect.id}>
                    <b>{index + 1}</b> {prospect.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <a className="startTour" href="/terrain">
            {data.terrainCount
              ? "Commencer la tournée →"
              : "Préparer la tournée →"}
          </a>
        </article>
        <div className="grid">
          <article className="panel">
            <div className="panelhead">
              <div>
                <h2>Pipeline commercial</h2>
                <p>Vue instantanée de vos opportunités</p>
              </div>
              <a href="/pipeline">Voir le pipeline →</a>
            </div>
            <div className="pipeline">
              {data.pipeline.map(([n, v], i) => (
                <div key={n}>
                  <span>{n}</span>
                  <strong>{v}</strong>
                  <div className="bar">
                    <i style={{ width: `${Math.max(5, 100 - i * 13)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </article>
          <article className="panel focus">
            <p className="eyebrow">FOCUS DU JOUR</p>
            <h2>
              {data.relance.length} prospect{data.relance.length > 1 ? "s" : ""}{" "}
              à relancer
            </h2>
            <p>
              Les dossiers marqués « Relance » sont regroupés ici
              automatiquement.
            </p>
            <a className="primary" href="/prospection">
              Lancer les relances
            </a>
          </article>
        </div>
        <article className="panel">
          <div className="panelhead">
            <div>
              <h2>Prospects prioritaires</h2>
              <p>Classés par score commercial enregistré</p>
            </div>
            <a href="/performance">Analyser la performance →</a>
          </div>
          <div className="table">
            <div className="tr th">
              <span>ENTREPRISE</span>
              <span>ACTIVITÉ</span>
              <span>ZONE</span>
              <span>FLOTTE EST.</span>
              <span>SCORE</span>
              <span>STATUT</span>
            </div>
            {data.priority.map((p) => (
              <div className="tr" key={p.id}>
                <span>
                  {p.score >= 85 ? "🔥" : "🟢"} <b>{p.name}</b>
                </span>
                <span>{p.sector || "À renseigner"}</span>
                <span>{p.zone || "À renseigner"}</span>
                <span>{p.fleet || "À qualifier"}</span>
                <span>
                  <b className="score">{p.score}</b>/100
                </span>
                <span>
                  <mark>{p.status}</mark>
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
type Data = {
  funnel: Record<string, number>;
  activity: Record<string, number>;
  revenue: Record<string, number>;
  emails: {
    sent: number;
    replies: number;
    positiveReplies: number;
    activeCampaigns: number;
  };
  calls: {
    total: number;
    positive: number;
    appointments: number;
    unanswered: number;
  };
  rankings: Array<{
    label: string;
    prospects: number;
    won: number;
    revenue: number;
  }>;
  risks: Record<string, number>;
  goals: {
    revenueTarget: number;
    callsTarget: number;
    appointmentsTarget: number;
    partnersTarget: number;
  };
  recommendations: Array<{
    level: string;
    title: string;
    detail: string;
    href: string;
  }>;
};
const money = (n = 0) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
const percent = (value: number, total: number) =>
  total ? Math.round((value / total) * 100) : 0;
export default function PerformanceCockpit() {
  const [data, setData] = useState<Data | null>(null);
  const [goals, setGoals] = useState({
    revenueTarget: 0,
    callsTarget: 0,
    appointmentsTarget: 0,
    partnersTarget: 0,
  });
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    try {
      const response = await fetch("/api/performance", { cache: "no-store" });
      if (response.status === 401) {
        location.href = "/login";
        return;
      }
      if (!response.ok) throw new Error();
      const payload = (await response.json()) as Data;
      setData(payload);
      setGoals(payload.goals);
      setError("");
    } catch {
      setError("Le cockpit sera disponible après la mise à jour de la base.");
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function saveGoals(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/performance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(goals),
    });
    if (!response.ok) {
      alert("Les objectifs n’ont pas pu être enregistrés.");
      return;
    }
    setEditing(false);
    await load();
  }
  if (!data)
    return (
      <section className="perfPanel">
        {error || "Chargement du pilotage…"}
      </section>
    );
  const decided = data.funnel.won + data.funnel.lost;
  const funnel = [
    ["Prospects", data.funnel.total],
    ["Qualifiés", data.funnel.qualified],
    ["Rendez-vous", data.funnel.appointments],
    ["Offres", data.funnel.offers],
    ["Gagnés", data.funnel.won],
  ] as const;
  const goalCards = [
    ["CA du mois", data.revenue.monthRevenue, goals.revenueTarget, true],
    ["Appels", data.activity.calls, goals.callsTarget, false],
    [
      "Rendez-vous",
      data.activity.appointments,
      goals.appointmentsTarget,
      false,
    ],
    [
      "Nouveaux partenaires",
      data.activity.partners,
      goals.partnersTarget,
      false,
    ],
  ] as const;
  return (
    <div className="performanceCockpit">
      <style>
        {
          ".performanceCockpit{display:grid;gap:18px}.perfHead{display:flex;justify-content:space-between;align-items:flex-end;gap:18px}.perfHead h1{margin:4px 0 7px}.perfPanel,.goalCard,.metricCard{background:#fff;border:1px solid #e7eaf0;border-radius:16px;padding:19px}.perfHero{display:grid;grid-template-columns:1.2fr .8fr;gap:18px;background:linear-gradient(120deg,#07111f,#172536);color:#fff;border-radius:20px;padding:26px}.perfHero p{color:#aeb8c5;line-height:1.6}.heroNumbers{display:grid;grid-template-columns:1fr 1fr;gap:10px}.heroNumbers div{padding:15px;background:rgba(255,255,255,.06);border-radius:11px}.heroNumbers small,.heroNumbers b{display:block}.heroNumbers small{color:#aeb8c5;font-size:8px}.heroNumbers b{font-size:21px;margin-top:6px}.goalGrid,.metricGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.goalCard small,.metricCard small{display:block;color:#778496;font-size:9px}.goalCard b,.metricCard b{display:block;font-size:22px;margin:7px 0}.progress{height:7px;background:#edf0f3;border-radius:8px;overflow:hidden}.progress i{display:block;height:100%;background:#ef3340}.goalCard em{display:block;margin-top:7px;color:#718094;font-size:9px}.perfTwo{display:grid;grid-template-columns:1fr 1fr;gap:18px}.funnelLine,.rankingLine{display:grid;grid-template-columns:110px 1fr 48px;align-items:center;gap:10px;padding:9px 0}.funnelLine span,.rankingLine span{font-size:11px}.bar{height:8px;background:#eef1f4;border-radius:8px;overflow:hidden}.bar i{display:block;height:100%;background:#ef3340}.funnelLine b,.rankingLine b{text-align:right;font-size:11px}.recommendation{padding:13px 0;border-top:1px solid #edf0f4}.recommendation:first-of-type{border-top:0}.recommendation header{display:flex;justify-content:space-between;gap:10px}.recommendation p{color:#687587;font-size:11px;line-height:1.5}.recommendation a{font-size:10px}.risk{color:#c12b36}.good{color:#287141}.goalForm{display:grid;grid-template-columns:repeat(4,1fr) auto;gap:10px;align-items:end}.goalForm label{display:grid;gap:5px;font-size:9px;color:#687587}.goalForm input{padding:9px;border:1px solid #dce2e9;border-radius:8px;width:100%}@media(max-width:900px){.perfHero,.perfTwo{grid-template-columns:1fr}.goalGrid,.metricGrid{grid-template-columns:1fr 1fr}.goalForm{grid-template-columns:1fr 1fr}.perfHead{align-items:flex-start;flex-direction:column}}"
        }{" "}
      </style>
      <header className="perfHead">
        <div>
          <p className="eyebrow">PERFORMANCE • PILOTAGE</p>
          <h1>Comprendre, prévoir, agir.</h1>
          <p className="muted">
            Les indicateurs séparent toujours activité, conversion, potentiel et
            chiffre d’affaires réel.
          </p>
        </div>
        <button onClick={() => setEditing(!editing)}>
          {editing ? "Fermer" : "Modifier les objectifs"}
        </button>
      </header>
      {editing && (
        <form className="perfPanel goalForm" onSubmit={saveGoals}>
          {Object.entries(goals).map(([key, value]) => (
            <label key={key}>
              {key === "revenueTarget"
                ? "Objectif CA €"
                : key === "callsTarget"
                  ? "Objectif appels"
                  : key === "appointmentsTarget"
                    ? "Objectif RDV"
                    : "Objectif partenaires"}
              <input
                type="number"
                min="0"
                value={value}
                onChange={(e) =>
                  setGoals((old) => ({ ...old, [key]: Number(e.target.value) }))
                }
              />
            </label>
          ))}
          <button className="primary">Enregistrer</button>
        </form>
      )}
      <section className="perfHero">
        <div>
          <p className="eyebrow">PRÉVISION COMMERCIALE</p>
          <h2>Une vision fiable, sans mélanger estimé et réalisé.</h2>
          <p>
            Le potentiel du pipeline sert à anticiper. Les offres ouvertes
            montrent les décisions proches. Le chiffre d’affaires des
            interventions reste la mesure réelle.
          </p>
        </div>
        <div className="heroNumbers">
          <div>
            <small>CA RÉEL TOTAL</small>
            <b>{money(data.revenue.generated)}</b>
          </div>
          <div>
            <small>CA DU MOIS</small>
            <b>{money(data.revenue.monthRevenue)}</b>
          </div>
          <div>
            <small>PIPELINE ESTIMÉ</small>
            <b>{money(data.revenue.pipeline)}</b>
          </div>
          <div>
            <small>OFFRES OUVERTES</small>
            <b>{money(data.revenue.openOffers)}</b>
          </div>
        </div>
      </section>
      <section className="goalGrid">
        {goalCards.map(([label, current, target, isMoney]) => {
          const p = percent(Number(current), Number(target));
          return (
            <article className="goalCard" key={label}>
              <small>{label.toUpperCase()}</small>
              <b>{isMoney ? money(Number(current)) : current}</b>
              <div className="progress">
                <i style={{ width: Math.min(100, p) + "%" }} />
              </div>
              <em>
                {target
                  ? p +
                    "% de l’objectif " +
                    (isMoney ? money(Number(target)) : target)
                  : "Objectif à définir"}
              </em>
            </article>
          );
        })}
      </section>
      <section className="metricGrid">
        <article className="metricCard">
          <small>TAUX DE TRANSFORMATION</small>
          <b>{percent(data.funnel.won, decided)}%</b>
          <span>
            {data.funnel.won} gagné(s) / {decided} décidé(s)
          </span>
        </article>
        <article className="metricCard">
          <small>RÉPONSES E-MAILS</small>
          <b>{percent(data.emails.replies, data.emails.sent)}%</b>
          <span>
            {data.emails.replies} réponse(s), dont {data.emails.positiveReplies} positive(s) · {data.emails.activeCampaigns} campagne(s) active(s)
          </span>
        </article>
        <article className="metricCard">
          <small>APPELS POSITIFS</small>
          <b>{percent(data.calls.positive, data.calls.total)}%</b>
          <span>{data.calls.appointments} RDV obtenu(s)</span>
        </article>
        <article className="metricCard">
          <small>ACTIONS EN RETARD</small>
          <b className={data.risks.overdue ? "risk" : "good"}>
            {data.risks.overdue}
          </b>
          <span>{data.risks.stale} dossier(s) inactif(s)</span>
        </article>
      </section>
      <section className="perfTwo">
        <article className="perfPanel">
          <p className="eyebrow">ENTONNOIR</p>
          <h2>Conversion commerciale</h2>
          {funnel.map(([label, value]) => (
            <div className="funnelLine" key={label}>
              <span>{label}</span>
              <div className="bar">
                <i
                  style={{
                    width:
                      Math.max(3, percent(Number(value), data.funnel.total)) +
                      "%",
                  }}
                />
              </div>
              <b>{value}</b>
            </div>
          ))}
        </article>
        <article className="perfPanel">
          <p className="eyebrow">RECOMMANDATIONS</p>
          <h2>Priorités détectées</h2>
          {data.recommendations.map((item) => (
            <div className="recommendation" key={item.title}>
              <header>
                <b>{item.title}</b>
                <span className={item.level === "good" ? "good" : "risk"}>
                  {item.level === "urgent"
                    ? "Urgent"
                    : item.level === "good"
                      ? "Bon"
                      : "À surveiller"}
                </span>
              </header>
              <p>{item.detail}</p>
              <Link href={item.href}>Traiter maintenant →</Link>
            </div>
          ))}
        </article>
      </section>
      <section className="perfPanel">
        <p className="eyebrow">SECTEURS</p>
        <h2>Où se crée la valeur</h2>
        {data.rankings.map((item) => (
          <div className="rankingLine" key={item.label}>
            <span>{item.label}</span>
            <div className="bar">
              <i
                style={{
                  width:
                    Math.max(
                      3,
                      percent(
                        item.revenue,
                        Math.max(...data.rankings.map((x) => x.revenue), 1),
                      ),
                    ) + "%",
                }}
              />
            </div>
            <b>{money(item.revenue)}</b>
          </div>
        ))}
      </section>
    </div>
  );
}

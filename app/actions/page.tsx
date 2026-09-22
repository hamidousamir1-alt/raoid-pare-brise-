"use client";

import { useEffect, useState } from "react";

type Task = {
  id: string;
  prospect: string;
  title: string;
  priority: number;
  dueAt: string | null;
};
type Reply = {
  id: string;
  prospect: string;
  subject: string;
  preview: string;
  category: string;
  confidence: number;
  reviewStatus: string;
};
type ActionData = { tasks: Task[]; replies: Reply[] };
type Recommendation = {
  prospectId: string;
  prospect: string;
  status: string;
  priority: number;
  probability: number;
  action: string;
  channel: string;
  bestTime: string;
  cooling: string;
  reasons: string[];
  weightedPotential: number;
  contactKit: {
    subject: string;
    emailBody: string;
    callOpening: string;
    canEmail: boolean;
    canCall: boolean;
    context: string;
  };
  components: {
    fit: number;
    engagement: number;
    urgency: number;
    data: number;
  };
};
type IntelligenceData = {
  recommendations: Recommendation[];
  summary: {
    urgent: number;
    cooling: number;
    weightedPotential: number;
    averageProbability: number;
  };
};

const categories: Record<string, string> = {
  interested: "Intéressé / rendez-vous",
  callback: "À rappeler",
  information: "Demande d’informations",
  wrong_contact: "Mauvais interlocuteur",
  objection: "Objection commerciale",
  not_interested: "Pas intéressé",
  out_of_office: "Absence du bureau",
  unsubscribe: "Désinscription",
  ambiguous: "À qualifier",
};

export default function ActionsPage() {
  const [data, setData] = useState<ActionData>({ tasks: [], replies: [] });
  const [intelligence, setIntelligence] = useState<IntelligenceData | null>(
    null,
  );
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const [response, intelligenceResponse] = await Promise.all([
        fetch("/api/mailing", { cache: "no-store" }),
        fetch("/api/intelligence", { cache: "no-store" }),
      ]);
      if (response.status === 401) {
        location.href = "/login";
        return;
      }
      if (!response.ok) throw new Error();
      const payload = await response.json();
      setData({ tasks: payload.tasks || [], replies: payload.replies || [] });
      if (intelligenceResponse.ok)
        setIntelligence(await intelligenceResponse.json());
      setError("");
    } catch {
      setError(
        "Le centre d’actions sera disponible après la mise à jour de la base.",
      );
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function action(payload: Record<string, string>) {
    setBusy(payload.taskId || payload.messageId || "action");
    try {
      const response = await fetch("/api/mailing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      alert("L’action n’a pas pu être enregistrée.");
    } finally {
      setBusy("");
    }
  }

  async function recommendationAction(
    recommendation: Recommendation,
    command: "accept" | "snooze" | "dismiss",
  ) {
    setBusy(recommendation.prospectId);
    try {
      const response = await fetch("/api/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: command,
          prospectId: recommendation.prospectId,
          title: recommendation.action,
          channel: recommendation.channel,
          priority: recommendation.priority,
        }),
      });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      alert("La recommandation n’a pas pu être enregistrée.");
    } finally {
      setBusy("");
    }
  }

  async function copyText(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    alert(`${label} copié.`);
  }

  return (
    <main className="workspace actionPage">
      <style>{`.actionPage{display:grid;gap:18px}.actionHead{display:flex;justify-content:space-between;align-items:flex-end;gap:20px}.actionHead h1{margin:4px 0 7px}.actionScore{display:flex;gap:8px}.actionScore span{padding:10px 13px;border-radius:11px;background:#fff;border:1px solid #e3e8ed;font-size:11px}.actionScore b{color:#ef3340}.actionGrid{display:grid;grid-template-columns:.85fr 1.15fr;gap:18px}.actionPanel{background:#fff;border:1px solid #e7eaf0;border-radius:17px;padding:20px}.actionPanel h2{margin:2px 0 16px}.actionItem,.replyItem{padding:15px 0;border-top:1px solid #edf0f4}.actionItem:first-of-type,.replyItem:first-of-type{border-top:0}.actionItem header,.replyItem header{display:flex;justify-content:space-between;gap:12px}.actionItem p,.replyItem p{margin:7px 0;color:#687587;font-size:12px;line-height:1.5}.actionButtons,.replyChoice{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.actionButtons button,.replyChoice button{font-size:10px}.replyChoice select{flex:1;min-width:190px;padding:9px;border:1px solid #dce1e9;border-radius:9px;background:#fff}.actionEmpty{padding:18px;border-radius:12px;background:#f4f8f5;color:#28633d;font-size:12px}.confidence{font-size:10px;color:#985500;white-space:nowrap}.confidence.done{color:#176637}.intelPanel{background:#111827;color:#fff;border-radius:18px;padding:21px}.intelPanel h2{margin:3px 0 5px}.intelSummary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:17px 0}.intelSummary div{padding:12px;background:#ffffff0d;border:1px solid #ffffff18;border-radius:11px}.intelSummary small,.intelSummary b{display:block}.intelSummary b{font-size:21px;margin-top:5px}.intelList{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.intelCard{background:#fff;color:#172033;border-radius:14px;padding:15px}.intelCard header{display:flex;justify-content:space-between;gap:12px}.intelCard h3{margin:0;font-size:15px}.intelCard p{font-size:11px;line-height:1.45;margin:8px 0}.intelReasons{display:flex;gap:5px;flex-wrap:wrap}.intelReasons span{font-size:8px;padding:5px 7px;background:#f2f4f7;border-radius:7px}.intelBars{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin:10px 0}.intelBars small{font-size:7px;color:#687587}.intelBars b{display:block;font-size:11px}.intelActions{display:flex;gap:6px;flex-wrap:wrap}.intelActions button{font-size:9px}.intelMeta{color:#687587}@media(max-width:900px){.actionGrid,.intelList{grid-template-columns:1fr}.intelSummary{grid-template-columns:1fr 1fr}.actionHead{align-items:flex-start;flex-direction:column}.actionScore{width:100%}.actionScore span{flex:1}}`}</style>
      <style>{`.contactKit{margin:10px 0;padding:10px;border:1px solid #e7eaf0;border-radius:10px;background:#f8f9fb}.contactKit summary{cursor:pointer;font-size:10px;font-weight:700}.contactKit div{padding:10px 0;border-top:1px solid #e5e8ee}.contactKit div:first-of-type{margin-top:9px}.contactKit pre{white-space:pre-wrap;font:10px/1.55 inherit;color:#465267}.contactKit button{font-size:9px}.contactWarning{color:#a4453f!important}`}</style>
      <header className="actionHead">
        <div>
          <p className="eyebrow">CENTRE D’ACTIONS</p>
          <h1>Votre journée, déjà organisée.</h1>
          <p className="muted">
            Le CRM transforme les réponses et les échéances en actions
            concrètes.
          </p>
        </div>
        <div className="actionScore">
          <span>
            <b>{data.tasks.length}</b> actions
          </span>
          <span>
            <b>
              {data.replies.filter((r) => r.reviewStatus === "pending").length}
            </b>{" "}
            validations
          </span>
        </div>
      </header>
      {error && <section className="actionPanel">{error}</section>}
      {intelligence && (
        <section className="intelPanel">
          <p className="eyebrow">COPILOTE COMMERCIAL EXPLICABLE</p>
          <h2>Les actions qui ont le plus de chances d’avancer aujourd’hui</h2>
          <p>
            Chaque recommandation indique les signaux utilisés. Vous gardez
            toujours la décision.
          </p>
          <div className="intelSummary">
            <div>
              <small>PRIORITÉS FORTES</small>
              <b>{intelligence.summary.urgent}</b>
            </div>
            <div>
              <small>PROSPECTS À RÉACTIVER</small>
              <b>{intelligence.summary.cooling}</b>
            </div>
            <div>
              <small>PROBABILITÉ MOYENNE</small>
              <b>{intelligence.summary.averageProbability}%</b>
            </div>
            <div>
              <small>POTENTIEL PONDÉRÉ</small>
              <b>
                {new Intl.NumberFormat("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                  maximumFractionDigits: 0,
                }).format(intelligence.summary.weightedPotential)}
              </b>
            </div>
          </div>
          <div className="intelList">
            {intelligence.recommendations.slice(0, 10).map((item) => (
              <article className="intelCard" key={item.prospectId}>
                <header>
                  <div>
                    <h3>{item.prospect}</h3>
                    <small className="intelMeta">
                      {item.status} · {item.channel} · {item.bestTime}
                    </small>
                  </div>
                  <mark>{item.priority}/100</mark>
                </header>
                <p>
                  <b>{item.action}</b>
                </p>
                <div className="intelReasons">
                  {item.reasons.map((reason) => (
                    <span key={reason}>{reason}</span>
                  ))}
                </div>
                <div className="intelBars">
                  <small>
                    PROFIL<b>{item.components.fit}</b>
                  </small>
                  <small>
                    ENGAGEMENT<b>{item.components.engagement}</b>
                  </small>
                  <small>
                    URGENCE<b>{item.components.urgency}</b>
                  </small>
                  <small>
                    DONNÉES<b>{item.components.data}</b>
                  </small>
                </div>
                <p className="intelMeta">
                  {item.probability}% de probabilité estimée · potentiel pondéré{" "}
                  {new Intl.NumberFormat("fr-FR", {
                    style: "currency",
                    currency: "EUR",
                    maximumFractionDigits: 0,
                  }).format(item.weightedPotential)}{" "}
                  · {item.cooling}
                </p>
                <details className="contactKit">
                  <summary>
                    Préparer la prise de contact · {item.contactKit.context}
                  </summary>
                  <div>
                    <small>ACCROCHE TÉLÉPHONIQUE</small>
                    <p>{item.contactKit.callOpening}</p>
                    <button
                      onClick={() =>
                        copyText(
                          item.contactKit.callOpening,
                          "Accroche téléphonique",
                        )
                      }
                    >
                      Copier l’accroche
                    </button>
                  </div>
                  <div>
                    <small>OBJET DU MAIL</small>
                    <p>{item.contactKit.subject}</p>
                    <small>MESSAGE</small>
                    <pre>{item.contactKit.emailBody}</pre>
                    <button
                      onClick={() =>
                        copyText(
                          `${item.contactKit.subject}\n\n${item.contactKit.emailBody}`,
                          "E-mail",
                        )
                      }
                    >
                      Copier l’e-mail complet
                    </button>
                    {!item.contactKit.canEmail && (
                      <p className="contactWarning">
                        Adresse e-mail à compléter avant l’envoi.
                      </p>
                    )}
                  </div>
                </details>
                <div className="intelActions">
                  <button
                    className="primary"
                    disabled={busy === item.prospectId}
                    onClick={() => recommendationAction(item, "accept")}
                  >
                    Ajouter à mes actions
                  </button>
                  <button
                    disabled={busy === item.prospectId}
                    onClick={() => recommendationAction(item, "snooze")}
                  >
                    Reporter 3 jours
                  </button>
                  <button
                    disabled={busy === item.prospectId}
                    onClick={() => recommendationAction(item, "dismiss")}
                  >
                    Non pertinent
                  </button>
                  <a href={`/prospection?prospect=${item.prospectId}`}>
                    Voir la fiche
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="actionGrid">
        <div className="actionPanel">
          <p className="eyebrow">PRIORITÉS</p>
          <h2>À faire maintenant</h2>
          {data.tasks.length ? (
            data.tasks.map((task) => (
              <article className="actionItem" key={task.id}>
                <header>
                  <b>{task.prospect}</b>
                  <mark>{task.priority >= 90 ? "Urgent" : "À traiter"}</mark>
                </header>
                <p>{task.title}</p>
                <div className="actionButtons">
                  <button
                    className="primary"
                    disabled={busy === task.id}
                    onClick={() =>
                      action({ action: "complete_task", taskId: task.id })
                    }
                  >
                    Terminé
                  </button>
                  <button
                    disabled={busy === task.id}
                    onClick={() =>
                      action({ action: "dismiss_task", taskId: task.id })
                    }
                  >
                    Ignorer
                  </button>
                </div>
              </article>
            ))
          ) : (
            <p className="actionEmpty">Tout est à jour pour le moment.</p>
          )}
        </div>
        <div className="actionPanel">
          <p className="eyebrow">RÉPONSES</p>
          <h2>Décisions proposées par le CRM</h2>
          {data.replies.length ? (
            data.replies.map((reply) => (
              <article className="replyItem" key={reply.id}>
                <header>
                  <div>
                    <b>{reply.prospect}</b>
                    <p>{reply.subject}</p>
                  </div>
                  <span
                    className={`confidence ${reply.reviewStatus !== "pending" ? "done" : ""}`}
                  >
                    {reply.reviewStatus === "pending"
                      ? `${reply.confidence}% · à valider`
                      : "Validé"}
                  </span>
                </header>
                <p>{reply.preview || "Aperçu indisponible"}</p>
                <div className="replyChoice">
                  <select
                    value={choices[reply.id] || reply.category || "ambiguous"}
                    onChange={(event) =>
                      setChoices((old) => ({
                        ...old,
                        [reply.id]: event.target.value,
                      }))
                    }
                  >
                    {Object.entries(categories).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button
                    className="primary"
                    disabled={busy === reply.id}
                    onClick={() =>
                      action({
                        action: "review_reply",
                        messageId: reply.id,
                        category:
                          choices[reply.id] || reply.category || "ambiguous",
                      })
                    }
                  >
                    Valider
                  </button>
                </div>
              </article>
            ))
          ) : (
            <p className="muted">Aucune réponse reçue pour le moment.</p>
          )}
        </div>
      </section>
    </main>
  );
}

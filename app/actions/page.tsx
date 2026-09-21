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
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const response = await fetch("/api/mailing", { cache: "no-store" });
      if (response.status === 401) {
        location.href = "/login";
        return;
      }
      if (!response.ok) throw new Error();
      const payload = await response.json();
      setData({ tasks: payload.tasks || [], replies: payload.replies || [] });
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

  return (
    <main className="workspace actionPage">
      <style>{`.actionPage{display:grid;gap:18px}.actionHead{display:flex;justify-content:space-between;align-items:flex-end;gap:20px}.actionHead h1{margin:4px 0 7px}.actionScore{display:flex;gap:8px}.actionScore span{padding:10px 13px;border-radius:11px;background:#fff;border:1px solid #e3e8ed;font-size:11px}.actionScore b{color:#ef3340}.actionGrid{display:grid;grid-template-columns:.85fr 1.15fr;gap:18px}.actionPanel{background:#fff;border:1px solid #e7eaf0;border-radius:17px;padding:20px}.actionPanel h2{margin:2px 0 16px}.actionItem,.replyItem{padding:15px 0;border-top:1px solid #edf0f4}.actionItem:first-of-type,.replyItem:first-of-type{border-top:0}.actionItem header,.replyItem header{display:flex;justify-content:space-between;gap:12px}.actionItem p,.replyItem p{margin:7px 0;color:#687587;font-size:12px;line-height:1.5}.actionButtons,.replyChoice{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.actionButtons button,.replyChoice button{font-size:10px}.replyChoice select{flex:1;min-width:190px;padding:9px;border:1px solid #dce1e9;border-radius:9px;background:#fff}.actionEmpty{padding:18px;border-radius:12px;background:#f4f8f5;color:#28633d;font-size:12px}.confidence{font-size:10px;color:#985500;white-space:nowrap}.confidence.done{color:#176637}@media(max-width:900px){.actionGrid{grid-template-columns:1fr}.actionHead{align-items:flex-start;flex-direction:column}.actionScore{width:100%}.actionScore span{flex:1}}`}</style>
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

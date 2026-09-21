"use client";
import { useEffect, useMemo, useState } from "react";
type Prospect = {
  id: string;
  name: string;
  email: string | null;
  contactName: string | null;
  contactRole: string | null;
  emailStatus: string;
  doNotContact: boolean;
  status: string;
};
type Template = { id: string; name: string; subject: string; bodyText: string };
type Sequence = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  stopOnReply: boolean;
  steps: number;
};
type Message = {
  id: string;
  prospect: string;
  recipient: string;
  subject: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  error: string | null;
};
type Task = {
  id: string;
  title: string;
  taskType: string;
  priority: number;
  dueAt: string | null;
  prospectId: string;
  prospect: string;
  replyCategory: string | null;
};
type Reply = {
  id: string;
  prospectId: string;
  prospect: string;
  sender: string;
  subject: string;
  preview: string;
  receivedAt: string;
  category: string;
  confidence: number;
  reviewStatus: string;
};
type Data = {
  configured: boolean;
  sender: { name: string; email: string };
  stats: { scheduled: number; sent: number; replied: number; failed: number };
  prospects: Prospect[];
  templates: Template[];
  sequences: Sequence[];
  recent: Message[];
  tasks: Task[];
  replies: Reply[];
};
const labels: Record<string, string> = {
  scheduled: "Programmé",
  sent: "Envoyé",
  replied: "Répondu",
  failed: "Échec",
  draft: "Brouillon",
  cancelled: "Annulé",
};
const categoryLabels: Record<string, string> = {
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
export default function Messages() {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [prospectId, setProspectId] = useState(""),
    [templateId, setTemplateId] = useState(""),
    [sequenceId, setSequenceId] = useState(""),
    [when, setWhen] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Prospect | null>(null),
    [replyChoices, setReplyChoices] = useState<Record<string, string>>({});
  async function load() {
    setError("");
    const r = await fetch("/api/mailing", { cache: "no-store" });
    if (r.status === 401) {
      location.href = "/login";
      return;
    }
    if (!r.ok) {
      setError("Le module doit être initialisé dans la base de données.");
      return;
    }
    const d = await r.json();
    setData(d);
    if (!prospectId && d.prospects[0]) setProspectId(d.prospects[0].id);
    if (!templateId && d.templates[0]) setTemplateId(d.templates[0].id);
    if (!sequenceId && d.sequences[0]) setSequenceId(d.sequences[0].id);
  }
  useEffect(() => {
    load();
  }, []);
  const selected = useMemo(
    () => data?.prospects.find((p) => p.id === prospectId),
    [data, prospectId],
  );
  async function action(payload: unknown) {
    setBusy(true);
    try {
      const r = await fetch("/api/mailing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error || "operation_failed");
      await load();
      return true;
    } catch (e) {
      const code = e instanceof Error ? e.message : "operation_failed";
      alert(
        code === "do_not_contact"
          ? "Ce prospect est marqué Ne pas contacter."
          : code === "missing_email"
            ? "Ajoutez d’abord une adresse e-mail au prospect."
            : "Opération impossible.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function schedule(e: React.FormEvent) {
    e.preventDefault();
    await action({
      action: "schedule",
      prospectId,
      templateId,
      scheduledAt: when
        ? new Date(when).toISOString()
        : new Date().toISOString(),
    });
  }
  async function saveContact(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (
      await action({
        action: "update_contact",
        prospectId: editing.id,
        email: editing.email,
        contactName: editing.contactName,
        contactRole: editing.contactRole,
        doNotContact: editing.doNotContact,
      })
    )
      setEditing(null);
  }
  async function enroll() {
    await action({ action: "enroll", prospectId, sequenceId });
  }
  async function closeTask(taskId: string, dismiss = false) {
    await action({
      action: dismiss ? "dismiss_task" : "complete_task",
      taskId,
    });
  }
  async function reviewReply(messageId: string, category: string) {
    await action({ action: "review_reply", messageId, category });
  }
  return (
    <main className="workspace mailingPage">
      <style>{`.mailingPage{display:grid;gap:18px}.mailHead{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}.mailHead h1{margin:3px 0 8px}.mailState{padding:10px 13px;border-radius:10px;background:#fff4e5;color:#8a4b08;font-size:12px}.mailState.ready{background:#eaf8ef;color:#176637}.mailKpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.mailKpis article,.mailPanel{background:#fff;border:1px solid #e7eaf0;border-radius:16px;padding:20px}.mailKpis small{display:block;color:#788396;font-size:10px;margin-bottom:8px}.mailKpis strong{font-size:27px}.mailGrid,.actionCenter{display:grid;grid-template-columns:minmax(300px,.8fr) minmax(420px,1.2fr);gap:18px}.mailPanel h2{margin:0 0 16px}.mailForm{display:grid;gap:14px}.mailForm label{font-size:11px;color:#566174}.mailForm select,.mailForm input{display:block;width:100%;margin-top:7px;padding:11px;border:1px solid #dce1e9;border-radius:9px;background:white}.mailForm button{justify-self:start}.contactLine{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid #edf0f4}.contactLine:first-of-type{border-top:0}.contactLine small{display:block;color:#7b8698;margin-top:4px}.contactLine button{font-size:11px}.history{display:grid;gap:9px}.history article{display:grid;grid-template-columns:1fr auto;gap:8px;padding:12px;border:1px solid #edf0f4;border-radius:10px}.history small{color:#7b8698}.history mark{align-self:start}.smartTask,.replyCard{padding:14px 0;border-top:1px solid #edf0f4}.smartTask:first-of-type,.replyCard:first-of-type{border-top:0}.smartTask header,.replyCard header{display:flex;justify-content:space-between;gap:10px}.smartTask p,.replyCard p{margin:7px 0;color:#657186;font-size:12px;line-height:1.5}.taskButtons,.replyReview{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.taskButtons button,.replyReview button{font-size:10px}.replyReview select{flex:1;min-width:180px;padding:9px;border:1px solid #dce1e9;border-radius:9px;background:#fff}.confidence{white-space:nowrap;color:#a45b00;font-size:10px}.reviewed{color:#18713c}.emptyAction{padding:18px;border-radius:12px;background:#f4f8f5;color:#28633d;font-size:12px}.mailModal{position:fixed;inset:0;background:#10182766;display:grid;place-items:center;z-index:30}.mailModal form{width:min(92vw,520px);background:#fff;border-radius:18px;padding:24px;display:grid;gap:14px}.mailModal input{width:100%;padding:11px;border:1px solid #dce1e9;border-radius:9px}.check{display:flex;gap:8px;align-items:center}.mailActions{display:flex;justify-content:flex-end;gap:10px}@media(max-width:900px){.mailGrid,.actionCenter{grid-template-columns:1fr}.mailKpis{grid-template-columns:repeat(2,1fr)}.mailHead{flex-wrap:wrap}}`}</style>
      <header className="mailHead">
        <div>
          <p className="eyebrow">MAILING & RELANCES</p>
          <h1>Messages</h1>
          <p className="muted">
            Prépare, programme et suis les relances sans perdre le fil
            commercial.
          </p>
        </div>
        {data && (
          <div className={`mailState ${data.configured ? "ready" : ""}`}>
            {data.configured
              ? "Outlook connecté"
              : "Mode préparation — aucun envoi réel"}
            <br />
            <b>{data.sender.name}</b> · {data.sender.email}
          </div>
        )}
      </header>
      {error && (
        <section className="mailPanel">
          <b>{error}</b>
          <p>Appliquez le nouveau schéma SQL, puis rechargez cette page.</p>
        </section>
      )}
      {data && (
        <>
          <section className="mailKpis">
            <article>
              <small>PROGRAMMÉS</small>
              <strong>{data.stats?.scheduled || 0}</strong>
            </article>
            <article>
              <small>ENVOYÉS</small>
              <strong>{data.stats?.sent || 0}</strong>
            </article>
            <article>
              <small>RÉPONSES</small>
              <strong>{data.stats?.replied || 0}</strong>
            </article>
            <article>
              <small>ÉCHECS</small>
              <strong>{data.stats?.failed || 0}</strong>
            </article>
          </section>
          <section className="actionCenter">
            <div className="mailPanel">
              <p className="eyebrow">ACTIONS INTELLIGENTES</p>
              <h2>À faire maintenant</h2>
              {data.tasks.length ? (
                data.tasks.map((task) => (
                  <article className="smartTask" key={task.id}>
                    <header>
                      <b>{task.prospect}</b>
                      <mark>
                        {task.priority >= 90 ? "Urgent" : "À traiter"}
                      </mark>
                    </header>
                    <p>{task.title}</p>
                    <div className="taskButtons">
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => closeTask(task.id)}
                      >
                        Terminé
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => closeTask(task.id, true)}
                      >
                        Ignorer
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className="emptyAction">Aucune action en retard.</p>
              )}
            </div>
            <div className="mailPanel">
              <p className="eyebrow">BOÎTE DE RÉCEPTION INTELLIGENTE</p>
              <h2>Réponses détectées</h2>
              {data.replies.length ? (
                data.replies.map((reply) => (
                  <article className="replyCard" key={reply.id}>
                    <header>
                      <div>
                        <b>{reply.prospect}</b>
                        <p>{reply.subject}</p>
                      </div>
                      <span
                        className={`confidence ${reply.reviewStatus !== "pending" ? "reviewed" : ""}`}
                      >
                        {reply.reviewStatus === "pending"
                          ? `${reply.confidence}% · à valider`
                          : "Validé"}
                      </span>
                    </header>
                    <p>{reply.preview || "Aperçu indisponible"}</p>
                    <div className="replyReview">
                      <select
                        aria-label={`Catégorie de la réponse de ${reply.prospect}`}
                        value={
                          replyChoices[reply.id] ||
                          reply.category ||
                          "ambiguous"
                        }
                        onChange={(e) =>
                          setReplyChoices((old) => ({
                            ...old,
                            [reply.id]: e.target.value,
                          }))
                        }
                        disabled={busy}
                      >
                        {Object.entries(categoryLabels).map(
                          ([value, label]) => (
                            <option value={value} key={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          reviewReply(
                            reply.id,
                            replyChoices[reply.id] ||
                              reply.category ||
                              "ambiguous",
                          )
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
          <section className="mailGrid">
            <div className="mailPanel">
              <h2>Programmer un message</h2>
              <form className="mailForm" onSubmit={schedule}>
                <label>
                  Prospect
                  <select
                    value={prospectId}
                    onChange={(e) => setProspectId(e.target.value)}
                  >
                    {data.prospects.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                        {p.email ? ` — ${p.email}` : " — e-mail manquant"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Modèle
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                  >
                    {data.templates.map((t) => (
                      <option value={t.id} key={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Date et heure
                  <input
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                  />
                </label>
                {selected && !selected.email && (
                  <p className="muted">
                    Ajoutez l’e-mail de {selected.name} avant de programmer
                    l’envoi.
                  </p>
                )}
                <button
                  className="primary"
                  disabled={busy || !prospectId || !templateId}
                >
                  Programmer
                </button>
              </form>
              <hr
                style={{
                  border: 0,
                  borderTop: "1px solid #edf0f4",
                  margin: "22px 0",
                }}
              />
              <h2>Lancer une séquence</h2>
              <div className="mailForm">
                <label>
                  Parcours automatique
                  <select
                    value={sequenceId}
                    onChange={(e) => setSequenceId(e.target.value)}
                  >
                    {data.sequences.map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.name} — {s.steps} étapes
                      </option>
                    ))}
                  </select>
                </label>
                <p className="muted">
                  Les relances s’arrêtent automatiquement dès qu’une réponse est
                  détectée.
                </p>
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !prospectId || !sequenceId}
                  onClick={enroll}
                >
                  Démarrer la séquence
                </button>
              </div>
            </div>
            <div className="mailPanel">
              <h2>Contacts à compléter</h2>
              {data.prospects.slice(0, 8).map((p) => (
                <div className="contactLine" key={p.id}>
                  <div>
                    <b>{p.name}</b>
                    <small>
                      {p.contactName || "Décideur non renseigné"} ·{" "}
                      {p.email || "E-mail manquant"}
                    </small>
                  </div>
                  <button onClick={() => setEditing({ ...p })}>
                    Compléter
                  </button>
                </div>
              ))}
            </div>
          </section>
          <section className="mailPanel">
            <h2>Historique récent</h2>
            <div className="history">
              {data.recent.length ? (
                data.recent.map((m) => (
                  <article key={m.id}>
                    <div>
                      <b>{m.prospect}</b>
                      <small>
                        {m.subject} · {m.recipient}
                      </small>
                    </div>
                    <mark>{labels[m.status] || m.status}</mark>
                  </article>
                ))
              ) : (
                <p className="muted">Aucun message pour le moment.</p>
              )}
            </div>
          </section>
        </>
      )}
      {editing && (
        <div className="mailModal" onMouseDown={() => setEditing(null)}>
          <form onSubmit={saveContact} onMouseDown={(e) => e.stopPropagation()}>
            <h2>{editing.name}</h2>
            <label>
              E-mail professionnel
              <input
                required
                type="email"
                value={editing.email || ""}
                onChange={(e) =>
                  setEditing({ ...editing, email: e.target.value })
                }
              />
            </label>
            <label>
              Décideur
              <input
                value={editing.contactName || ""}
                onChange={(e) =>
                  setEditing({ ...editing, contactName: e.target.value })
                }
              />
            </label>
            <label>
              Fonction
              <input
                value={editing.contactRole || ""}
                onChange={(e) =>
                  setEditing({ ...editing, contactRole: e.target.value })
                }
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={editing.doNotContact}
                onChange={(e) =>
                  setEditing({ ...editing, doNotContact: e.target.checked })
                }
              />{" "}
              Ne pas contacter
            </label>
            <div className="mailActions">
              <button type="button" onClick={() => setEditing(null)}>
                Annuler
              </button>
              <button className="primary" disabled={busy}>
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

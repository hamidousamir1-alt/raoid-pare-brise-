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
  sector: string | null;
  zone: string | null;
  companySize: string | null;
  fleetCount: number | null;
  score: number;
};
type Template = {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
  scenarioKey: string | null;
  category: string;
  situation: string;
  recommendedDelayDays: number;
  requiresFieldVisit: boolean;
  tone: string;
  active: boolean;
};
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
type CampaignForm = {
  name: string;
  zone: string;
  sector: string;
  companySize: string;
  minimumFleet: string;
  minimumScore: string;
  sequenceId: string;
  startsAt: string;
  dailyLimit: string;
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
const localInput = (date: Date) => {
  const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return copy.toISOString().slice(0, 16);
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
    [editingTemplate, setEditingTemplate] = useState<Template | null>(null),
    [templateCategory, setTemplateCategory] = useState("Toutes"),
    [replyChoices, setReplyChoices] = useState<Record<string, string>>({}),
    [campaignResult, setCampaignResult] = useState("");
  const [campaign, setCampaign] = useState<CampaignForm>(() => {
    const start = new Date(Date.now() + 86400_000);
    start.setHours(9, 0, 0, 0);
    return {
      name: "Campagne prospection entreprises",
      zone: "Toutes",
      sector: "Tous",
      companySize: "Toutes",
      minimumFleet: "0",
      minimumScore: "0",
      sequenceId: "",
      startsAt: localInput(start),
      dailyLimit: "20",
    };
  });
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
    const presenceSequence = d.sequences.find((sequence: Sequence) =>
      sequence.name.startsWith("Présence Rapid Pare-Brise"),
    );
    if (!prospectId && d.prospects[0]) setProspectId(d.prospects[0].id);
    if (!templateId && d.templates[0]) setTemplateId(d.templates[0].id);
    if (!sequenceId && d.sequences[0]) setSequenceId(d.sequences[0].id);
    if (!campaign.sequenceId && (presenceSequence || d.sequences[0]))
      setCampaign((old) => ({
        ...old,
        sequenceId: (presenceSequence || d.sequences[0]).id,
      }));
  }
  useEffect(() => {
    load();
  }, []);
  const selected = useMemo(
    () => data?.prospects.find((p) => p.id === prospectId),
    [data, prospectId],
  );
  const templateCategories = useMemo(
    () => [
      "Toutes",
      ...Array.from(new Set(data?.templates.map((t) => t.category) || [])),
    ],
    [data],
  );
  const visibleTemplates = useMemo(
    () =>
      data?.templates.filter(
        (template) =>
          templateCategory === "Toutes" ||
          template.category === templateCategory,
      ) || [],
    [data, templateCategory],
  );
  const campaignOptions = useMemo(() => {
    const prospects = data?.prospects || [];
    return {
      zones: [
        "Toutes",
        ...Array.from(new Set(prospects.map((p) => p.zone).filter(Boolean))) as string[],
      ],
      sectors: [
        "Tous",
        ...Array.from(new Set(prospects.map((p) => p.sector).filter(Boolean))) as string[],
      ],
      sizes: [
        "Toutes",
        ...Array.from(new Set(prospects.map((p) => p.companySize).filter(Boolean))) as string[],
      ],
    };
  }, [data]);
  const campaignPreview = useMemo(() => {
    const seen = new Set<string>();
    const excluded = { missingEmail: 0, refused: 0, invalid: 0, duplicate: 0, filter: 0 };
    const eligible: Prospect[] = [];
    for (const prospect of data?.prospects || []) {
      const matches =
        (campaign.zone === "Toutes" || prospect.zone === campaign.zone) &&
        (campaign.sector === "Tous" || prospect.sector === campaign.sector) &&
        (campaign.companySize === "Toutes" || prospect.companySize === campaign.companySize) &&
        Number(prospect.fleetCount || 0) >= Number(campaign.minimumFleet || 0) &&
        Number(prospect.score || 0) >= Number(campaign.minimumScore || 0) &&
        !["Gagné", "Perdu"].includes(prospect.status);
      if (!matches) { excluded.filter += 1; continue; }
      if (prospect.doNotContact) { excluded.refused += 1; continue; }
      if (!prospect.email) { excluded.missingEmail += 1; continue; }
      if (["Invalide", "Rejeté", "Bounce"].includes(prospect.emailStatus)) { excluded.invalid += 1; continue; }
      const email = prospect.email.toLowerCase();
      if (seen.has(email)) { excluded.duplicate += 1; continue; }
      seen.add(email);
      eligible.push(prospect);
    }
    return { eligible, excluded };
  }, [campaign, data]);
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
      return d;
    } catch (e) {
      const code = e instanceof Error ? e.message : "operation_failed";
      alert(
        code === "do_not_contact"
          ? "Ce prospect est marqué Ne pas contacter."
          : code === "missing_email"
            ? "Ajoutez d’abord une adresse e-mail au prospect."
            : "Opération impossible.",
      );
      return null;
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
  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTemplate) return;
    if (
      await action({
        action: "update_template",
        templateId: editingTemplate.id,
        name: editingTemplate.name,
        subject: editingTemplate.subject,
        bodyText: editingTemplate.bodyText,
        category: editingTemplate.category,
        situation: editingTemplate.situation,
        recommendedDelayDays: editingTemplate.recommendedDelayDays,
        tone: editingTemplate.tone,
      })
    )
      setEditingTemplate(null);
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
  async function launchCampaign(event: React.FormEvent) {
    event.preventDefault();
    setCampaignResult("");
    const result = await action({
      action: "bulk_enroll",
      campaignName: campaign.name,
      sequenceId: campaign.sequenceId,
      prospectIds: campaignPreview.eligible.map((prospect) => prospect.id),
      startsAt: new Date(campaign.startsAt).toISOString(),
      dailyLimit: Number(campaign.dailyLimit),
    });
    if (result)
      setCampaignResult(
        `${result.enrolled || 0} entreprise(s) programmée(s)${result.skipped ? ` · ${result.skipped} déjà inscrite(s) ou exclue(s)` : ""}.`,
      );
  }
  return (
    <main className="workspace mailingPage">
      <style>{`.mailingPage{display:grid;gap:18px}.mailHead{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}.mailHead h1{margin:3px 0 8px}.mailState{padding:10px 13px;border-radius:10px;background:#fff4e5;color:#8a4b08;font-size:12px}.mailState.ready{background:#eaf8ef;color:#176637}.mailKpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.mailKpis article,.mailPanel{background:#fff;border:1px solid #e7eaf0;border-radius:16px;padding:20px}.mailKpis small{display:block;color:#788396;font-size:10px;margin-bottom:8px}.mailKpis strong{font-size:27px}.mailGrid,.actionCenter{display:grid;grid-template-columns:minmax(300px,.8fr) minmax(420px,1.2fr);gap:18px}.mailPanel h2{margin:0 0 16px}.mailForm{display:grid;gap:14px}.mailForm label{font-size:11px;color:#566174}.mailForm select,.mailForm input,.templateToolbar select{display:block;width:100%;margin-top:7px;padding:11px;border:1px solid #dce1e9;border-radius:9px;background:white}.mailForm button{justify-self:start}.campaignBuilder{display:grid;grid-template-columns:1.2fr .8fr;gap:18px}.campaignFilters{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.campaignFilters .wide{grid-column:span 2}.campaignPreview{padding:18px;border-radius:14px;background:#f5f7f9}.campaignPreview strong{display:block;font-size:34px}.campaignPreview ul{padding-left:18px;color:#647185;font-size:11px;line-height:1.7}.campaignResult{padding:11px;border-radius:9px;background:#eaf8ef;color:#176637}.contactLine{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid #edf0f4}.contactLine:first-of-type{border-top:0}.contactLine small{display:block;color:#7b8698;margin-top:4px}.contactLine button{font-size:11px}.history{display:grid;gap:9px}.history article{display:grid;grid-template-columns:1fr auto;gap:8px;padding:12px;border:1px solid #edf0f4;border-radius:10px}.history small{color:#7b8698}.history mark{align-self:start}.smartTask,.replyCard{padding:14px 0;border-top:1px solid #edf0f4}.smartTask:first-of-type,.replyCard:first-of-type{border-top:0}.smartTask header,.replyCard header,.templateHead{display:flex;justify-content:space-between;gap:10px}.smartTask p,.replyCard p{margin:7px 0;color:#657186;font-size:12px;line-height:1.5}.taskButtons,.replyReview,.templateActions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.taskButtons button,.replyReview button,.templateActions button{font-size:10px}.replyReview select{flex:1;min-width:180px;padding:9px;border:1px solid #dce1e9;border-radius:9px;background:#fff}.confidence{white-space:nowrap;color:#a45b00;font-size:10px}.reviewed{color:#18713c}.emptyAction{padding:18px;border-radius:12px;background:#f4f8f5;color:#28633d;font-size:12px}.templateToolbar{width:min(100%,270px);margin-bottom:16px}.templateGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.templateCard{border:1px solid #e7eaf0;border-radius:13px;padding:15px;display:grid;gap:9px}.templateCard p{margin:0;color:#657186;font-size:12px;line-height:1.45}.templateMeta{display:flex;gap:6px;flex-wrap:wrap}.templateMeta span{font-size:9px;padding:5px 7px;background:#f3f5f8;border-radius:99px;color:#566174}.mailModal{position:fixed;inset:0;background:#10182766;display:grid;place-items:center;z-index:30;padding:15px}.mailModal form{width:min(92vw,620px);max-height:92vh;overflow:auto;background:#fff;border-radius:18px;padding:24px;display:grid;gap:14px}.mailModal input,.mailModal select,.mailModal textarea{width:100%;padding:11px;border:1px solid #dce1e9;border-radius:9px;background:#fff}.mailModal textarea{min-height:230px;resize:vertical}.check{display:flex;gap:8px;align-items:center}.mailActions{display:flex;justify-content:flex-end;gap:10px}@media(max-width:1000px){.templateGrid{grid-template-columns:repeat(2,1fr)}.campaignBuilder{grid-template-columns:1fr}}@media(max-width:900px){.mailGrid,.actionCenter{grid-template-columns:1fr}.mailKpis{grid-template-columns:repeat(2,1fr)}.mailHead{flex-wrap:wrap}}@media(max-width:620px){.templateGrid{grid-template-columns:1fr}.mailPanel{padding:16px}.mailKpis{gap:9px}.mailKpis article{padding:14px}.campaignFilters{grid-template-columns:1fr}.campaignFilters .wide{grid-column:auto}}`}</style>
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
          <section className="mailPanel">
            <p className="eyebrow">CAMPAGNE CIBLÉE</p>
            <h2>Créer une campagne de prospection</h2>
            <div className="campaignBuilder">
              <form className="mailForm" onSubmit={launchCampaign}>
                <div className="campaignFilters">
                  <label className="wide">Nom de la campagne
                    <input required value={campaign.name} onChange={(event) => setCampaign({ ...campaign, name: event.target.value })} />
                  </label>
                  <label>Zone
                    <select value={campaign.zone} onChange={(event) => setCampaign({ ...campaign, zone: event.target.value })}>{campaignOptions.zones.map((item) => <option key={item}>{item}</option>)}</select>
                  </label>
                  <label>Secteur
                    <select value={campaign.sector} onChange={(event) => setCampaign({ ...campaign, sector: event.target.value })}>{campaignOptions.sectors.map((item) => <option key={item}>{item}</option>)}</select>
                  </label>
                  <label>Taille d’entreprise
                    <select value={campaign.companySize} onChange={(event) => setCampaign({ ...campaign, companySize: event.target.value })}>{campaignOptions.sizes.map((item) => <option key={item}>{item}</option>)}</select>
                  </label>
                  <label>Flotte minimale
                    <select value={campaign.minimumFleet} onChange={(event) => setCampaign({ ...campaign, minimumFleet: event.target.value })}><option value="0">Toutes</option><option value="2">2 véhicules</option><option value="5">5 véhicules</option><option value="10">10 véhicules</option><option value="20">20 véhicules</option></select>
                  </label>
                  <label>Score minimal
                    <select value={campaign.minimumScore} onChange={(event) => setCampaign({ ...campaign, minimumScore: event.target.value })}><option value="0">Tous</option><option value="50">50+</option><option value="65">65+</option><option value="80">80+</option></select>
                  </label>
                  <label className="wide">Séquence automatique
                    <select required value={campaign.sequenceId} onChange={(event) => setCampaign({ ...campaign, sequenceId: event.target.value })}>{data.sequences.map((item) => <option value={item.id} key={item.id}>{item.name} — {item.steps} étapes</option>)}</select>
                  </label>
                  <label>Début
                    <input required type="datetime-local" value={campaign.startsAt} onChange={(event) => setCampaign({ ...campaign, startsAt: event.target.value })} />
                  </label>
                  <label>Maximum par jour
                    <select value={campaign.dailyLimit} onChange={(event) => setCampaign({ ...campaign, dailyLimit: event.target.value })}><option value="10">10</option><option value="20">20</option><option value="30">30</option><option value="50">50</option></select>
                  </label>
                </div>
                <button className="primary" disabled={busy || !campaign.sequenceId || campaignPreview.eligible.length === 0}>Valider et programmer la campagne</button>
                {campaignResult && <p className="campaignResult">✓ {campaignResult}</p>}
              </form>
              <aside className="campaignPreview">
                <small>DESTINATAIRES ÉLIGIBLES</small>
                <strong>{campaignPreview.eligible.length}</strong>
                <p>Entreprises correspondant aux critères et autorisées à recevoir la campagne.</p>
                <ul>
                  <li>{campaignPreview.excluded.missingEmail} sans adresse e-mail</li>
                  <li>{campaignPreview.excluded.refused} en « ne pas contacter »</li>
                  <li>{campaignPreview.excluded.invalid} adresse invalide ou rejetée</li>
                  <li>{campaignPreview.excluded.duplicate} doublon d’adresse retiré</li>
                </ul>
                <p className="muted">Les partenaires gagnés et prospects perdus sont automatiquement exclus. Les relances s’arrêtent dès qu’une réponse est détectée.</p>
                {data.sequences.find((item) => item.id === campaign.sequenceId)?.name.startsWith("Présence Rapid Pare-Brise") && (
                  <p><b>Cadence :</b> J0 · J+7 · J+14 · J+21 · J+35, puis pause de 90 jours.</p>
                )}
              </aside>
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
            <p className="eyebrow">BIBLIOTHÈQUE COMMERCIALE</p>
            <h2>Scénarios d’e-mails</h2>
            <label className="templateToolbar">
              Filtrer par situation
              <select
                value={templateCategory}
                onChange={(e) => setTemplateCategory(e.target.value)}
              >
                {templateCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <div className="templateGrid">
              {visibleTemplates.map((template) => (
                <article className="templateCard" key={template.id}>
                  <div className="templateHead">
                    <b>{template.name}</b>
                    <mark>{template.category}</mark>
                  </div>
                  <p>{template.situation || template.subject}</p>
                  <div className="templateMeta">
                    <span>{template.tone}</span>
                    <span>J+{template.recommendedDelayDays}</span>
                    {template.requiresFieldVisit ? (
                      <span>Après passage</span>
                    ) : null}
                  </div>
                  <div className="templateActions">
                    <button
                      className="primary"
                      onClick={() => setTemplateId(template.id)}
                    >
                      Utiliser
                    </button>
                    <button onClick={() => setEditingTemplate({ ...template })}>
                      Modifier
                    </button>
                  </div>
                </article>
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
      {editingTemplate && (
        <div className="mailModal" onMouseDown={() => setEditingTemplate(null)}>
          <form
            onSubmit={saveTemplate}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2>Modifier le scénario</h2>
            <label>
              Nom
              <input
                required
                value={editingTemplate.name}
                onChange={(e) =>
                  setEditingTemplate({
                    ...editingTemplate,
                    name: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Catégorie
              <input
                required
                value={editingTemplate.category}
                onChange={(e) =>
                  setEditingTemplate({
                    ...editingTemplate,
                    category: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Situation d’utilisation
              <input
                value={editingTemplate.situation}
                onChange={(e) =>
                  setEditingTemplate({
                    ...editingTemplate,
                    situation: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Objet
              <input
                required
                value={editingTemplate.subject}
                onChange={(e) =>
                  setEditingTemplate({
                    ...editingTemplate,
                    subject: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Message
              <textarea
                required
                value={editingTemplate.bodyText}
                onChange={(e) =>
                  setEditingTemplate({
                    ...editingTemplate,
                    bodyText: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Délai conseillé en jours
              <input
                type="number"
                min="0"
                max="365"
                value={editingTemplate.recommendedDelayDays}
                onChange={(e) =>
                  setEditingTemplate({
                    ...editingTemplate,
                    recommendedDelayDays: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Ton
              <input
                value={editingTemplate.tone}
                onChange={(e) =>
                  setEditingTemplate({
                    ...editingTemplate,
                    tone: e.target.value,
                  })
                }
              />
            </label>
            <div className="mailActions">
              <button type="button" onClick={() => setEditingTemplate(null)}>
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

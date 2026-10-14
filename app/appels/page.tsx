"use client";

import { useEffect, useMemo, useState } from "react";

type Prospect = {
  id: string;
  name: string;
  phone?: string;
  status: string;
  nextAction?: string;
  contactName?: string;
};
type Call = {
  id: string;
  prospectId: string;
  prospect: string;
  contact?: string;
  direction: string;
  outcome: string;
  startedAt: string;
  durationSeconds: number;
  notes?: string;
  nextAction?: string;
  nextActionAt?: string;
  previousStatus?: string;
  resultingStatus?: string;
};
type Data = {
  prospects: Prospect[];
  calls: Call[];
  stats: {
    today: number;
    week: number;
    appointmentsThisMonth: number;
    todaySeconds: number;
  };
};

const outcomes: Record<string, string> = {
  answered: "Échange réalisé",
  no_answer: "Sans réponse",
  callback: "À rappeler",
  interested: "Intéressé",
  appointment: "Rendez-vous convenu",
  information: "Informations demandées",
  wrong_contact: "Mauvais interlocuteur",
  not_interested: "Pas intéressé",
};
const proposal: Record<
  string,
  { status: string; action: string; days: number }
> = {
  answered: { status: "Qualifié", action: "Envoyer un récapitulatif", days: 1 },
  no_answer: { status: "Relance", action: "Rappeler l’entreprise", days: 2 },
  callback: {
    status: "Relance",
    action: "Rappeler au créneau convenu",
    days: 1,
  },
  interested: {
    status: "Qualifié",
    action: "Convenir d’un rendez-vous",
    days: 1,
  },
  appointment: { status: "RDV", action: "Préparer le rendez-vous", days: 2 },
  information: {
    status: "Qualifié",
    action: "Envoyer les informations demandées",
    days: 0,
  },
  wrong_contact: {
    status: "À contacter",
    action: "Identifier le bon interlocuteur",
    days: 2,
  },
  not_interested: { status: "Perdu", action: "", days: 0 },
};

function localDate(days = 0, hour = 10) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function CallsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [prospectId, setProspectId] = useState("");
  const [prospectSearch, setProspectSearch] = useState("");
  const [showNewProspect, setShowNewProspect] = useState(false);
  const [newProspectName, setNewProspectName] = useState("");
  const [newProspectPhone, setNewProspectPhone] = useState("");
  const [newProspectContact, setNewProspectContact] = useState("");
  const [creatingProspect, setCreatingProspect] = useState(false);
  const [direction, setDirection] = useState("outbound");
  const [outcome, setOutcome] = useState("answered");
  const [duration, setDuration] = useState("3");
  const [notes, setNotes] = useState("");
  const [resultingStatus, setResultingStatus] = useState("Qualifié");
  const [nextAction, setNextAction] = useState("Envoyer un récapitulatif");
  const [nextActionAt, setNextActionAt] = useState(localDate(1));
  const [appointmentStartsAt, setAppointmentStartsAt] = useState(
    localDate(2, 9),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [callFeedback, setCallFeedback] = useState("");
  const [callFeedbackError, setCallFeedbackError] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  async function load() {
    try {
      const response = await fetch("/api/calls", { cache: "no-store" });
      if (response.status === 401) {
        location.href = "/login";
        return;
      }
      if (!response.ok) throw new Error();
      const payload = (await response.json()) as Data;
      setData(payload);
      const requested = new URLSearchParams(location.search).get("prospect");
      const initialId =
        requested && payload.prospects.some((p) => p.id === requested)
          ? requested
          : payload.prospects[0]?.id || "";
      setProspectId((current) => current || initialId);
      setProspectSearch((current) =>
        current ||
        payload.prospects.find((p) => p.id === (prospectId || initialId))
          ?.name ||
        "",
      );
      setError("");
    } catch {
      setError(
        "Le journal d’appels sera disponible après la mise à jour de la base.",
      );
    }
  }

  useEffect(() => {
    load();
  }, []);

  const selected = useMemo(
    () => data?.prospects.find((prospect) => prospect.id === prospectId),
    [data, prospectId],
  );

  const searchResults = (data?.prospects || [])
    .filter((prospect) => {
      const query = prospectSearch.trim().toLocaleLowerCase("fr");
      return (
        query &&
        [prospect.name, prospect.phone, prospect.contactName]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase("fr").includes(query))
      );
    })
    .slice(0, 8);

  function chooseProspect(prospect: Prospect) {
    setProspectId(prospect.id);
    setProspectSearch(prospect.name);
    setShowNewProspect(false);
  }

  async function createProspect() {
    if (!newProspectName.trim()) return;
    setCreatingProspect(true);
    setError("");
    try {
      const response = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProspectName.trim(),
          phone: newProspectPhone.trim(),
          contactName: newProspectContact.trim(),
          leadSource: "Prospection téléphonique",
          status: "Nouveau",
          notes: "Prospect créé depuis l’onglet Appels.",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.item?.id)
        throw new Error(
          response.status === 401
            ? "Votre session a expiré. Reconnectez-vous pour créer ce prospect."
            : "Le prospect n’a pas pu être créé. Vérifiez les informations et réessayez.",
        );
      const prospect = payload.item as Prospect;
      setData((current) =>
        current
          ? {
              ...current,
              prospects: [prospect, ...current.prospects].sort((a, b) =>
                a.name.localeCompare(b.name, "fr"),
              ),
            }
          : current,
      );
      chooseProspect(prospect);
      setNewProspectName("");
      setNewProspectPhone("");
      setNewProspectContact("");
      setCallFeedbackError(false);
      setCallFeedback(
        "Entreprise enregistrée et sélectionnée. Le compte rendu de l’appel s’enregistre séparément.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Le prospect n’a pas pu être créé.",
      );
    } finally {
      setCreatingProspect(false);
    }
  }

  function chooseOutcome(value: string) {
    const next = proposal[value];
    setOutcome(value);
    setResultingStatus(next.status);
    setNextAction(next.action);
    const date = localDate(value === "appointment" ? 1 : next.days);
    setNextActionAt(date);
    if (value === "appointment") setAppointmentStartsAt(localDate(2, 9));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setCallFeedback("");
    setCallFeedbackError(false);
    try {
      const response = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectId,
          direction,
          outcome,
          durationSeconds: Math.round(Number(duration) * 60),
          notes,
          resultingStatus,
          nextAction,
          nextActionAt:
            outcome === "not_interested" ? null : nextActionAt || null,
          appointmentStartsAt:
            outcome === "appointment" ? appointmentStartsAt : null,
        }),
      });
      if (response.status === 401) {
        location.href = "/login";
        return;
      }
      if (response.status === 400)
        throw new Error(
          "L’appel n’a pas été enregistré : vérifie le résultat, le statut, la prochaine action et son échéance.",
        );
      if (response.status === 404)
        throw new Error(
          "Le prospect n’a pas été retrouvé par le serveur. Vérifie qu’il apparaît dans la recherche, puis sélectionne-le à nouveau.",
        );
      if (!response.ok)
        throw new Error(
          "Le serveur n’a pas confirmé l’enregistrement de l’appel. La fiche entreprise n’est pas supprimée : vérifie sa présence dans la recherche avant de la recréer, puis réessaie.",
        );
      setNotes("");
      setDuration("3");
      await load();
      setCallFeedbackError(false);
      setCallFeedback(
        "Appel enregistré. La fiche et sa prochaine action ont été mises à jour.",
      );
    } catch (cause) {
      setCallFeedbackError(true);
      setCallFeedback(
        cause instanceof Error
          ? cause.message
          : "La connexion a été interrompue. Le CRM n’a pas confirmé l’enregistrement de l’appel.",
      );
    } finally {
      setBusy(false);
    }
  }

  const minutes = Math.round((data?.stats.todaySeconds || 0) / 60);
  return (
    <main className="workspace callsPage">
      <style>{`.callsPage{display:grid;gap:18px}.callsHead{display:flex;justify-content:space-between;align-items:flex-end;gap:18px}.callsHead h1{margin:4px 0 7px}.callKpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.callKpis article,.callPanel{background:#fff;border:1px solid #e7eaf0;border-radius:16px;padding:19px}.callKpis small{display:block;color:#7b8797;font-size:9px}.callKpis b{display:block;font-size:24px;margin-top:7px}.callsGrid{display:grid;grid-template-columns:.92fr 1.08fr;gap:18px;align-items:start}.callForm{display:grid;gap:13px;height:min(820px,calc(100vh - 230px));min-height:560px;overflow-y:auto;align-content:start;scrollbar-gutter:stable}.callForm label{display:grid;gap:6px;color:#657386;font-size:10px}.callForm input,.callForm select,.callForm textarea{width:100%;padding:11px;border:1px solid #dce2e9;border-radius:9px;background:#fff}.callForm textarea{height:90px;min-height:90px;max-height:90px;resize:none;overflow-y:auto}.callPair{display:grid;grid-template-columns:1fr 1fr;gap:11px}.callSuggestion{padding:13px;border-radius:11px;background:#f6f8fa;border-left:3px solid #ef3340}.callSuggestion p{margin:0 0 10px;font-size:11px;color:#5f6d7f}.selectedCall{display:flex;justify-content:space-between;align-items:center;padding:12px;border-radius:10px;background:#111d2b;color:#fff}.selectedCall small{display:block;color:#aeb8c5;margin-top:4px}.selectedCall a{color:#fff;text-decoration:none;font-size:18px}.callLine{padding:14px 0;border-top:1px solid #edf0f4}.callLine:first-of-type{border-top:0}.callLine header{display:flex;justify-content:space-between;gap:10px}.callLine p{color:#667487;font-size:11px;line-height:1.5;margin:7px 0}.callLine small{color:#8590a0}.callBadge{white-space:nowrap;color:#bd2934;background:#fff0f1;border-radius:7px;padding:5px 7px;font-size:9px}.callFlow{font-size:10px;color:#748094}.callEmpty{padding:18px;background:#f4f8f5;color:#28633d;border-radius:11px}.callHistoryPanel{position:sticky;top:14px;z-index:3;align-self:start;max-height:calc(100dvh - 28px);padding:0;overflow-y:auto;overflow-x:hidden;scrollbar-gutter:stable}.callHistoryToggle{position:sticky;top:0;z-index:1;width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:19px;background:#fff;border:0;text-align:left;cursor:pointer;color:inherit}.callHistoryToggle h2{margin:3px 0 0}.callHistoryMeta{display:flex;align-items:center;gap:12px;color:#758195;font-size:11px}.callHistoryCount{padding:5px 9px;border-radius:999px;background:#f3f5f8;color:#465365;font-weight:700}.callHistoryChevron{font-size:17px;transition:transform .2s ease}.callHistoryChevron.open{transform:rotate(180deg)}.callHistoryContent{padding:0 19px 10px;animation:historyReveal .18s ease-out}@keyframes historyReveal{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}.callFeedback{margin:0;padding:11px 13px;border-radius:9px;background:#f1f8f2;color:#28633d;font-size:11px;line-height:1.5}.callFeedback.isError{background:#fff4f3;color:#a62a2a}.callLookup{display:grid;gap:8px}.callLookupResults{display:grid;gap:5px;max-height:190px;overflow:auto}.callLookupResults button{display:grid;gap:4px;text-align:left;border:1px solid #e4e9ef;border-radius:9px;padding:10px;background:#f8fafc;color:#172334;cursor:pointer}.callLookupResults button:hover{border-color:#ef3340}.callLookupResults small,.callLookupHint{color:#768396;font-size:10px;margin:0}.callAddProspect{justify-self:start;border:0;background:transparent;color:#c52c36;font-weight:700;padding:4px 0;cursor:pointer}.quickProspectForm{display:grid;gap:11px;padding:14px;border:1px solid #e5e9ef;border-radius:11px;background:#fafbfc}.quickProspectForm>b{font-size:12px;color:#172334}.quickProspectForm .primary{justify-self:start}@media(max-width:900px){.callsGrid{grid-template-columns:1fr}.callForm{height:min(760px,calc(100dvh - 190px));min-height:480px}.callHistoryPanel{order:-1;top:8px;max-height:45dvh}.callKpis{grid-template-columns:1fr 1fr}.callsHead{align-items:flex-start;flex-direction:column}.callPair{grid-template-columns:1fr}}`}</style>
      <header className="callsHead">
        <div>
          <p className="eyebrow">SUIVI TÉLÉPHONIQUE</p>
          <h1>Chaque appel déclenche la bonne suite.</h1>
          <p className="muted">
            Enregistrez le résultat, puis ajustez librement la proposition du
            CRM avant validation.
          </p>
        </div>
      </header>
      {error && <section className="callPanel">{error}</section>}
      <section className="callKpis">
        <article>
          <small>APPELS AUJOURD’HUI</small>
          <b>{data?.stats.today || 0}</b>
        </article>
        <article>
          <small>TEMPS AUJOURD’HUI</small>
          <b>{minutes} min</b>
        </article>
        <article>
          <small>APPELS CETTE SEMAINE</small>
          <b>{data?.stats.week || 0}</b>
        </article>
        <article>
          <small>RDV OBTENUS CE MOIS</small>
          <b>{data?.stats.appointmentsThisMonth || 0}</b>
        </article>
      </section>
      <section className="callsGrid">
        <form className="callPanel callForm" onSubmit={save}>
          <p className="eyebrow">NOUVEL APPEL</p>
          <h2>Compte rendu rapide</h2>
          <div className="callLookup">
            <label>
              Rechercher une entreprise
              <input
                required
                type="search"
                autoComplete="off"
                placeholder="Nom, téléphone ou interlocuteur…"
                value={prospectSearch}
                onChange={(event) => {
                  const value = event.target.value;
                  setProspectSearch(value);
                  if (selected && value !== selected.name) setProspectId("");
                }}
              />
            </label>
            {prospectSearch.trim() &&
              prospectSearch !== selected?.name &&
              (searchResults.length > 0 ? (
                <div className="callLookupResults" role="listbox" aria-label="Entreprises trouvées">
                  {searchResults.map((prospect) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={prospect.id === prospectId}
                      key={prospect.id}
                      onClick={() => chooseProspect(prospect)}
                    >
                      <b>{prospect.name}</b>
                      <small>
                        {[prospect.contactName, prospect.phone, prospect.status]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="callLookupHint">Aucune entreprise enregistrée ne correspond.</p>
              ))}
            <button
              type="button"
              className="callAddProspect"
              onClick={() => {
                setNewProspectName(prospectSearch.trim());
                setShowNewProspect((value) => !value);
              }}
            >
              + Créer un nouveau prospect par téléphone
            </button>
            {showNewProspect && (
              <div className="quickProspectForm">
                <b>Nouveau prospect téléphonique</b>
                <label>
                  Nom de l’entreprise
                  <input
                    required
                    autoFocus
                    value={newProspectName}
                    onChange={(event) => setNewProspectName(event.target.value)}
                    placeholder="Ex. Garage Martin"
                  />
                </label>
                <div className="callPair">
                  <label>
                    Téléphone
                    <input
                      type="tel"
                      value={newProspectPhone}
                      onChange={(event) => setNewProspectPhone(event.target.value)}
                      placeholder="04…"
                    />
                  </label>
                  <label>
                    Interlocuteur
                    <input
                      value={newProspectContact}
                      onChange={(event) => setNewProspectContact(event.target.value)}
                      placeholder="Nom (facultatif)"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="primary"
                  disabled={creatingProspect || !newProspectName.trim()}
                  onClick={createProspect}
                >
                  {creatingProspect ? "Création…" : "Créer et sélectionner"}
                </button>
              </div>
            )}
          </div>
          {selected && (
            <div className="selectedCall">
              <div>
                <b>{selected.name}</b>
                <small>
                  {selected.contactName || "Interlocuteur à identifier"} ·{" "}
                  {selected.status}
                </small>
              </div>
              {selected.phone && <a href={`tel:${selected.phone}`}>☎</a>}
            </div>
          )}
          <div className="callPair">
            <label>
              Sens
              <select
                value={direction}
                onChange={(event) => setDirection(event.target.value)}
              >
                <option value="outbound">Appel sortant</option>
                <option value="inbound">Appel entrant</option>
              </select>
            </label>
            <label>
              Durée en minutes
              <input
                type="number"
                min="0"
                max="1440"
                step="1"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </label>
          </div>
          <label>
            Résultat
            <select
              value={outcome}
              onChange={(event) => chooseOutcome(event.target.value)}
            >
              {Object.entries(outcomes).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Compte rendu
            <select
              value=""
              onChange={(event) => {
                if (event.target.value) setNotes(event.target.value);
              }}
            >
              <option value="">Préremplir le compte rendu…</option>
              <option value="Interlocuteur absent, nouvel appel nécessaire.">
                Interlocuteur absent
              </option>
              <option value="Le décideur n’était pas disponible. Identifier son nom et son créneau de disponibilité.">
                Décideur indisponible
              </option>
              <option value="Le contact souhaite recevoir une présentation de nos prestations de remplacement de pare-brise et de tout vitrage automobile.">
                Documentation demandée
              </option>
              <option value="L’entreprise possède une flotte de véhicules. Le nombre et les types de véhicules restent à confirmer.">
                Flotte à qualifier
              </option>
              <option value="L’entreprise travaille déjà avec un prestataire vitrage.">
                Prestataire existant
              </option>
              <option value="La gestion du vitrage passe actuellement par l’assurance.">
                Gestion par assurance
              </option>
              <option value="Le contact est intéressé et accepte de convenir d’un rendez-vous.">
                Intéressé par un rendez-vous
              </option>
              <option value="Aucun besoin immédiat. Le contact accepte une relance ultérieure.">
                À rappeler ultérieurement
              </option>
              <option value="L’entreprise ne souhaite pas être recontactée.">
                Refus définitif
              </option>
            </select>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Besoin, objection, décideur, véhicules concernés…"
            />
          </label>
          <div className="callSuggestion">
            <p>
              Proposition automatique — vous pouvez tout modifier avant
              d’enregistrer.
            </p>
            <div className="callPair">
              <label>
                Nouveau statut
                <select
                  value={resultingStatus}
                  onChange={(event) => setResultingStatus(event.target.value)}
                >
                  {[
                    "Nouveau",
                    "À contacter",
                    "Relance",
                    "Qualifié",
                    "RDV",
                    "Offre",
                    "Perdu",
                  ].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label>
                Prochaine action
                <input
                  list="call-next-actions"
                  required={outcome !== "not_interested"}
                  value={nextAction}
                  onChange={(event) => setNextAction(event.target.value)}
                />
              </label>
            </div>
            {outcome !== "not_interested" && (
              <label>
                Échéance de la prochaine action
                <input
                  required
                  type="datetime-local"
                  value={nextActionAt}
                  onChange={(event) => setNextActionAt(event.target.value)}
                />
              </label>
            )}
            {outcome === "appointment" && (
              <label>
                Date et heure du rendez-vous
                <input
                  required
                  type="datetime-local"
                  value={appointmentStartsAt}
                  onChange={(event) =>
                    setAppointmentStartsAt(event.target.value)
                  }
                />
              </label>
            )}
          </div>
          {callFeedback && (
            <p
              className={`callFeedback ${callFeedbackError ? "isError" : ""}`}
              role="status"
            >
              {callFeedback}
            </p>
          )}
          <button className="primary" disabled={busy || !prospectId}>
            {busy ? "Enregistrement…" : "Enregistrer l’appel et la suite"}
          </button>
          <datalist id="call-next-actions">
            {[
              "Rappeler l’entreprise",
              "Rappeler au créneau convenu",
              "Identifier le bon interlocuteur",
              "Envoyer un récapitulatif",
              "Envoyer les informations demandées",
              "Envoyer un e-mail de présentation",
              "Appeler pour convenir d’un rendez-vous",
              "Préparer le rendez-vous",
              "Relancer après l’envoi de la documentation",
              "Aucune relance",
            ].map((value) => (
              <option value={value} key={value} />
            ))}
          </datalist>
        </form>
        <section className="callPanel callHistoryPanel">
          <button
            className="callHistoryToggle"
            type="button"
            aria-expanded={historyOpen}
            aria-controls="call-history-content"
            onClick={() => setHistoryOpen((open) => !open)}
          >
            <div>
              <p className="eyebrow">HISTORIQUE</p>
              <h2>Derniers appels</h2>
            </div>
            <span className="callHistoryMeta">
              <span className="callHistoryCount">{data?.calls.length || 0}</span>
              <span>{historyOpen ? "Réduire" : "Afficher"}</span>
              <span className={`callHistoryChevron${historyOpen ? " open" : ""}`} aria-hidden="true">⌄</span>
            </span>
          </button>
          {historyOpen && <div className="callHistoryContent" id="call-history-content">
          {data?.calls.length ? (
            data.calls.map((call) => (
              <article className="callLine" key={call.id}>
                <header>
                  <div>
                    <b>{call.prospect}</b>
                    <p>
                      {call.direction === "outbound" ? "Sortant" : "Entrant"}
                      {call.contact ? ` · ${call.contact}` : ""} ·{" "}
                      {Math.round(call.durationSeconds / 60)} min
                    </p>
                  </div>
                  <span className="callBadge">
                    {outcomes[call.outcome] || call.outcome}
                  </span>
                </header>
                {call.notes && <p>{call.notes}</p>}
                <div className="callFlow">
                  {call.previousStatus} → {call.resultingStatus}
                  {call.nextAction ? ` · ${call.nextAction}` : ""}
                </div>
                <small>
                  {new Date(call.startedAt).toLocaleString("fr-FR")}
                </small>
              </article>
            ))
          ) : (
            <p className="callEmpty">Aucun appel enregistré pour le moment.</p>
          )}
          </div>}
        </section>
      </section>
    </main>
  );
}

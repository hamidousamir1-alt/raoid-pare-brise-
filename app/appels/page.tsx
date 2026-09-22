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
      setProspectId((current) => {
        if (current) return current;
        if (requested && payload.prospects.some((p) => p.id === requested))
          return requested;
        return payload.prospects[0]?.id || "";
      });
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
      if (!response.ok) throw new Error();
      setNotes("");
      setDuration("3");
      await load();
    } catch {
      alert(
        "L’appel n’a pas pu être enregistré. Vérifiez la prochaine action et sa date.",
      );
    } finally {
      setBusy(false);
    }
  }

  const minutes = Math.round((data?.stats.todaySeconds || 0) / 60);
  return (
    <main className="workspace callsPage">
      <style>{`.callsPage{display:grid;gap:18px}.callsHead{display:flex;justify-content:space-between;align-items:flex-end;gap:18px}.callsHead h1{margin:4px 0 7px}.callKpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.callKpis article,.callPanel{background:#fff;border:1px solid #e7eaf0;border-radius:16px;padding:19px}.callKpis small{display:block;color:#7b8797;font-size:9px}.callKpis b{display:block;font-size:24px;margin-top:7px}.callsGrid{display:grid;grid-template-columns:.92fr 1.08fr;gap:18px}.callForm{display:grid;gap:13px}.callForm label{display:grid;gap:6px;color:#657386;font-size:10px}.callForm input,.callForm select,.callForm textarea{width:100%;padding:11px;border:1px solid #dce2e9;border-radius:9px;background:#fff}.callForm textarea{min-height:90px;resize:vertical}.callPair{display:grid;grid-template-columns:1fr 1fr;gap:11px}.callSuggestion{padding:13px;border-radius:11px;background:#f6f8fa;border-left:3px solid #ef3340}.callSuggestion p{margin:0 0 10px;font-size:11px;color:#5f6d7f}.selectedCall{display:flex;justify-content:space-between;align-items:center;padding:12px;border-radius:10px;background:#111d2b;color:#fff}.selectedCall small{display:block;color:#aeb8c5;margin-top:4px}.selectedCall a{color:#fff;text-decoration:none;font-size:18px}.callLine{padding:14px 0;border-top:1px solid #edf0f4}.callLine:first-of-type{border-top:0}.callLine header{display:flex;justify-content:space-between;gap:10px}.callLine p{color:#667487;font-size:11px;line-height:1.5;margin:7px 0}.callLine small{color:#8590a0}.callBadge{white-space:nowrap;color:#bd2934;background:#fff0f1;border-radius:7px;padding:5px 7px;font-size:9px}.callFlow{font-size:10px;color:#748094}.callEmpty{padding:18px;background:#f4f8f5;color:#28633d;border-radius:11px}@media(max-width:900px){.callsGrid{grid-template-columns:1fr}.callKpis{grid-template-columns:1fr 1fr}.callsHead{align-items:flex-start;flex-direction:column}.callPair{grid-template-columns:1fr}}`}</style>
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
          <label>
            Entreprise
            <select
              required
              value={prospectId}
              onChange={(event) => setProspectId(event.target.value)}
            >
              <option value="">Choisir une entreprise</option>
              {data?.prospects.map((prospect) => (
                <option value={prospect.id} key={prospect.id}>
                  {prospect.name}
                </option>
              ))}
            </select>
          </label>
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
          <button className="primary" disabled={busy || !prospectId}>
            {busy ? "Enregistrement…" : "Enregistrer l’appel et la suite"}
          </button>
        </form>
        <section className="callPanel">
          <p className="eyebrow">HISTORIQUE</p>
          <h2>Derniers appels</h2>
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
        </section>
      </section>
    </main>
  );
}

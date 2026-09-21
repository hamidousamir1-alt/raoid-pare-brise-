"use client";

import { useEffect, useMemo, useState } from "react";

type Prospect = {
  id: string;
  name: string;
  address: string;
  zone: string;
  contactName: string;
  contactRole: string;
  phone: string;
  email: string;
};
type Appointment = {
  id: string;
  prospectId: string;
  prospect: string;
  contact?: string;
  contactRole?: string;
  contactPhone?: string;
  contactEmail?: string;
  phone?: string;
  email?: string;
  address?: string;
  zone?: string;
  notes?: string;
  objections?: string;
  title: string;
  meetingType: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  objective?: string;
  preparationNotes?: string;
  status: string;
  confirmationStatus: string;
  outcome?: string;
  nextAction?: string;
};
type Form = {
  prospectId: string;
  title: string;
  meetingType: string;
  startsAt: string;
  endsAt: string;
  location: string;
  objective: string;
  preparationNotes: string;
  reminderDay: boolean;
  reminderHour: boolean;
};

const monday = (date: Date) => {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  result.setHours(0, 0, 0, 0);
  return result;
};
const localInput = (date: Date) => {
  const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return copy.toISOString().slice(0, 16);
};
const statusLabels: Record<string, string> = {
  scheduled: "Planifié",
  confirmed: "Confirmé",
  completed: "Réalisé",
  cancelled: "Annulé",
  no_show: "Absent",
};

export default function AgendaPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [week, setWeek] = useState(() => monday(new Date()));
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [busy, setBusy] = useState(false);
  const start = new Date(Date.now() + 86400_000);
  start.setHours(10, 0, 0, 0);
  const [form, setForm] = useState<Form>(() => ({
    prospectId: "",
    title: "Rendez-vous de présentation Rapid Pare-Brise",
    meetingType: "Sur place",
    startsAt: localInput(start),
    endsAt: localInput(new Date(start.getTime() + 3600_000)),
    location: "",
    objective:
      "Présenter notre service de remplacement de pare-brise et de tout vitrage automobile",
    preparationNotes: "",
    reminderDay: true,
    reminderHour: true,
  }));

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date(week);
        date.setDate(date.getDate() + index);
        return date;
      }),
    [week],
  );

  async function load() {
    const from = week.toISOString(),
      end = new Date(week);
    end.setDate(end.getDate() + 7);
    const response = await fetch(
      `/api/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(end.toISOString())}`,
      { cache: "no-store" },
    );
    if (response.status === 401) {
      location.href = "/login";
      return;
    }
    if (!response.ok) return;
    const payload = await response.json();
    setAppointments(payload.appointments || []);
    setProspects(payload.prospects || []);
    if (!form.prospectId && payload.prospects?.[0])
      setForm((old) => ({
        ...old,
        prospectId: payload.prospects[0].id,
        location:
          payload.prospects[0].address || payload.prospects[0].zone || "",
      }));
  }

  useEffect(() => {
    load();
  }, [week]);

  async function api(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error();
      await load();
      return true;
    } catch {
      alert("Le rendez-vous n’a pas pu être enregistré.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (
      await api({
        action: "create",
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      })
    )
      setCreating(false);
  }

  async function changeStatus(appointment: Appointment, status: string) {
    if (
      await api({
        action: "status",
        appointmentId: appointment.id,
        status,
      })
    )
      setSelected(null);
  }

  async function complete(appointment: Appointment) {
    const outcome = prompt(
      "Compte rendu du rendez-vous",
      "Échange réalisé — besoin et flotte à confirmer",
    );
    if (!outcome) return;
    const nextAction = prompt(
      "Prochaine action obligatoire",
      "Envoyer la proposition et rappeler",
    );
    if (!nextAction) return;
    const followUp = new Date();
    followUp.setDate(followUp.getDate() + 3);
    followUp.setHours(10, 0, 0, 0);
    const nextDate = prompt(
      "Date de la prochaine action (AAAA-MM-JJ)",
      followUp.toISOString().slice(0, 10),
    );
    if (!nextDate) return;
    if (
      await api({
        action: "complete",
        appointmentId: appointment.id,
        outcome,
        nextAction,
        nextActionAt: new Date(`${nextDate}T10:00:00`).toISOString(),
      })
    )
      setSelected(null);
  }

  const today = new Date().toDateString(),
    todayAppointments = appointments.filter(
      (appointment) => new Date(appointment.startsAt).toDateString() === today,
    );

  return (
    <main className="workspace agendaPage">
      <style>{`.agendaPage{display:grid;gap:18px}.agendaHead{display:flex;justify-content:space-between;align-items:flex-end;gap:20px}.agendaHead h1{margin:4px 0 7px}.agendaActions{display:flex;gap:8px}.weekNav{display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #e7eaf0;border-radius:14px;padding:11px 14px}.weekNav button{width:36px;height:34px}.weekNav b{font-size:13px}.weekGrid{display:grid;grid-template-columns:repeat(7,minmax(135px,1fr));gap:8px;overflow-x:auto}.dayColumn{min-height:420px;padding:11px;background:#eef2f5;border-radius:14px}.dayColumn.today{box-shadow:inset 0 0 0 2px #ef3340}.dayColumn>header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.dayColumn>header small{color:#7c8797}.appointmentCard{width:100%;margin-bottom:8px;padding:11px;text-align:left;background:#fff;border:1px solid #e2e7ec;border-radius:11px}.appointmentCard time,.appointmentCard small{display:block;color:#778396;font-size:9px}.appointmentCard b{display:block;margin:5px 0;font-size:11px}.appointmentCard mark{display:inline-block;margin-top:7px}.agendaToday{display:grid;grid-template-columns:.7fr 1.3fr;gap:16px}.agendaPanel{padding:20px;background:#fff;border:1px solid #e7eaf0;border-radius:16px}.agendaPanel h2{margin:3px 0 15px}.todayLine{display:flex;justify-content:space-between;gap:15px;padding:12px 0;border-top:1px solid #edf0f4}.todayLine:first-of-type{border:0}.appointmentDetail p{color:#647185;font-size:12px;line-height:1.55}.detailButtons{display:flex;gap:8px;flex-wrap:wrap}.appointmentForm{display:grid;grid-template-columns:1fr 1fr;gap:13px}.appointmentForm label{font-size:10px;color:#5f6b7d}.appointmentForm input,.appointmentForm select,.appointmentForm textarea{display:block;width:100%;margin-top:6px;padding:10px;border:1px solid #dce1e9;border-radius:9px}.appointmentForm .full{grid-column:1/-1}@media(max-width:800px){.agendaHead{align-items:flex-start;flex-direction:column}.agendaActions{width:100%}.agendaActions button{flex:1}.weekGrid{grid-template-columns:repeat(7,82vw)}.agendaToday{grid-template-columns:1fr}.appointmentForm{grid-template-columns:1fr}.appointmentForm .full{grid-column:1}}`}</style>
      <header className="agendaHead">
        <div>
          <p className="eyebrow">RENDEZ-VOUS & SUIVI</p>
          <h1>Agenda commercial</h1>
          <p className="muted">
            Chaque rendez-vous prépare automatiquement la suite du dossier.
          </p>
        </div>
        <div className="agendaActions">
          <button onClick={() => setWeek(monday(new Date()))}>
            Aujourd’hui
          </button>
          <button className="primary" onClick={() => setCreating(true)}>
            ＋ Nouveau rendez-vous
          </button>
        </div>
      </header>
      <div className="weekNav">
        <button
          onClick={() =>
            setWeek((old) => {
              const date = new Date(old);
              date.setDate(date.getDate() - 7);
              return date;
            })
          }
        >
          ←
        </button>
        <b>
          Semaine du {week.toLocaleDateString("fr-FR")} au{" "}
          {days[6].toLocaleDateString("fr-FR")}
        </b>
        <button
          onClick={() =>
            setWeek((old) => {
              const date = new Date(old);
              date.setDate(date.getDate() + 7);
              return date;
            })
          }
        >
          →
        </button>
      </div>
      <section className="weekGrid">
        {days.map((day) => {
          const list = appointments.filter(
            (appointment) =>
              new Date(appointment.startsAt).toDateString() ===
              day.toDateString(),
          );
          return (
            <article
              className={`dayColumn ${day.toDateString() === today ? "today" : ""}`}
              key={day.toISOString()}
            >
              <header>
                <b>{day.toLocaleDateString("fr-FR", { weekday: "short" })}</b>
                <small>{day.getDate()}</small>
              </header>
              {list.map((appointment) => (
                <button
                  className="appointmentCard"
                  key={appointment.id}
                  onClick={() => setSelected(appointment)}
                >
                  <time>
                    {new Date(appointment.startsAt).toLocaleTimeString(
                      "fr-FR",
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}
                  </time>
                  <b>{appointment.prospect}</b>
                  <small>{appointment.meetingType}</small>
                  <mark>{statusLabels[appointment.status]}</mark>
                </button>
              ))}
            </article>
          );
        })}
      </section>
      <section className="agendaToday">
        <article className="agendaPanel">
          <p className="eyebrow">AUJOURD’HUI</p>
          <h2>{todayAppointments.length} rendez-vous</h2>
          {todayAppointments.map((appointment) => (
            <div className="todayLine" key={appointment.id}>
              <div>
                <b>{appointment.prospect}</b>
                <small>{appointment.objective}</small>
              </div>
              <time>
                {new Date(appointment.startsAt).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          ))}
          {!todayAppointments.length && (
            <p className="muted">Aucun rendez-vous aujourd’hui.</p>
          )}
        </article>
        <article className="agendaPanel">
          <p className="eyebrow">PRÉPARATION AUTOMATIQUE</p>
          <h2>
            {selected ? selected.prospect : "Sélectionnez un rendez-vous"}
          </h2>
          {selected ? (
            <div className="appointmentDetail">
              <p>
                <b>Objectif :</b> {selected.objective || "À préciser"}
                <br />
                <b>Contact :</b> {selected.contact || "Contact principal"}{" "}
                {selected.contactRole ? `— ${selected.contactRole}` : ""}
                <br />
                <b>Lieu :</b>{" "}
                {selected.location || selected.address || "À préciser"}
                <br />
                <b>Points de vigilance :</b>{" "}
                {selected.objections || "Aucune objection enregistrée"}
                <br />
                <b>Notes :</b> {selected.notes || "Aucune note"}
              </p>
              <div className="detailButtons">
                {selected.location && (
                  <a
                    className="primary"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selected.location)}`}
                  >
                    Itinéraire
                  </a>
                )}
                {selected.status === "scheduled" && (
                  <button onClick={() => changeStatus(selected, "confirmed")}>
                    Confirmer
                  </button>
                )}
                {!["completed", "cancelled"].includes(selected.status) && (
                  <button
                    className="primary"
                    onClick={() => complete(selected)}
                  >
                    Compte rendu
                  </button>
                )}
                {!["completed", "cancelled"].includes(selected.status) && (
                  <button onClick={() => changeStatus(selected, "no_show")}>
                    Absent
                  </button>
                )}
                {!["completed", "cancelled"].includes(selected.status) && (
                  <button onClick={() => changeStatus(selected, "cancelled")}>
                    Annuler
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="muted">
              Le CRM affichera ici l’objectif, le contact, les objections, les
              notes et l’itinéraire.
            </p>
          )}
        </article>
      </section>
      {creating && (
        <div className="modalback" onMouseDown={() => setCreating(false)}>
          <form
            className="modal"
            onSubmit={create}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modalhead">
              <div>
                <p className="eyebrow">NOUVEAU RENDEZ-VOUS</p>
                <h2>Planifier la rencontre</h2>
              </div>
              <button type="button" onClick={() => setCreating(false)}>
                ×
              </button>
            </div>
            <div className="appointmentForm">
              <label className="full">
                Entreprise
                <select
                  required
                  value={form.prospectId}
                  onChange={(event) => {
                    const prospect = prospects.find(
                      (item) => item.id === event.target.value,
                    );
                    setForm({
                      ...form,
                      prospectId: event.target.value,
                      location: prospect?.address || prospect?.zone || "",
                    });
                  }}
                >
                  {prospects.map((prospect) => (
                    <option value={prospect.id} key={prospect.id}>
                      {prospect.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="full">
                Intitulé
                <input
                  required
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                />
              </label>
              <label>
                Début
                <input
                  required
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) =>
                    setForm({ ...form, startsAt: event.target.value })
                  }
                />
              </label>
              <label>
                Fin
                <input
                  required
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) =>
                    setForm({ ...form, endsAt: event.target.value })
                  }
                />
              </label>
              <label>
                Format
                <select
                  value={form.meetingType}
                  onChange={(event) =>
                    setForm({ ...form, meetingType: event.target.value })
                  }
                >
                  <option>Sur place</option>
                  <option>Téléphone</option>
                  <option>Visioconférence</option>
                  <option>Au centre</option>
                </select>
              </label>
              <label>
                Lieu
                <input
                  value={form.location}
                  onChange={(event) =>
                    setForm({ ...form, location: event.target.value })
                  }
                />
              </label>
              <label className="full">
                Objectif
                <textarea
                  rows={2}
                  value={form.objective}
                  onChange={(event) =>
                    setForm({ ...form, objective: event.target.value })
                  }
                />
              </label>
              <label className="full">
                Préparation
                <textarea
                  rows={3}
                  value={form.preparationNotes}
                  onChange={(event) =>
                    setForm({ ...form, preparationNotes: event.target.value })
                  }
                  placeholder="Documents à prévoir, informations à vérifier…"
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.reminderDay}
                  onChange={(event) =>
                    setForm({ ...form, reminderDay: event.target.checked })
                  }
                />
                Rappel la veille
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.reminderHour}
                  onChange={(event) =>
                    setForm({ ...form, reminderHour: event.target.checked })
                  }
                />
                Rappel une heure avant
              </label>
            </div>
            <div className="modalactions">
              <button type="button" onClick={() => setCreating(false)}>
                Annuler
              </button>
              <button className="primary" disabled={busy}>
                Planifier le rendez-vous
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

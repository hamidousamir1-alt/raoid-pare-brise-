"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  COMMERCIAL_ASSUMPTIONS,
  rawAnnualPotential,
  suggestedNextAction,
  weightedPipelinePotential,
} from "../../lib/commercial";
import { prospectQuality } from "../../lib/prospect-quality";
type Contact = {
  id?: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  isDecisionMaker: boolean;
  isPrimary: boolean;
  preferredChannel: string;
  notes: string;
};
type TimelineItem = {
  id: string;
  category:
    | "system"
    | "call"
    | "email"
    | "field"
    | "appointment"
    | "offer"
    | "task"
    | "document"
    | "service"
    | "note";
  title: string;
  detail: string;
  status: string;
  at: string;
};
type ProspectDocument = {
  id: string;
  name: string;
  fileName: string;
  category: string;
  createdAt: string;
};
type ProspectAppointment = {
  id: string;
  title: string;
  meetingType: string;
  startsAt: string;
  status: string;
  outcome?: string;
};
type Prospect = {
  id: string | number;
  name: string;
  sector: string;
  zone: string;
  address: string;
  postalCode: string;
  city: string;
  website: string;
  siret: string;
  companySize: string;
  fleet: string;
  fleetCount: number | null;
  fleetConfidence: string;
  fleetTypes: string;
  usageIntensity: string;
  phone: string;
  email: string;
  contactName: string;
  contactRole: string;
  emailStatus: string;
  doNotContact: boolean;
  status: string;
  score: number;
  notes: string;
  next: string;
  access: string;
  insurance: string;
  currentGlassPartner: string;
  glassPartnerDetails: string;
  leadSource: string;
  bestContactTime: string;
  decisionProcess: string;
  objections: string;
  dataQualityScore: number;
  nextActionAt: string | null;
  contacts?: Contact[];
  potentialRevenue: number;
  signedRevenue: number;
  generatedRevenue: number;
  updatedAt: string;
};
type Storage = "loading" | "server" | "blocked";
const UPDATED = "rapid-pb-prospects-updated";
const money = (v: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v || 0);
export default function ProspectManager() {
  const params = useSearchParams();
  const documentInput = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Prospect[]>([]),
    [ready, setReady] = useState(false),
    [storage, setStorage] = useState<Storage>("loading"),
    [query, setQuery] = useState(""),
    [editing, setEditing] = useState<Prospect | null>(null),
    [timeline, setTimeline] = useState<TimelineItem[]>([]),
    [timelineFilter, setTimelineFilter] = useState("all"),
    [noteType, setNoteType] = useState("note"),
    [quickNote, setQuickNote] = useState(""),
    [quickNextAction, setQuickNextAction] = useState(""),
    [quickNextDate, setQuickNextDate] = useState(""),
    [noteBusy, setNoteBusy] = useState(false),
    [documents, setDocuments] = useState<ProspectDocument[]>([]),
    [appointments, setAppointments] = useState<ProspectAppointment[]>([]),
    [detailBusy, setDetailBusy] = useState(false),
    [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/prospects", { cache: "no-store" });
        if (res.status === 401) {
          location.href = "/login";
          return;
        }
        if (!res.ok) {
          if (live) setStorage("blocked");
          return;
        }
        const data = await res.json();
        if (data.mode !== "postgresql") {
          if (live) setStorage("blocked");
          return;
        }
        if (live) {
          setItems(
            (data.items || []).map((p: Prospect) => ({
              ...p,
              potentialRevenue: weightedPipelinePotential(p),
            })),
          );
          setStorage("server");
        }
      } catch {
        if (live) setStorage("blocked");
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const requested = params.get("prospect");
    if (!requested) return;
    const p = items.find((x) => String(x.id) === requested);
    if (p) {
      openRecord(p);
    }
  }, [ready, params, items]);
  const filtered = useMemo(
    () =>
      items.filter((x) =>
        (x.name + x.sector + x.zone + x.address)
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [items, query],
  );
  function fresh(): Prospect {
    return {
      id: "",
      name: "",
      sector: "",
      zone: "",
      address: "",
      postalCode: "",
      city: "Marseille",
      website: "",
      siret: "",
      companySize: "À qualifier",
      fleet: "",
      fleetCount: null,
      fleetConfidence: "À vérifier",
      fleetTypes: "",
      usageIntensity: "À vérifier",
      phone: "",
      email: "",
      contactName: "",
      contactRole: "",
      emailStatus: "À vérifier",
      doNotContact: false,
      status: "Nouveau",
      score: 50,
      notes: "",
      next: "Qualifier le prospect",
      access: "À vérifier",
      insurance: "À vérifier",
      currentGlassPartner: "Inconnu",
      glassPartnerDetails: "",
      leadSource: "Prospection terrain",
      bestContactTime: "",
      decisionProcess: "",
      objections: "",
      dataQualityScore: 0,
      nextActionAt: null,
      contacts: [],
      potentialRevenue: 0,
      signedRevenue: 0,
      generatedRevenue: 0,
      updatedAt: new Date().toISOString().slice(0, 10),
    };
  }
  async function openRecord(prospect: Prospect) {
    setEditing(prospect);
    setTimeline([]);
    setTimelineFilter("all");
    setDocuments([]);
    setAppointments([]);
    setOpen(true);
    if (!prospect.id) return;
    setDetailBusy(true);
    try {
      const response = await fetch(`/api/prospects/${prospect.id}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const detail = await response.json();
      setEditing({ ...detail.item, contacts: detail.contacts || [] });
      setTimeline(detail.timeline || []);
      setDocuments(detail.documents || []);
      setAppointments(detail.appointments || []);
    } finally {
      setDetailBusy(false);
    }
  }
  function addContact() {
    if (!editing) return;
    const contacts = editing.contacts || [];
    setEditing({
      ...editing,
      contacts: [
        ...contacts,
        {
          name: "",
          role: "",
          email: "",
          phone: "",
          isDecisionMaker: false,
          isPrimary: contacts.length === 0,
          preferredChannel: "Téléphone",
          notes: "",
        },
      ],
    });
  }
  async function saveQuickNote() {
    if (!editing?.id || !quickNote.trim()) return;
    setNoteBusy(true);
    try {
      const response = await fetch(`/api/prospects/${editing.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteType,
          content: quickNote,
          nextAction: quickNextAction,
          nextActionAt: quickNextDate
            ? new Date(quickNextDate).toISOString()
            : null,
        }),
      });
      if (!response.ok) throw new Error();
      const detailResponse = await fetch(`/api/prospects/${editing.id}`, {
        cache: "no-store",
      });
      if (detailResponse.ok) {
        const detail = await detailResponse.json();
        setEditing({ ...detail.item, contacts: detail.contacts || [] });
        setTimeline(detail.timeline || []);
      }
      setQuickNote("");
      setQuickNextAction("");
      setQuickNextDate("");
    } catch {
      alert("La note n’a pas pu être enregistrée.");
    } finally {
      setNoteBusy(false);
    }
  }
  function updateContact(index: number, patch: Partial<Contact>) {
    if (!editing) return;
    const contacts = (editing.contacts || []).map((contact, contactIndex) => ({
      ...contact,
      ...(contactIndex === index ? patch : {}),
      ...(patch.isPrimary && contactIndex !== index
        ? { isPrimary: false }
        : {}),
    }));
    setEditing({ ...editing, contacts });
  }
  function removeContact(index: number) {
    if (!editing) return;
    setEditing({
      ...editing,
      contacts: (editing.contacts || []).filter((_, i) => i !== index),
    });
  }
  async function uploadDocument(file?: File) {
    if (!file || !editing?.id) return;
    const name = prompt("Nom du document", file.name.replace(/\.[^.]+$/, ""));
    if (!name) return;
    const category =
      prompt(
        "Catégorie : Présentation, Offre commerciale, Support RDV ou Fiche pratique",
        "Présentation",
      ) || "Fiche pratique";
    const form = new FormData();
    form.set("file", file);
    form.set("name", name);
    form.set("category", category);
    form.set("prospectId", String(editing.id));
    const response = await fetch("/api/documents", {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      alert("Le document n’a pas pu être lié à cette entreprise.");
      return;
    }
    const payload = await response.json();
    setDocuments((old) => [payload.item, ...old]);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (storage !== "server") {
      alert(
        "Stockage sécurisé indisponible. Aucune donnée ne sera enregistrée localement.",
      );
      return;
    }
    if (!editing?.name.trim()) return;
    const primary =
        editing.contacts?.find((contact) => contact.isPrimary) ||
        editing.contacts?.[0],
      base = {
        ...editing,
        contactName: primary?.name || editing.contactName,
        contactRole: primary?.role || editing.contactRole,
        email: primary?.email || editing.email,
        phone: primary?.phone || editing.phone,
        next: editing.next.trim() || suggestedNextAction(editing.status),
        updatedAt: new Date().toISOString().slice(0, 10),
      },
      quality = prospectQuality(base),
      value = {
        ...base,
        dataQualityScore: quality.score,
        potentialRevenue: weightedPipelinePotential(base),
      },
      existing = !!editing.id;
    try {
      const res = await fetch(
        existing ? `/api/prospects/${value.id}` : "/api/prospects",
        {
          method: existing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        },
      );
      if (res.status === 401) {
        location.href = "/login";
        return;
      }
      if (!res.ok) {
        if (res.status >= 500) setStorage("blocked");
        alert(
          "Enregistrement impossible. Les données n’ont pas été validées par le serveur.",
        );
        return;
      }
      const data = await res.json(),
        saved = data.item as Prospect;
      setItems((old) =>
        existing
          ? old.map((x) => (x.id === value.id ? saved : x))
          : [saved, ...old],
      );
      window.dispatchEvent(new Event(UPDATED));
      setOpen(false);
    } catch {
      setStorage("blocked");
      alert(
        "Connexion au stockage sécurisé interrompue. Aucune donnée locale n’a été créée.",
      );
    }
  }
  async function remove() {
    if (!editing || storage !== "server") {
      alert("Stockage sécurisé indisponible. Archivage bloqué.");
      return;
    }
    try {
      const res = await fetch(`/api/prospects/${editing.id}`, {
        method: "DELETE",
      });
      if (res.status === 401) {
        location.href = "/login";
        return;
      }
      if (!res.ok) {
        if (res.status >= 500) setStorage("blocked");
        alert("Archivage impossible. Aucune donnée n’a été supprimée.");
        return;
      }
      setItems((old) => old.filter((x) => x.id !== editing.id));
      window.dispatchEvent(new Event(UPDATED));
      setOpen(false);
    } catch {
      setStorage("blocked");
      alert("Connexion au stockage sécurisé interrompue. Archivage annulé.");
    }
  }
  const weighted = editing ? weightedPipelinePotential(editing) : 0,
    raw = editing ? rawAnnualPotential(editing) : 0,
    quality = editing
      ? prospectQuality(editing)
      : { score: 0, missing: [] as string[] };
  return (
    <>
      <div className="workspacebar">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher entreprise, secteur, zone…"
        />
        <button
          className="primary"
          onClick={() => {
            if (storage !== "server") {
              alert("Stockage sécurisé indisponible.");
              return;
            }
            setEditing(fresh());
            setTimeline([]);
            setTimelineFilter("all");
            setDocuments([]);
            setAppointments([]);
            setOpen(true);
          }}
        >
          ＋ Ajouter un prospect
        </button>
      </div>
      <div className="prospectcards">
        {filtered.map((p) => (
          <article
            className="prospectcard"
            key={p.id}
            onClick={() => openRecord(p)}
          >
            <div className="prospectscore">{p.score}</div>
            <div className="prospectmain">
              <div>
                <h2>{p.name}</h2>
                <p>
                  {p.sector} • {p.zone}
                </p>
              </div>
              <mark>{p.status}</mark>
              <div className="prospectmeta">
                <span>🚐 {p.fleet || "Flotte à qualifier"}</span>
                <span>⚡ {p.next}</span>
                <span>⌖ Accès {p.access || "à vérifier"}</span>
                {p.potentialRevenue > 0 && (
                  <span>€ Pipeline pondéré {money(p.potentialRevenue)}</span>
                )}
              </div>
              <small>{p.notes}</small>
            </div>
            <button className="edit">Modifier →</button>
          </article>
        ))}
      </div>
      {open && editing && (
        <div className="modalback" onMouseDown={() => setOpen(false)}>
          <form
            className="modal companyRecord"
            onSubmit={save}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              ref={documentInput}
              hidden
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.docx,.pptx"
              onChange={(e) => {
                uploadDocument(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
            <div className="modalhead">
              <div>
                <p className="eyebrow">FICHE PROSPECT</p>
                <h2>{editing.name || "Nouveau prospect"}</h2>
                <div className="recordQuality">
                  <span>Qualité des données</span>
                  <b>{quality.score}%</b>
                  <i>
                    <em style={{ width: `${quality.score}%` }} />
                  </i>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            {detailBusy && (
              <p className="recordLoading">Chargement du dossier complet…</p>
            )}
            <div className="formgrid">
              <h3 className="formsection full">Identité de l’entreprise</h3>
              <label>
                Entreprise
                <input
                  required
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </label>
              <label>
                Secteur
                <input
                  list="sector-presets"
                  value={editing.sector}
                  onChange={(e) =>
                    setEditing({ ...editing, sector: e.target.value })
                  }
                />
              </label>
              <label>
                Zone
                <input
                  list="zone-presets"
                  value={editing.zone}
                  onChange={(e) =>
                    setEditing({ ...editing, zone: e.target.value })
                  }
                />
              </label>
              <label>
                Adresse exacte
                <input
                  value={editing.address}
                  onChange={(e) =>
                    setEditing({ ...editing, address: e.target.value })
                  }
                  placeholder="Pour Maps / Waze"
                />
              </label>
              <label>
                Code postal
                <input
                  value={editing.postalCode || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, postalCode: e.target.value })
                  }
                />
              </label>
              <label>
                Ville
                <input
                  list="city-presets"
                  value={editing.city || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, city: e.target.value })
                  }
                />
              </label>
              <label>
                SIRET
                <input
                  inputMode="numeric"
                  value={editing.siret || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, siret: e.target.value })
                  }
                  placeholder="14 chiffres"
                />
              </label>
              <label>
                Site internet
                <input
                  type="url"
                  value={editing.website || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, website: e.target.value })
                  }
                  placeholder="https://…"
                />
              </label>
              <label>
                Taille de l’entreprise
                <select
                  value={editing.companySize || "À qualifier"}
                  onChange={(e) =>
                    setEditing({ ...editing, companySize: e.target.value })
                  }
                >
                  <option>À qualifier</option>
                  <option>TPE</option>
                  <option>PME</option>
                  <option>ETI</option>
                  <option>Grande entreprise</option>
                </select>
              </label>
              <label>
                Origine du prospect
                <select
                  value={editing.leadSource || "Prospection terrain"}
                  onChange={(e) =>
                    setEditing({ ...editing, leadSource: e.target.value })
                  }
                >
                  <option>Prospection terrain</option>
                  <option>Appel sortant</option>
                  <option>Recommandation</option>
                  <option>Partenaire</option>
                  <option>Recherche en ligne</option>
                  <option>Entrant</option>
                </select>
              </label>
              <h3 className="formsection full">Flotte et potentiel vitrage</h3>
              <label>
                Flotte estimée
                <input
                  list="fleet-presets"
                  value={editing.fleet}
                  onChange={(e) =>
                    setEditing({ ...editing, fleet: e.target.value })
                  }
                />
              </label>
              <label>
                Nombre de véhicules
                <input
                  type="number"
                  min="0"
                  value={editing.fleetCount ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      fleetCount: e.target.value
                        ? Number(e.target.value)
                        : null,
                      fleet: e.target.value
                        ? `${e.target.value} véhicules`
                        : editing.fleet,
                    })
                  }
                />
              </label>
              <label>
                Fiabilité de l’estimation
                <select
                  value={editing.fleetConfidence || "À vérifier"}
                  onChange={(e) =>
                    setEditing({ ...editing, fleetConfidence: e.target.value })
                  }
                >
                  <option>À vérifier</option>
                  <option>Faible</option>
                  <option>Moyenne</option>
                  <option>Confirmée</option>
                </select>
              </label>
              <label>
                Type de véhicules
                <input
                  list="vehicle-type-presets"
                  value={editing.fleetTypes || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, fleetTypes: e.target.value })
                  }
                  placeholder="Utilitaires, VL, poids lourds…"
                />
              </label>
              <label>
                Intensité d’utilisation
                <select
                  value={editing.usageIntensity || "À vérifier"}
                  onChange={(e) =>
                    setEditing({ ...editing, usageIntensity: e.target.value })
                  }
                >
                  <option>À vérifier</option>
                  <option>Faible</option>
                  <option>Normale</option>
                  <option>Forte</option>
                  <option>Très forte</option>
                </select>
              </label>
              <label>
                Prestataire vitrage actuel
                <select
                  value={editing.currentGlassPartner || "Inconnu"}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      currentGlassPartner: e.target.value,
                    })
                  }
                >
                  <option>Inconnu</option>
                  <option>Aucun</option>
                  <option>Oui</option>
                  <option>Gestion interne</option>
                  <option>Gestion assurance</option>
                </select>
              </label>
              <label>
                Détail du prestataire
                <input
                  value={editing.glassPartnerDetails || ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      glassPartnerDetails: e.target.value,
                    })
                  }
                  placeholder="Nom, contrat, échéance…"
                />
              </label>
              <h3 className="formsection full">Contact principal</h3>
              <label>
                Téléphone
                <input
                  value={editing.phone}
                  onChange={(e) =>
                    setEditing({ ...editing, phone: e.target.value })
                  }
                />
              </label>
              <label>
                E-mail professionnel
                <input
                  type="email"
                  value={editing.email || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, email: e.target.value })
                  }
                  placeholder="contact@entreprise.fr"
                />
              </label>
              <label>
                Décideur / contact
                <input
                  value={editing.contactName || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, contactName: e.target.value })
                  }
                />
              </label>
              <label>
                Fonction du contact
                <input
                  list="contact-role-presets"
                  value={editing.contactRole || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, contactRole: e.target.value })
                  }
                  placeholder="Gérant, responsable de flotte…"
                />
              </label>
              <label>
                Statut de l’e-mail
                <select
                  value={editing.emailStatus || "À vérifier"}
                  onChange={(e) =>
                    setEditing({ ...editing, emailStatus: e.target.value })
                  }
                >
                  <option>À vérifier</option>
                  <option>Valide</option>
                  <option>Invalide</option>
                  <option>Désinscrit</option>
                </select>
              </label>
              <label className="full">
                <span>
                  <input
                    type="checkbox"
                    checked={Boolean(editing.doNotContact)}
                    onChange={(e) =>
                      setEditing({ ...editing, doNotContact: e.target.checked })
                    }
                  />{" "}
                  Ne pas contacter — bloque tous les envois automatiques
                </span>
              </label>
              <label>
                Meilleur moment pour contacter
                <input
                  list="contact-time-presets"
                  value={editing.bestContactTime || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, bestContactTime: e.target.value })
                  }
                  placeholder="Ex. mardi matin, après 16 h…"
                />
              </label>
              <div className="full contactManager">
                <div className="sectionTitle">
                  <div>
                    <b>Autres interlocuteurs</b>
                    <small>Gérant, flotte, comptabilité, assurance…</small>
                  </div>
                  <button type="button" onClick={addContact}>
                    ＋ Ajouter
                  </button>
                </div>
                {(editing.contacts || []).map((contact, index) => (
                  <article className="contactEditor" key={contact.id || index}>
                    <input
                      required
                      value={contact.name}
                      onChange={(e) =>
                        updateContact(index, { name: e.target.value })
                      }
                      placeholder="Nom du contact"
                    />
                    <input
                      list="contact-role-presets"
                      value={contact.role}
                      onChange={(e) =>
                        updateContact(index, { role: e.target.value })
                      }
                      placeholder="Fonction"
                    />
                    <input
                      type="email"
                      value={contact.email}
                      onChange={(e) =>
                        updateContact(index, { email: e.target.value })
                      }
                      placeholder="E-mail"
                    />
                    <input
                      value={contact.phone}
                      onChange={(e) =>
                        updateContact(index, { phone: e.target.value })
                      }
                      placeholder="Téléphone"
                    />
                    <select
                      value={contact.preferredChannel}
                      onChange={(e) =>
                        updateContact(index, {
                          preferredChannel: e.target.value,
                        })
                      }
                    >
                      <option>Téléphone</option>
                      <option>E-mail</option>
                      <option>SMS</option>
                      <option>Visite</option>
                    </select>
                    <label className="miniCheck">
                      <input
                        type="checkbox"
                        checked={contact.isDecisionMaker}
                        onChange={(e) =>
                          updateContact(index, {
                            isDecisionMaker: e.target.checked,
                          })
                        }
                      />
                      Décideur
                    </label>
                    <label className="miniCheck">
                      <input
                        type="radio"
                        name="primaryContact"
                        checked={contact.isPrimary}
                        onChange={() =>
                          updateContact(index, { isPrimary: true })
                        }
                      />
                      Principal
                    </label>
                    <button
                      type="button"
                      className="contactRemove"
                      onClick={() => removeContact(index)}
                    >
                      Retirer
                    </button>
                  </article>
                ))}
              </div>
              <h3 className="formsection full">Suivi commercial</h3>
              <label>
                Statut
                <select
                  value={editing.status}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      status: e.target.value,
                      next: suggestedNextAction(e.target.value),
                    })
                  }
                >
                  <option>Nouveau</option>
                  <option>À contacter</option>
                  <option>Relance</option>
                  <option>Qualifié</option>
                  <option>RDV</option>
                  <option>Offre</option>
                  <option>Gagné</option>
                  <option>Perdu</option>
                </select>
              </label>
              <label>
                Accessibilité
                <select
                  value={editing.access}
                  onChange={(e) =>
                    setEditing({ ...editing, access: e.target.value })
                  }
                >
                  <option>À vérifier</option>
                  <option>Excellent</option>
                  <option>Bon</option>
                  <option>Moyen</option>
                  <option>Difficile</option>
                </select>
              </label>
              <label>
                Gestion assurance probable
                <select
                  value={editing.insurance}
                  onChange={(e) =>
                    setEditing({ ...editing, insurance: e.target.value })
                  }
                >
                  <option>À vérifier</option>
                  <option>Faible</option>
                  <option>Moyenne</option>
                  <option>Forte</option>
                </select>
              </label>
              <label>
                Score / 100
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editing.score}
                  onChange={(e) =>
                    setEditing({ ...editing, score: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Potentiel brut annuel estimé
                <input readOnly value={money(raw)} />
                <small>
                  Estimation commerciale avant probabilité de signature.
                </small>
              </label>
              <label>
                Potentiel pondéré pipeline
                <input readOnly value={money(weighted)} />
                <small>
                  Potentiel brut × probabilité liée à l’étape commerciale.
                  Hypothèses initiales :{" "}
                  {money(COMMERCIAL_ASSUMPTIONS.averageGlassRevenue)} par
                  intervention et{" "}
                  {Math.round(
                    COMMERCIAL_ASSUMPTIONS.annualGlassEventRate * 100,
                  )}
                  % d’événement annuel/véhicule, à calibrer avec l’historique
                  réel.
                </small>
              </label>
              <label>
                CA signé (€)
                <input
                  type="number"
                  min="0"
                  value={editing.signedRevenue}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      signedRevenue: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                CA généré (€)
                <input
                  type="number"
                  min="0"
                  value={editing.generatedRevenue}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      generatedRevenue: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Prochaine action
                <input
                  list="next-action-presets"
                  value={editing.next}
                  onChange={(e) =>
                    setEditing({ ...editing, next: e.target.value })
                  }
                />
              </label>
              <label>
                Échéance de la prochaine action
                <input
                  type="datetime-local"
                  value={
                    editing.nextActionAt
                      ? new Date(editing.nextActionAt)
                          .toISOString()
                          .slice(0, 16)
                      : ""
                  }
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      nextActionAt: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : null,
                    })
                  }
                />
              </label>
              <label className="full">
                Processus de décision
                <input
                  list="decision-presets"
                  value={editing.decisionProcess || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, decisionProcess: e.target.value })
                  }
                  placeholder="Choisir ou saisir le processus"
                />
              </label>
              <label className="full">
                Objections et freins identifiés
                <input
                  list="objection-presets"
                  value={editing.objections || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, objections: e.target.value })
                  }
                  placeholder="Choisir ou saisir un frein"
                />
              </label>
              <label className="full">
                Notes
                <textarea
                  rows={4}
                  value={editing.notes}
                  onChange={(e) =>
                    setEditing({ ...editing, notes: e.target.value })
                  }
                />
              </label>
              <div className="full recordInsights">
                {editing.id ? (
                  <section className="quickActivity">
                    <div className="sectionTitle">
                      <div>
                        <b>Ajouter une information</b>
                        <small>Note structurée et suivi facultatif</small>
                      </div>
                    </div>
                    <div className="quickActivityGrid">
                      <select
                        value={noteType}
                        onChange={(event) => setNoteType(event.target.value)}
                        aria-label="Type d’information"
                      >
                        <option value="note">Note commerciale</option>
                        <option value="qualification">Qualification</option>
                        <option value="need">Besoin identifié</option>
                        <option value="objection">Objection</option>
                        <option value="meeting_note">Compte rendu</option>
                      </select>
                      <select
                        value=""
                        aria-label="Modèle de note"
                        onChange={(event) => {
                          if (event.target.value)
                            setQuickNote(event.target.value);
                        }}
                      >
                        <option value="">Préremplir la note…</option>
                        <option value="Interlocuteur absent lors du passage.">
                          Interlocuteur absent
                        </option>
                        <option value="Le décideur n’était pas disponible. Ses coordonnées restent à obtenir.">
                          Décideur indisponible
                        </option>
                        <option value="L’entreprise possède une flotte de véhicules, taille exacte à confirmer.">
                          Flotte à confirmer
                        </option>
                        <option value="L’entreprise travaille déjà avec un prestataire vitrage.">
                          Prestataire existant
                        </option>
                        <option value="La gestion des sinistres vitrage passe actuellement par l’assurance.">
                          Gestion par assurance
                        </option>
                        <option value="L’interlocuteur souhaite recevoir une présentation par e-mail.">
                          Documentation demandée
                        </option>
                        <option value="L’interlocuteur est intéressé et souhaite convenir d’un rendez-vous.">
                          Intéressé par un rendez-vous
                        </option>
                        <option value="Aucun besoin immédiat, mais l’entreprise accepte d’être recontactée ultérieurement.">
                          À recontacter plus tard
                        </option>
                        <option value="L’entreprise ne souhaite pas être recontactée.">
                          Refus définitif
                        </option>
                      </select>
                      <textarea
                        rows={3}
                        value={quickNote}
                        onChange={(event) => setQuickNote(event.target.value)}
                        placeholder="Information obtenue, contexte, besoin précis…"
                      />
                      <input
                        list="next-action-presets"
                        value={quickNextAction}
                        onChange={(event) =>
                          setQuickNextAction(event.target.value)
                        }
                        placeholder="Prochaine action facultative"
                      />
                      <input
                        type="datetime-local"
                        value={quickNextDate}
                        onChange={(event) =>
                          setQuickNextDate(event.target.value)
                        }
                        aria-label="Échéance de la prochaine action"
                      />
                      <button
                        type="button"
                        className="primary"
                        disabled={noteBusy || !quickNote.trim()}
                        onClick={saveQuickNote}
                      >
                        {noteBusy ? "Enregistrement…" : "Ajouter au dossier"}
                      </button>
                    </div>
                  </section>
                ) : null}
                <section>
                  <div className="sectionTitle">
                    <div>
                      <b>Rendez-vous</b>
                      <small>
                        {appointments.length} rendez-vous enregistré(s)
                      </small>
                    </div>
                    <a href="/agenda">Agenda →</a>
                  </div>
                  {appointments.slice(0, 4).map((appointment) => (
                    <p key={appointment.id}>
                      <b>{appointment.title}</b> ·{" "}
                      {new Date(appointment.startsAt).toLocaleDateString(
                        "fr-FR",
                      )}{" "}
                      · {appointment.status}
                    </p>
                  ))}
                  {!appointments.length && <p>Aucun rendez-vous planifié.</p>}
                </section>
                <section>
                  <div className="sectionTitle">
                    <div>
                      <b>Informations à compléter</b>
                      <small>
                        {quality.missing.length} élément(s) manquant(s)
                      </small>
                    </div>
                  </div>
                  <div className="missingChips">
                    {quality.missing.length ? (
                      quality.missing.map((field) => (
                        <span key={field}>{field}</span>
                      ))
                    ) : (
                      <mark>Dossier complet</mark>
                    )}
                  </div>
                </section>
                <section>
                  <div className="sectionTitle">
                    <div>
                      <b>Documents liés</b>
                      <small>{documents.length} document(s)</small>
                    </div>
                    {editing.id ? (
                      <button
                        type="button"
                        onClick={() => documentInput.current?.click()}
                      >
                        ＋ Lier un document
                      </button>
                    ) : (
                      <small>Enregistrez d’abord la fiche</small>
                    )}
                  </div>
                  {documents.slice(0, 4).map((document) => (
                    <p key={document.id}>
                      <b>{document.name}</b> · {document.category}
                    </p>
                  ))}
                  {!documents.length && <p>Aucun document lié.</p>}
                </section>
                <section className="timelineSection">
                  <div className="sectionTitle">
                    <div>
                      <b>Chronologie commerciale complète</b>
                      <small>{timeline.length} activité(s) regroupée(s)</small>
                    </div>
                  </div>
                  <div className="timelineFilters">
                    {[
                      ["all", "Tout"],
                      ["call", "Appels"],
                      ["email", "E-mails"],
                      ["field", "Terrain"],
                      ["appointment", "RDV"],
                      ["offer", "Offres"],
                      ["task", "Actions"],
                      ["note", "Notes"],
                    ].map(([value, label]) => (
                      <button
                        type="button"
                        className={timelineFilter === value ? "active" : ""}
                        key={value}
                        onClick={() => setTimelineFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="unifiedTimeline">
                    {timeline
                      .filter(
                        (item) =>
                          timelineFilter === "all" ||
                          item.category === timelineFilter,
                      )
                      .slice(0, 40)
                      .map((item) => (
                        <article key={item.id}>
                          <span className={`timelineIcon ${item.category}`}>
                            {item.category === "call"
                              ? "☎"
                              : item.category === "email"
                                ? "✉"
                                : item.category === "field"
                                  ? "⌖"
                                  : item.category === "appointment"
                                    ? "◷"
                                    : item.category === "offer"
                                      ? "€"
                                      : item.category === "document"
                                        ? "▤"
                                        : item.category === "service"
                                          ? "◇"
                                          : item.category === "note"
                                            ? "+"
                                            : item.category === "task"
                                              ? "✓"
                                              : "•"}
                          </span>
                          <div>
                            <header>
                              <b>{item.title}</b>
                              <time>
                                {new Date(item.at).toLocaleString("fr-FR", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
                              </time>
                            </header>
                            {item.detail ? <p>{item.detail}</p> : null}
                            <small>{item.status.replaceAll("_", " ")}</small>
                          </div>
                        </article>
                      ))}
                  </div>
                  {!timeline.length && <p>Aucun historique enregistré.</p>}
                </section>
              </div>
              <datalist id="sector-presets">
                {[
                  "Garage / automobile",
                  "Carrosserie",
                  "Transport / logistique",
                  "Livraison / messagerie",
                  "BTP / travaux",
                  "Plomberie / chauffage",
                  "Électricité",
                  "Nettoyage professionnel",
                  "Paysagisme / espaces verts",
                  "Sécurité",
                  "Ambulance / transport sanitaire",
                  "Taxi / VTC",
                  "Location de véhicules",
                  "Maintenance industrielle",
                  "Commerce / distribution",
                  "Collectivité / association",
                ].map((value) => (
                  <option value={value} key={value} />
                ))}
              </datalist>
              <datalist id="zone-presets">
                {[
                  "Arnavaux",
                  "Saint-Pierre",
                  "Marseille 4/5/6",
                  "Marseille Est",
                  "Marseille Nord",
                  "La Valentine",
                  "La Capelette",
                  "Vitrolles",
                  "Marignane",
                  "Aubagne",
                  "Gémenos",
                  "Aix-en-Provence / Les Milles",
                ].map((value) => (
                  <option value={value} key={value} />
                ))}
              </datalist>
              <datalist id="city-presets">
                {[
                  "Marseille",
                  "Aubagne",
                  "Gémenos",
                  "Vitrolles",
                  "Marignane",
                  "Aix-en-Provence",
                  "Les Pennes-Mirabeau",
                  "Septèmes-les-Vallons",
                  "Plan-de-Cuques",
                  "Allauch",
                ].map((value) => (
                  <option value={value} key={value} />
                ))}
              </datalist>
              <datalist id="fleet-presets">
                {[
                  "1 à 3 véhicules",
                  "4 à 9 véhicules",
                  "10 à 19 véhicules",
                  "20 à 49 véhicules",
                  "50 véhicules et plus",
                  "Flotte à confirmer",
                ].map((value) => (
                  <option value={value} key={value} />
                ))}
              </datalist>
              <datalist id="vehicle-type-presets">
                {[
                  "Véhicules légers",
                  "Utilitaires",
                  "Utilitaires et véhicules légers",
                  "Poids lourds",
                  "Engins de chantier",
                  "Deux-roues",
                  "Flotte mixte",
                ].map((value) => (
                  <option value={value} key={value} />
                ))}
              </datalist>
              <datalist id="contact-role-presets">
                {[
                  "Gérant",
                  "Directeur",
                  "Responsable de flotte",
                  "Responsable d’exploitation",
                  "Responsable administratif",
                  "Responsable achats",
                  "Responsable maintenance",
                  "Chef d’agence",
                  "Secrétariat",
                  "Comptabilité",
                  "Courtier / assureur",
                ].map((value) => (
                  <option value={value} key={value} />
                ))}
              </datalist>
              <datalist id="contact-time-presets">
                {[
                  "Le matin avant 9 h",
                  "Entre 9 h et 11 h 30",
                  "Entre 12 h et 14 h",
                  "Après 14 h",
                  "Après 16 h",
                  "En fin de journée",
                  "À rappeler sur rendez-vous",
                ].map((value) => (
                  <option value={value} key={value} />
                ))}
              </datalist>
              <datalist id="next-action-presets">
                {[
                  "Identifier le décideur",
                  "Appeler pour convenir d’un rendez-vous",
                  "Envoyer un e-mail de présentation",
                  "Envoyer la documentation commerciale",
                  "Relancer après le passage",
                  "Relancer l’offre commerciale",
                  "Rappeler à la date demandée",
                  "Programmer un passage terrain",
                  "Vérifier les coordonnées",
                  "Aucune relance",
                ].map((value) => (
                  <option value={value} key={value} />
                ))}
              </datalist>
              <datalist id="decision-presets">
                {[
                  "Décision du gérant",
                  "Décision du responsable de flotte",
                  "Validation direction puis comptabilité",
                  "Validation siège / groupe",
                  "Décision après comparaison de devis",
                  "Décision avec l’assureur",
                  "Processus à identifier",
                ].map((value) => (
                  <option value={value} key={value} />
                ))}
              </datalist>
              <datalist id="objection-presets">
                {[
                  "Déjà engagé avec un prestataire",
                  "Tout passe par l’assurance",
                  "Entretien géré en interne",
                  "Tarif jugé trop élevé",
                  "Pas de besoin actuellement",
                  "Flotte trop petite",
                  "Décision prise par le siège",
                  "Interlocuteur non décisionnaire",
                  "À recontacter plus tard",
                  "Aucune objection identifiée",
                ].map((value) => (
                  <option value={value} key={value} />
                ))}
              </datalist>
            </div>
            <div className="modalactions">
              {editing.id && (
                <button type="button" className="danger" onClick={remove}>
                  Supprimer
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)}>
                Annuler
              </button>
              <button className="primary">Enregistrer</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

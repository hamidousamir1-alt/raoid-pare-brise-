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
type ProspectEvent = {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
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
    [events, setEvents] = useState<ProspectEvent[]>([]),
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
    setEvents([]);
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
      setEvents(detail.events || []);
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
            setEvents([]);
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
                  value={editing.sector}
                  onChange={(e) =>
                    setEditing({ ...editing, sector: e.target.value })
                  }
                />
              </label>
              <label>
                Zone
                <input
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
                <textarea
                  rows={2}
                  value={editing.decisionProcess || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, decisionProcess: e.target.value })
                  }
                  placeholder="Qui décide, qui valide, quelles étapes ?"
                />
              </label>
              <label className="full">
                Objections et freins identifiés
                <textarea
                  rows={2}
                  value={editing.objections || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, objections: e.target.value })
                  }
                  placeholder="Prestataire actuel, assurance, tarif, disponibilité…"
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
                      <b>Historique du dossier</b>
                      <small>{events.length} événement(s) conservé(s)</small>
                    </div>
                  </div>
                  {events.slice(0, 12).map((event) => (
                    <p key={event.id}>
                      <time>
                        {new Date(event.createdAt).toLocaleDateString("fr-FR")}
                      </time>
                      <b>{event.eventType.replaceAll("_", " ")}</b>
                    </p>
                  ))}
                  {!events.length && <p>Aucun historique enregistré.</p>}
                </section>
              </div>
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

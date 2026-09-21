"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  COMMERCIAL_ASSUMPTIONS,
  rawAnnualPotential,
  suggestedNextAction,
  weightedPipelinePotential,
} from "../../lib/commercial";
type Prospect = {
  id: string | number;
  name: string;
  sector: string;
  zone: string;
  address: string;
  fleet: string;
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
  const [items, setItems] = useState<Prospect[]>([]),
    [ready, setReady] = useState(false),
    [storage, setStorage] = useState<Storage>("loading"),
    [query, setQuery] = useState(""),
    [editing, setEditing] = useState<Prospect | null>(null),
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
      setEditing(p);
      setOpen(true);
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
      fleet: "",
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
      potentialRevenue: 0,
      signedRevenue: 0,
      generatedRevenue: 0,
      updatedAt: new Date().toISOString().slice(0, 10),
    };
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
    const base = {
        ...editing,
        next: editing.next.trim() || suggestedNextAction(editing.status),
        updatedAt: new Date().toISOString().slice(0, 10),
      },
      value = { ...base, potentialRevenue: weightedPipelinePotential(base) },
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
    raw = editing ? rawAnnualPotential(editing) : 0;
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
            onClick={() => {
              setEditing(p);
              setOpen(true);
            }}
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
            className="modal"
            onSubmit={save}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modalhead">
              <div>
                <p className="eyebrow">FICHE PROSPECT</p>
                <h2>{editing.name || "Nouveau prospect"}</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <div className="formgrid">
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
                Flotte estimée
                <input
                  value={editing.fleet}
                  onChange={(e) =>
                    setEditing({ ...editing, fleet: e.target.value })
                  }
                />
              </label>
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

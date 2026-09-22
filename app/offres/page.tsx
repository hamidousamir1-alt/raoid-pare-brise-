"use client";

import { useEffect, useState } from "react";

type Prospect = {
  id: string;
  name: string;
  email?: string;
  contactName?: string;
  potentialRevenue?: number;
};
type Offer = {
  id: string;
  prospect: string;
  title: string;
  offerType: string;
  status: string;
  amount: number;
  validUntil?: string;
  summary?: string;
};
type Data = {
  offers: Offer[];
  prospects: Prospect[];
  stats: {
    active: number;
    accepted: number;
    acceptedAmount: number;
    urgent: number;
  };
};

const labels: Record<string, string> = {
  draft: "Brouillon",
  sent: "Envoyée",
  viewed: "Consultée",
  accepted: "Acceptée",
  refused: "Refusée",
  expired: "Expirée",
};
const typeLabels: Record<string, string> = {
  partnership: "Proposition de partenariat",
  service: "Présentation de services",
  quote: "Devis",
};
const money = (value = 0) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
function dateIn(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function OffersPage() {
  const [data, setData] = useState<Data | null>(null);
  const [prospectId, setProspectId] = useState("");
  const [offerType, setOfferType] = useState("partnership");
  const [title, setTitle] = useState("Proposition de partenariat vitrage");
  const [amount, setAmount] = useState("0");
  const [validUntil, setValidUntil] = useState(dateIn(30));
  const [summary, setSummary] = useState(
    "Prise en charge du remplacement de pare-brise et de tout vitrage pour la flotte de l’entreprise, avec un interlocuteur local dédié.",
  );
  const [terms, setTerms] = useState(
    "Intervention sur rendez-vous selon les disponibilités. Modalités administratives et assurance à confirmer avec l’entreprise.",
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const response = await fetch("/api/offers", { cache: "no-store" });
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
        "Le suivi des offres sera disponible après la mise à jour de la base.",
      );
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createOffer(event: React.FormEvent) {
    event.preventDefault();
    setBusy("create");
    try {
      const response = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          prospectId,
          offerType,
          title,
          amount,
          validUntil,
          summary,
          terms,
        }),
      });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      alert("La proposition n’a pas pu être créée.");
    } finally {
      setBusy("");
    }
  }

  async function changeStatus(offer: Offer, status: string) {
    let refusalReason = "";
    if (status === "refused") {
      refusalReason =
        prompt(
          "Motif du refus (obligatoire pour adapter la prochaine action) :",
        )?.trim() || "";
      if (!refusalReason) return;
    }
    if (
      status === "accepted" &&
      !confirm(
        "Confirmer l’acceptation de « " +
          offer.title +
          " » par " +
          offer.prospect +
          " ? Le pipeline passera à Gagné.",
      )
    )
      return;
    setBusy(offer.id);
    try {
      const response = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          offerId: offer.id,
          status,
          refusalReason,
        }),
      });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      alert("Le statut de l’offre n’a pas pu être mis à jour.");
    } finally {
      setBusy("");
    }
  }

  const selected = data?.prospects.find((item) => item.id === prospectId);
  return (
    <main className="workspace offersPage">
      <style>
        {
          ".offersPage{display:grid;gap:18px}.offersHead h1{margin:4px 0 7px}.offerKpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.offerKpis article,.offerPanel{background:#fff;border:1px solid #e7eaf0;border-radius:16px;padding:19px}.offerKpis small{display:block;color:#7b8797;font-size:9px}.offerKpis b{display:block;font-size:24px;margin-top:7px}.offerGrid{display:grid;grid-template-columns:.85fr 1.15fr;gap:18px}.offerForm{display:grid;gap:12px;align-content:start}.offerForm label{display:grid;gap:6px;color:#647286;font-size:10px}.offerForm input,.offerForm select,.offerForm textarea{width:100%;padding:11px;border:1px solid #dce2e9;border-radius:9px;background:#fff}.offerForm textarea{min-height:85px;resize:vertical}.offerPair{display:grid;grid-template-columns:1fr 1fr;gap:10px}.offerHint{padding:11px;border-radius:10px;background:#f6f8fa;color:#687587;font-size:11px}.offerCard{padding:16px 0;border-top:1px solid #edf0f4}.offerCard:first-of-type{border-top:0}.offerCard header{display:flex;justify-content:space-between;gap:12px}.offerCard h3{margin:4px 0}.offerCard p{color:#667487;font-size:11px;line-height:1.55}.offerStatus{height:max-content;padding:6px 8px;border-radius:7px;background:#f1f3f6;color:#596679;font-size:9px}.offerStatus.accepted{background:#e9f7ed;color:#287141}.offerStatus.sent,.offerStatus.viewed{background:#fff3df;color:#985800}.offerMeta{display:flex;gap:14px;flex-wrap:wrap;color:#7c8797;font-size:10px}.offerActions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.offerActions button{font-size:10px}.offerEmpty{padding:18px;border-radius:11px;background:#f4f8f5;color:#28633d}@media(max-width:900px){.offerGrid{grid-template-columns:1fr}.offerKpis{grid-template-columns:1fr 1fr}.offerPair{grid-template-columns:1fr}}"
        }
      </style>
      <header className="offersHead">
        <p className="eyebrow">OFFRES & PARTENARIATS</p>
        <h1>De la proposition au partenaire actif.</h1>
        <p className="muted">
          Préparez l’offre, suivez la décision et laissez le CRM organiser les
          relances.
        </p>
      </header>
      {error && <section className="offerPanel">{error}</section>}
      <section className="offerKpis">
        <article>
          <small>OFFRES EN COURS</small>
          <b>{data?.stats.active || 0}</b>
        </article>
        <article>
          <small>À RELANCER RAPIDEMENT</small>
          <b>{data?.stats.urgent || 0}</b>
        </article>
        <article>
          <small>OFFRES ACCEPTÉES</small>
          <b>{data?.stats.accepted || 0}</b>
        </article>
        <article>
          <small>MONTANT ACCEPTÉ</small>
          <b>{money(data?.stats.acceptedAmount || 0)}</b>
        </article>
      </section>
      <section className="offerGrid">
        <form className="offerPanel offerForm" onSubmit={createOffer}>
          <p className="eyebrow">NOUVELLE PROPOSITION</p>
          <h2>Préparer une offre</h2>
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
            <div className="offerHint">
              {selected.contactName || "Interlocuteur à renseigner"} ·{" "}
              {selected.email || "E-mail à renseigner"} · potentiel{" "}
              {money(selected.potentialRevenue)}
            </div>
          )}
          <div className="offerPair">
            <label>
              Type
              <select
                value={offerType}
                onChange={(event) => setOfferType(event.target.value)}
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Montant estimé
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
          </div>
          <label>
            Titre
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Valable jusqu’au
            <input
              type="date"
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
            />
          </label>
          <label>
            Résumé de la proposition
            <textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <label>
            Conditions et précisions
            <textarea
              value={terms}
              onChange={(event) => setTerms(event.target.value)}
            />
          </label>
          <button
            className="primary"
            disabled={busy === "create" || !prospectId}
          >
            {busy === "create" ? "Création…" : "Créer le brouillon"}
          </button>
        </form>
        <section className="offerPanel">
          <p className="eyebrow">SUIVI</p>
          <h2>Propositions commerciales</h2>
          {data?.offers.length ? (
            data.offers.map((offer) => (
              <article className="offerCard" key={offer.id}>
                <header>
                  <div>
                    <small>{offer.prospect}</small>
                    <h3>{offer.title}</h3>
                  </div>
                  <span className={"offerStatus " + offer.status}>
                    {labels[offer.status] || offer.status}
                  </span>
                </header>
                <div className="offerMeta">
                  <span>{typeLabels[offer.offerType]}</span>
                  <b>{money(Number(offer.amount))}</b>
                  <span>Échéance {offer.validUntil || "non renseignée"}</span>
                </div>
                {offer.summary && <p>{offer.summary}</p>}
                <div className="offerActions">
                  {offer.status === "draft" && (
                    <button
                      className="primary"
                      disabled={busy === offer.id}
                      onClick={() => changeStatus(offer, "sent")}
                    >
                      Marquer envoyée
                    </button>
                  )}
                  {offer.status === "sent" && (
                    <button
                      disabled={busy === offer.id}
                      onClick={() => changeStatus(offer, "viewed")}
                    >
                      Marquer consultée
                    </button>
                  )}
                  {["sent", "viewed"].includes(offer.status) && (
                    <>
                      <button
                        className="primary"
                        disabled={busy === offer.id}
                        onClick={() => changeStatus(offer, "accepted")}
                      >
                        Acceptée
                      </button>
                      <button
                        disabled={busy === offer.id}
                        onClick={() => changeStatus(offer, "refused")}
                      >
                        Refusée
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p className="offerEmpty">Aucune proposition créée.</p>
          )}
        </section>
      </section>
    </main>
  );
}

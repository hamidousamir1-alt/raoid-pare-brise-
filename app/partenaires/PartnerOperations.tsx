"use client";

import { useEffect, useMemo, useState } from "react";

type Partner = {
  id: string;
  name: string;
  sector?: string;
  phone?: string;
  email?: string;
  contactName?: string;
  fleetCount?: number;
  signedRevenue?: number;
  generatedRevenue?: number;
  nextAction?: string;
  onboardingStatus?: string;
  satisfaction?: number;
};
type Vehicle = {
  id: string;
  prospectId: string;
  registration: string;
  make?: string;
  model?: string;
  driverName?: string;
};
type ServiceCase = {
  id: string;
  prospectId: string;
  prospect: string;
  registration?: string;
  requestType: string;
  status: string;
  amount: number;
  requestedAt: string;
  scheduledAt?: string;
  insurer?: string;
  claimNumber?: string;
  notes?: string;
  satisfaction?: number;
};
type Data = {
  partners: Partner[];
  vehicles: Vehicle[];
  cases: ServiceCase[];
  stats: {
    active: number;
    completedThisMonth: number;
    revenue: number;
    satisfaction: number;
  };
};
const requestLabels: Record<string, string> = {
  windshield: "Pare-brise",
  side: "Vitrage latéral",
  rear: "Lunette arrière",
  roof: "Toit vitré",
  other: "Autre vitrage",
};
const statusLabels: Record<string, string> = {
  new: "Nouvelle",
  scheduled: "Planifiée",
  in_progress: "En cours",
  completed: "Terminée",
  cancelled: "Annulée",
};
const money = (n = 0) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

export default function PartnerOperations() {
  const [data, setData] = useState<Data | null>(null);
  const [partnerId, setPartnerId] = useState("");
  const [registration, setRegistration] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [driverName, setDriverName] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [requestType, setRequestType] = useState("windshield");
  const [insurer, setInsurer] = useState("");
  const [claimNumber, setClaimNumber] = useState("");
  const [amount, setAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const response = await fetch("/api/partners", { cache: "no-store" });
      if (response.status === 401) {
        location.href = "/login";
        return;
      }
      if (!response.ok) throw new Error();
      const payload = (await response.json()) as Data;
      setData(payload);
      setPartnerId((current) => current || payload.partners[0]?.id || "");
      setError("");
    } catch {
      setError(
        "Le suivi opérationnel sera disponible après la mise à jour de la base.",
      );
    }
  }
  useEffect(() => {
    load();
  }, []);

  const partner = data?.partners.find((item) => item.id === partnerId);
  const vehicles = useMemo(
    () => data?.vehicles.filter((item) => item.prospectId === partnerId) || [],
    [data, partnerId],
  );
  const cases = useMemo(
    () => data?.cases.filter((item) => item.prospectId === partnerId) || [],
    [data, partnerId],
  );

  async function action(payload: Record<string, unknown>, key: string) {
    setBusy(key);
    try {
      const response = await fetch("/api/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      alert("L’opération n’a pas pu être enregistrée.");
    } finally {
      setBusy("");
    }
  }

  async function addVehicle(event: React.FormEvent) {
    event.preventDefault();
    await action(
      {
        action: "vehicle",
        prospectId: partnerId,
        registration,
        make,
        model,
        driverName,
      },
      "vehicle",
    );
    setRegistration("");
    setMake("");
    setModel("");
    setDriverName("");
  }
  async function addCase(event: React.FormEvent) {
    event.preventDefault();
    await action(
      {
        action: "case",
        prospectId: partnerId,
        vehicleId,
        requestType,
        insurer,
        claimNumber,
        amount,
        notes,
      },
      "case",
    );
    setVehicleId("");
    setInsurer("");
    setClaimNumber("");
    setAmount("0");
    setNotes("");
  }
  async function changeCase(item: ServiceCase, status: string) {
    let scheduledAt: string | null = null;
    let finalAmount = Number(item.amount || 0);
    if (status === "scheduled") {
      scheduledAt =
        prompt("Date et heure (exemple : 2026-09-25 09:00) :") || "";
      if (!scheduledAt) return;
    }
    if (status === "completed") {
      const entered = prompt(
        "Montant réel de l’intervention :",
        String(finalAmount),
      );
      if (
        entered === null ||
        !Number.isFinite(Number(entered)) ||
        Number(entered) < 0
      )
        return;
      finalAmount = Number(entered);
    }
    await action(
      {
        action: "case_status",
        caseId: item.id,
        status,
        scheduledAt,
        amount: finalAmount,
      },
      item.id,
    );
  }
  async function rate(item: ServiceCase) {
    const entered = prompt("Satisfaction du partenaire, de 1 à 5 :", "5");
    const rating = Number(entered);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
    await action({ action: "satisfaction", caseId: item.id, rating }, item.id);
  }

  return (
    <div className="partnerOps">
      <style>
        {
          ".partnerOps{display:grid;gap:18px}.opsHead{display:flex;justify-content:space-between;align-items:flex-end;gap:18px}.opsHead h1{margin:4px 0 7px}.opsHead select{min-width:260px;padding:11px;border:1px solid #dce2e9;border-radius:10px;background:#fff}.opsKpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.opsKpis article,.opsPanel{background:#fff;border:1px solid #e7eaf0;border-radius:16px;padding:19px}.opsKpis small{display:block;color:#7b8797;font-size:9px}.opsKpis b{display:block;font-size:23px;margin-top:7px}.partnerSummary{display:grid;grid-template-columns:1.1fr .9fr;gap:18px}.partnerCard{background:linear-gradient(120deg,#07111f,#172536);color:#fff;border-radius:18px;padding:24px}.partnerCard p{color:#aeb8c5}.partnerCard .primary{margin-top:12px}.partnerNumbers{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:18px}.partnerNumbers div{padding:12px;background:rgba(255,255,255,.06);border-radius:10px}.partnerNumbers small,.partnerNumbers b{display:block}.partnerNumbers small{color:#aeb8c5;font-size:8px}.opsGrid{display:grid;grid-template-columns:.8fr 1.2fr;gap:18px}.opsForms{display:grid;gap:18px}.opsForm{display:grid;gap:10px}.opsForm label{display:grid;gap:5px;color:#657386;font-size:10px}.opsForm input,.opsForm select,.opsForm textarea{width:100%;padding:10px;border:1px solid #dce2e9;border-radius:9px;background:#fff}.opsForm textarea{min-height:70px}.fieldPair{display:grid;grid-template-columns:1fr 1fr;gap:9px}.vehicleTag{display:inline-flex;padding:6px 8px;margin:4px;border-radius:7px;background:#f2f5f7;font-size:10px}.caseLine{padding:15px 0;border-top:1px solid #edf0f4}.caseLine:first-of-type{border-top:0}.caseLine header{display:flex;justify-content:space-between;gap:10px}.caseLine p{color:#687587;font-size:11px;line-height:1.5}.caseStatus{padding:6px 8px;border-radius:7px;background:#eef2f6;font-size:9px;height:max-content}.caseStatus.completed{background:#e8f7ed;color:#26703f}.caseActions{display:flex;gap:7px;flex-wrap:wrap}.caseActions button{font-size:10px}.opsEmpty{padding:16px;border-radius:10px;background:#f4f8f5;color:#28633d}@media(max-width:900px){.opsKpis{grid-template-columns:1fr 1fr}.partnerSummary,.opsGrid{grid-template-columns:1fr}.opsHead{align-items:flex-start;flex-direction:column}.opsHead select{width:100%;min-width:0}.fieldPair{grid-template-columns:1fr}}"
        }{" "}
      </style>
      <header className="opsHead">
        <div>
          <p className="eyebrow">PARTENAIRES ACTIFS</p>
          <h1>Du partenariat signé à la satisfaction.</h1>
          <p className="muted">
            Parc, demandes vitrage, interventions et valeur générée dans un seul
            suivi.
          </p>
        </div>
        <select
          value={partnerId}
          onChange={(e) => {
            setPartnerId(e.target.value);
            setVehicleId("");
          }}
        >
          <option value="">Choisir un partenaire</option>
          {data?.partners.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </header>
      {error && <section className="opsPanel">{error}</section>}
      <section className="opsKpis">
        <article>
          <small>PARTENAIRES ACTIFS</small>
          <b>{data?.partners.length || 0}</b>
        </article>
        <article>
          <small>DEMANDES EN COURS</small>
          <b>{data?.stats.active || 0}</b>
        </article>
        <article>
          <small>TERMINÉES CE MOIS</small>
          <b>{data?.stats.completedThisMonth || 0}</b>
        </article>
        <article>
          <small>CA INTERVENTIONS</small>
          <b>{money(data?.stats.revenue || 0)}</b>
        </article>
      </section>
      {partner ? (
        <>
          <section className="partnerSummary">
            <article className="partnerCard">
              <p className="eyebrow">RELATION PARTENAIRE</p>
              <h2>{partner.name}</h2>
              <p>
                {partner.contactName || "Contact à renseigner"} ·{" "}
                {partner.phone || partner.email || "Coordonnées à renseigner"}
              </p>
              <div className="partnerNumbers">
                <div>
                  <small>PARC DÉTAILLÉ</small>
                  <b>{vehicles.length} véhicule(s)</b>
                </div>
                <div>
                  <small>CA SIGNÉ</small>
                  <b>{money(Number(partner.signedRevenue))}</b>
                </div>
                <div>
                  <small>SATISFACTION</small>
                  <b>
                    {partner.satisfaction
                      ? partner.satisfaction + "/5"
                      : "À mesurer"}
                  </b>
                </div>
              </div>
              {partner.onboardingStatus !== "active" && (
                <button
                  className="primary"
                  disabled={busy === "activate"}
                  onClick={() =>
                    action(
                      { action: "activate", prospectId: partner.id },
                      "activate",
                    )
                  }
                >
                  Activer le partenariat
                </button>
              )}
            </article>
            <article className="opsPanel">
              <p className="eyebrow">PARC VÉHICULES</p>
              <h2>Véhicules enregistrés</h2>
              {vehicles.length ? (
                vehicles.map((vehicle) => (
                  <span className="vehicleTag" key={vehicle.id}>
                    {vehicle.registration} · {vehicle.make} {vehicle.model}
                  </span>
                ))
              ) : (
                <p className="opsEmpty">Aucun véhicule détaillé.</p>
              )}
            </article>
          </section>
          <section className="opsGrid">
            <div className="opsForms">
              <form className="opsPanel opsForm" onSubmit={addVehicle}>
                <p className="eyebrow">AJOUTER UN VÉHICULE</p>
                <div className="fieldPair">
                  <label>
                    Immatriculation
                    <input
                      required
                      value={registration}
                      onChange={(e) => setRegistration(e.target.value)}
                    />
                  </label>
                  <label>
                    Conducteur
                    <input
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                    />
                  </label>
                </div>
                <div className="fieldPair">
                  <label>
                    Marque
                    <input
                      value={make}
                      onChange={(e) => setMake(e.target.value)}
                    />
                  </label>
                  <label>
                    Modèle
                    <input
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                    />
                  </label>
                </div>
                <button className="primary" disabled={busy === "vehicle"}>
                  Ajouter au parc
                </button>
              </form>
              <form className="opsPanel opsForm" onSubmit={addCase}>
                <p className="eyebrow">NOUVELLE DEMANDE VITRAGE</p>
                <div className="fieldPair">
                  <label>
                    Véhicule
                    <select
                      value={vehicleId}
                      onChange={(e) => setVehicleId(e.target.value)}
                    >
                      <option value="">Non identifié</option>
                      {vehicles.map((v) => (
                        <option value={v.id} key={v.id}>
                          {v.registration}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Vitrage
                    <select
                      value={requestType}
                      onChange={(e) => setRequestType(e.target.value)}
                    >
                      {Object.entries(requestLabels).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="fieldPair">
                  <label>
                    Assureur
                    <input
                      value={insurer}
                      onChange={(e) => setInsurer(e.target.value)}
                    />
                  </label>
                  <label>
                    N° sinistre
                    <input
                      value={claimNumber}
                      onChange={(e) => setClaimNumber(e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  Montant estimé
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label>
                  Précisions
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                <button className="primary" disabled={busy === "case"}>
                  Créer la demande
                </button>
              </form>
            </div>
            <section className="opsPanel">
              <p className="eyebrow">DOSSIERS VITRAGE</p>
              <h2>Suivi des interventions</h2>
              {cases.length ? (
                cases.map((item) => (
                  <article className="caseLine" key={item.id}>
                    <header>
                      <div>
                        <b>{requestLabels[item.requestType]}</b>
                        <p>
                          {item.registration || "Véhicule non identifié"} ·{" "}
                          {money(Number(item.amount))}
                        </p>
                      </div>
                      <span className={"caseStatus " + item.status}>
                        {statusLabels[item.status]}
                      </span>
                    </header>
                    {item.notes && <p>{item.notes}</p>}
                    <div className="caseActions">
                      {item.status === "new" && (
                        <button onClick={() => changeCase(item, "scheduled")}>
                          Planifier
                        </button>
                      )}
                      {item.status === "scheduled" && (
                        <button onClick={() => changeCase(item, "in_progress")}>
                          Démarrer
                        </button>
                      )}
                      {["new", "scheduled", "in_progress"].includes(
                        item.status,
                      ) && (
                        <button
                          className="primary"
                          onClick={() => changeCase(item, "completed")}
                        >
                          Terminer
                        </button>
                      )}
                      {item.status === "completed" && !item.satisfaction && (
                        <button onClick={() => rate(item)}>
                          Noter la satisfaction
                        </button>
                      )}
                      {item.satisfaction && (
                        <span>★ {item.satisfaction}/5</span>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <p className="opsEmpty">
                  Aucune demande vitrage pour ce partenaire.
                </p>
              )}
            </section>
          </section>
        </>
      ) : (
        !error && (
          <section className="opsPanel">
            <p className="opsEmpty">
              Un prospect apparaît ici dès qu’une offre est acceptée et qu’il
              passe au statut Gagné.
            </p>
          </section>
        )
      )}
    </div>
  );
}

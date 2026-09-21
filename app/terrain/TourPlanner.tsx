"use client";
import { useEffect, useMemo, useState } from "react";
type Prospect = {
  id: string;
  name: string;
  sector?: string;
  zone?: string;
  address?: string;
  fleet?: string;
  phone?: string;
  score: number;
  notes?: string;
  access?: string;
  insurance?: string;
  status?: string;
  potentialRevenue?: number;
  doNotContact?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  lastFieldVisitAt?: string | null;
  fieldVisitCount?: number;
};
type Stop = Prospect & { priority: number; distance: number; reason: string };
type Position = { latitude: number; longitude: number };
const zonePoints: Record<string, Position> = {
  Arnavaux: { latitude: 43.3428, longitude: 5.3776 },
  "Saint-Pierre": { latitude: 43.2917, longitude: 5.4142 },
  "Marseille Est": { latitude: 43.2906, longitude: 5.4385 },
  Aubagne: { latitude: 43.2928, longitude: 5.5707 },
};
const rad = (n: number) => (n * Math.PI) / 180;
const km = (a: Position, b: Position) => {
  const dLat = rad(b.latitude - a.latitude),
    dLon = rad(b.longitude - a.longitude),
    x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.latitude)) *
        Math.cos(rad(b.latitude)) *
        Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
const point = (p: Prospect): Position | undefined =>
  Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
    ? { latitude: Number(p.latitude), longitude: Number(p.longitude) }
    : Object.entries(zonePoints).find(([z]) =>
        `${p.zone || ""} ${p.address || ""}`
          .toLowerCase()
          .includes(z.toLowerCase()),
      )?.[1];
const maps = (p: Prospect) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.address?.trim() || `${p.name}, ${p.zone || "Marseille"}, France`)}&travelmode=driving&dir_action=navigate`;
const waze = (p: Prospect) =>
  `https://waze.com/ul?q=${encodeURIComponent(p.address?.trim() || `${p.name}, ${p.zone || "Marseille"}, France`)}&navigate=yes&utm_source=rapid_pare_brise_crm`;
function freshness(p: Prospect) {
  if (!p.lastFieldVisitAt) return 18;
  const days = (Date.now() - new Date(p.lastFieldVisitAt).getTime()) / 86400000;
  return days < 14 ? -35 : days < 30 ? -15 : 5;
}
function accessValue(v = "À vérifier") {
  return v === "Excellent"
    ? 22
    : v === "Bon"
      ? 16
      : v === "Moyen"
        ? 6
        : v === "Difficile"
          ? -30
          : 8;
}
function commercialValue(p: Prospect) {
  const potential = p.potentialRevenue || 0,
    base = Math.min(55, (p.score || 50) * 0.42 + Math.log10(potential + 1) * 4),
    insurance =
      p.insurance === "Forte" ? -14 : p.insurance === "Moyenne" ? -5 : 0;
  return base + accessValue(p.access) + freshness(p) + insurance;
}
function orderNearest(items: Stop[], start: Position) {
  const left = [...items],
    ordered: Stop[] = [];
  let here = start;
  while (left.length) {
    let best = 0,
      bestKm = Infinity;
    left.forEach((s, i) => {
      const pos = point(s);
      if (!pos) return;
      const d = km(here, pos);
      if (d < bestKm) {
        best = i;
        bestKm = d;
      }
    });
    const next = left.splice(best, 1)[0],
      pos = point(next);
    ordered.push({ ...next, distance: Number.isFinite(bestKm) ? bestKm : 3 });
    if (pos) here = pos;
  }
  return ordered;
}
export default function TourPlanner() {
  const [raw, setRaw] = useState<Prospect[]>([]),
    [excluded, setExcluded] = useState<string[]>([]),
    [done, setDone] = useState<string[]>([]),
    [limit, setLimit] = useState(10),
    [zone, setZone] = useState("Automatique"),
    [position, setPosition] = useState<Position | undefined>(),
    [busy, setBusy] = useState("");
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await fetch("/api/prospects", { cache: "no-store" });
        if (r.status === 401) {
          location.href = "/login";
          return;
        }
        if (!r.ok) return;
        const d = await r.json();
        if (d.mode === "postgresql" && live) setRaw(d.items || []);
      } catch {}
    })();
    return () => {
      live = false;
    };
  }, []);
  const eligible = useMemo(
    () =>
      raw.filter(
        (p) =>
          !p.doNotContact &&
          !["Perdu", "Gagné"].includes(p.status || "") &&
          p.access !== "Difficile" &&
          !excluded.includes(p.id) &&
          !done.includes(p.id),
      ),
    [raw, excluded, done],
  );
  const selectedZone = useMemo(() => {
    if (zone !== "Automatique") return zone;
    const groups = new Map<string, { count: number; score: number }>();
    eligible.forEach((p) => {
      const label =
        Object.keys(zonePoints).find((z) =>
          `${p.zone || ""} ${p.address || ""}`
            .toLowerCase()
            .includes(z.toLowerCase()),
        ) ||
        p.zone ||
        "Marseille";
      const old = groups.get(label) || { count: 0, score: 0 };
      groups.set(label, {
        count: old.count + 1,
        score: old.score + commercialValue(p),
      });
    });
    return (
      [...groups.entries()].sort(
        (a, b) => b[1].score + b[1].count * 8 - (a[1].score + a[1].count * 8),
      )[0]?.[0] || "Marseille"
    );
  }, [eligible, zone]);
  const center =
    position || zonePoints[selectedZone] || zonePoints["Marseille Est"];
  const candidates = useMemo(
    () =>
      eligible
        .filter((p) =>
          zone === "Automatique"
            ? `${p.zone || ""} ${p.address || ""}`
                .toLowerCase()
                .includes(selectedZone.toLowerCase()) || !point(p)
            : `${p.zone || ""} ${p.address || ""}`
                .toLowerCase()
                .includes(zone.toLowerCase()),
        )
        .map((p) => ({
          ...p,
          priority: commercialValue(p),
          distance: 0,
          reason:
            p.notes ||
            `${p.access || "Accès à vérifier"} • assurance ${p.insurance || "à vérifier"}`,
        }))
        .sort((a, b) => b.priority - a.priority)
        .slice(0, Math.max(limit * 2, 16)),
    [eligible, limit, selectedZone, zone],
  );
  const plan = useMemo(
    () => orderNearest(candidates.slice(0, limit), center),
    [candidates, limit, center.latitude, center.longitude],
  );
  const distance = plan.reduce((sum, s) => sum + s.distance, 0);
  function locate() {
    navigator.geolocation?.getCurrentPosition(
      (p) =>
        setPosition({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        }),
      () =>
        alert(
          "Position non disponible. La tournée utilisera le centre de la zone.",
        ),
    );
  }
  async function outcome(s: Stop, value: string) {
    setBusy(s.id);
    const note =
      value === "visited"
        ? prompt("Note rapide ou nom de la personne rencontrée", "") || ""
        : "";
    try {
      const r = await fetch("/api/terrain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectId: s.id,
          outcome: value,
          note,
          latitude: position?.latitude,
          longitude: position?.longitude,
        }),
      });
      if (!r.ok) throw new Error();
      setDone((old) => [...old, s.id]);
    } catch {
      alert("La visite n’a pas pu être enregistrée.");
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <section className="strategy dailyMission">
        <div>
          <p className="eyebrow">MISSION TERRAIN DU JOUR</p>
          <h2>{selectedZone}</h2>
          <p>
            {plan.length} entreprises accessibles sélectionnées et ordonnées
            automatiquement.
          </p>
        </div>
        <div className="strategyStats">
          <b>
            {plan.length}
            <small>arrêts</small>
          </b>
          <b>
            {distance.toFixed(1)} km<small>estimés</small>
          </b>
          <b>
            {Math.round(
              plan.reduce((a, s) => a + s.priority, 0) / (plan.length || 1),
            )}
            <small>priorité</small>
          </b>
        </div>
        <a
          className="startTour"
          href={plan[0] ? maps(plan[0]) : "#"}
          target="_blank"
          rel="noopener noreferrer"
        >
          Commencer la tournée
        </a>
      </section>
      <div className="plannerbar mobilePlanner">
        <label>
          Zone
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            <option>Automatique</option>
            {Object.keys(zonePoints).map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </label>
        <label>
          Visites
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {[5, 8, 10, 12, 15].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <button onClick={locate}>⌖ Ma position</button>
        <span className="auto">Gratuit · aucune API payante</span>
      </div>
      <div className="terrainGrid">
        <section className="panel stopList">
          <div className="panelhead">
            <div>
              <h2>Parcours recommandé</h2>
              <p>Priorité commerciale, accessibilité et proximité</p>
            </div>
          </div>
          {plan.map((s, i) => (
            <article className="stop smartstop" key={s.id}>
              <span className="stopnum">{i + 1}</span>
              <div>
                <h3>{s.name}</h3>
                <p>{s.address?.trim() || s.zone || "Adresse à vérifier"}</p>
                <div className="stopchips">
                  <small>🚐 {s.fleet || "flotte à qualifier"}</small>
                  <small>⌖ ~{s.distance.toFixed(1)} km</small>
                  <small>{s.access || "accès à vérifier"}</small>
                </div>
                <div className="navlinks">
                  <a href={maps(s)} target="_blank" rel="noopener noreferrer">
                    Itinéraire
                  </a>
                  {s.phone && <a href={`tel:${s.phone}`}>Appeler</a>}
                  <a href={waze(s)} target="_blank" rel="noopener noreferrer">
                    Waze
                  </a>
                </div>
                <div className="visitActions">
                  <button
                    disabled={busy === s.id}
                    onClick={() => outcome(s, "visited")}
                  >
                    Prospecté
                  </button>
                  <button
                    disabled={busy === s.id}
                    onClick={() => outcome(s, "absent")}
                  >
                    Absent
                  </button>
                  <button
                    disabled={busy === s.id}
                    onClick={() => outcome(s, "callback")}
                  >
                    À relancer
                  </button>
                  <button
                    disabled={busy === s.id}
                    onClick={() => outcome(s, "closed")}
                  >
                    Fermé
                  </button>
                </div>
              </div>
              <b>{Math.round(s.priority)}</b>
              <button
                aria-label={`Retirer ${s.name} de la tournée`}
                title="Retirer de cette tournée"
                onClick={() => setExcluded((old) => [...old, s.id])}
              >
                ×
              </button>
            </article>
          ))}
          {!plan.length && (
            <p>
              Aucun prospect éligible dans cette zone. Ajoute ou qualifie des
              entreprises depuis Prospection.
            </p>
          )}
        </section>
        <section className="mapfake mobileMap">
          <div className="mapgrid" />
          <div className="route">
            {plan.map((s, i) => (
              <span key={s.id}>●{i < plan.length - 1 && <i />}</span>
            ))}
          </div>
          <div className="maplabel">
            <b>{selectedZone}</b>
            <br />
            Le CRM calcule gratuitement l’ordre géographique. Google Maps ou
            Waze prend ensuite en charge la navigation réelle.
          </div>
        </section>
      </div>
    </>
  );
}

export type CommercialProspect = {
  fleet?: string;
  fleetCount?: number | null;
  sector?: string;
  status?: string;
  access?: string;
  insurance?: string;
};

// Hypothèses commerciales de départ : à calibrer progressivement avec les données réelles Rapid Pare-Brise.
export const COMMERCIAL_ASSUMPTIONS = {
  averageGlassRevenue: 450,
  annualGlassEventRate: 0.65,
} as const;

export function fleetMid(f = "") {
  const n = (f.match(/\d+/g) || []).map(Number);
  return n.length > 1 ? (n[0] + n[n.length - 1]) / 2 : n[0] || 0;
}
export function stageProbability(status = "Nouveau") {
  const values: Record<string, number> = {
    Nouveau: 0.2,
    "À contacter": 0.25,
    Relance: 0.35,
    Qualifié: 0.5,
    RDV: 0.65,
    Offre: 0.8,
    Gagné: 1,
    Perdu: 0,
  };
  return values[status] ?? 0.2;
}
export function rawAnnualPotential(p: CommercialProspect) {
  const vehicles = Number(p.fleetCount) || fleetMid(p.fleet);
  if (!vehicles) return 0;
  const access: Record<string, number> = {
    "À vérifier": 0.8,
    Excellent: 1.05,
    Bon: 1,
    Moyen: 0.85,
    Difficile: 0.6,
  };
  const insurance: Record<string, number> = {
    "À vérifier": 0.85,
    Faible: 1,
    Moyenne: 0.8,
    Forte: 0.55,
  };
  const exposure =
    /BTP|CVC|Maintenance|Paysage|Nettoyage|Livraison|Transport|Ambulance|Taxi/i.test(
      p.sector || "",
    )
      ? 1.15
      : 1;
  const base =
    vehicles *
    COMMERCIAL_ASSUMPTIONS.averageGlassRevenue *
    COMMERCIAL_ASSUMPTIONS.annualGlassEventRate;
  return (
    Math.round(
      (base *
        (access[p.access || "À vérifier"] ?? 0.8) *
        (insurance[p.insurance || "À vérifier"] ?? 0.85) *
        exposure) /
        50,
    ) * 50
  );
}
export function weightedPipelinePotential(p: CommercialProspect) {
  return (
    Math.round((rawAnnualPotential(p) * stageProbability(p.status)) / 50) * 50
  );
}
export function suggestedNextAction(status = "Nouveau") {
  return status === "Nouveau"
    ? "Qualifier le prospect"
    : status === "À contacter"
      ? "Appeler aujourd’hui"
      : status === "Relance"
        ? "Relancer"
        : status === "Qualifié"
          ? "Proposer un RDV"
          : status === "RDV"
            ? "Préparer le RDV"
            : status === "Offre"
              ? "Relancer et sécuriser la décision"
              : status === "Gagné"
                ? "Fidéliser le partenaire"
                : "À planifier";
}

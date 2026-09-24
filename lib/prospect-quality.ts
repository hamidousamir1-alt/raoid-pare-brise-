export type QualityProspect = {
  name?: string;
  sector?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
  email?: string;
  siret?: string;
  website?: string;
  fleetCount?: number | null;
  fleetTypes?: string;
  fleetConfidence?: string;
  companySize?: string;
  contactName?: string;
  contactRole?: string;
  access?: string;
  insurance?: string;
  currentGlassPartner?: string;
  next?: string;
};

const present = (value: unknown) =>
  value !== null && value !== undefined && String(value).trim() !== "";

export function prospectQuality(prospect: QualityProspect) {
  const checks = [
    ["Nom de l’entreprise", present(prospect.name), 8],
    ["Activité", present(prospect.sector), 6],
    ["Adresse", present(prospect.address), 8],
    ["Code postal", present(prospect.postalCode), 4],
    ["Ville", present(prospect.city), 4],
    ["Téléphone", present(prospect.phone), 8],
    ["E-mail", present(prospect.email), 8],
    ["SIRET", present(prospect.siret), 6],
    ["Site internet", present(prospect.website), 3],
    ["Nombre de véhicules", Number(prospect.fleetCount) > 0, 10],
    ["Type de flotte", present(prospect.fleetTypes), 6],
    [
      "Fiabilité de l’estimation",
      present(prospect.fleetConfidence) &&
        prospect.fleetConfidence !== "À vérifier",
      4,
    ],
    [
      "Taille d’entreprise",
      present(prospect.companySize) && prospect.companySize !== "À qualifier",
      4,
    ],
    ["Décideur", present(prospect.contactName), 8],
    ["Fonction du décideur", present(prospect.contactRole), 4],
    [
      "Accessibilité",
      present(prospect.access) && prospect.access !== "À vérifier",
      4,
    ],
    [
      "Gestion assurance",
      present(prospect.insurance) && prospect.insurance !== "À vérifier",
      4,
    ],
    [
      "Prestataire vitrage",
      present(prospect.currentGlassPartner) &&
        prospect.currentGlassPartner !== "Inconnu",
      3,
    ],
    ["Prochaine action", present(prospect.next), 8],
  ] as const;
  const earned = checks.reduce(
      (sum, [, ok, weight]) => sum + (ok ? weight : 0),
      0,
    ),
    total = checks.reduce((sum, [, , weight]) => sum + weight, 0),
    score = Math.round((earned / total) * 100);
  return {
    score,
    missing: checks.filter(([, ok]) => !ok).map(([label]) => label),
  };
}

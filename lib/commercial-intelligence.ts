import { rawAnnualPotential, stageProbability } from "./commercial";

export type IntelligenceProspect = {
  id: string;
  name: string;
  sector?: string;
  status?: string;
  score?: number;
  fleet?: string;
  fleetCount?: number | null;
  companySize?: string;
  access?: string;
  insurance?: string;
  phone?: string;
  email?: string;
  dataQualityScore?: number;
  nextActionAt?: string | null;
  lastContactAt?: string | null;
  updatedAt?: string;
  calls?: number;
  positiveCalls?: number;
  visits?: number;
  replies?: number;
  appointments?: number;
  openTasks?: number;
  preferredChannel?: string | null;
  overriddenAction?: string | null;
  observedSample?: number;
  observedSuccessRate?: number;
};

const daysSince = (date?: string | null) =>
  date ? Math.max(0, (Date.now() - new Date(date).getTime()) / 86400000) : 999;
const clamp = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(n)));

export function recommendationFor(p: IntelligenceProspect) {
  const age = daysSince(p.lastContactAt || p.updatedAt);
  const overdue = p.nextActionAt
    ? new Date(p.nextActionAt).getTime() < Date.now()
    : false;
  const fit =
    Math.min(22, (p.score || 50) * 0.22) +
    (/PME|TPE/i.test(p.companySize || "") ? 5 : 2) +
    (/BTP|Transport|Livraison|Maintenance|Nettoyage|Paysage|Ambulance|Taxi|Location/i.test(
      p.sector || "",
    )
      ? 8
      : 3);
  const engagement =
    Math.min(18, (p.positiveCalls || 0) * 7 + (p.replies || 0) * 8) +
    Math.min(10, (p.visits || 0) * 3) +
    Math.min(10, (p.appointments || 0) * 8);
  const urgency =
    (overdue ? 18 : 0) +
    (age >= 14 ? 12 : age >= 7 ? 7 : age >= 3 ? 3 : 0) +
    ((p.openTasks || 0) > 0 ? 5 : 0);
  const quality = Math.min(10, (p.dataQualityScore || 0) * 0.1);
  const priority = clamp(fit + engagement + urgency + quality);
  const hasPhone = Boolean(p.phone);
  const hasEmail = Boolean(p.email);
  const channel =
    p.preferredChannel ||
    ((p.positiveCalls || 0) > 0 || (hasPhone && !hasEmail)
      ? "Téléphone"
      : (p.replies || 0) > 0 || hasEmail
        ? "E-mail"
        : "Visite terrain");
  const action =
    p.overriddenAction ||
    (overdue
      ? "Traiter la relance en retard"
      : p.status === "Offre"
        ? "Appeler pour sécuriser la décision"
        : p.status === "RDV"
          ? "Préparer et confirmer le rendez-vous"
          : p.status === "Qualifié"
            ? "Appeler pour convenir d’un rendez-vous"
            : p.status === "Relance"
              ? "Effectuer une relance personnalisée"
              : p.status === "Gagné"
                ? "Planifier un point de fidélisation"
                : channel === "Visite terrain"
                  ? "Programmer un passage terrain"
                  : "Qualifier le besoin et le parc automobile");
  const probability = clamp(
    stageProbability(p.status) * 55 +
      engagement * 0.8 +
      fit * 0.45 -
      (age > 30 ? 12 : 0) +
      ((p.observedSample || 0) >= 5
        ? Math.max(-10, Math.min(10, ((p.observedSuccessRate || 0) - 0.2) * 35))
        : 0),
    5,
    p.status === "Gagné" ? 100 : 92,
  );
  const cooling = age >= 21 ? "critique" : age >= 10 ? "à surveiller" : "actif";
  const reasons = [
    overdue ? "échéance dépassée" : "",
    fit >= 28 ? "profil compatible avec une flotte locale" : "",
    engagement >= 12 ? "signaux d’intérêt déjà détectés" : "",
    (p.observedSample || 0) >= 5
      ? `conversion observée du secteur : ${Math.round((p.observedSuccessRate || 0) * 100)}%`
      : "",
    age >= 10 ? `aucun échange depuis ${Math.round(age)} jours` : "",
    (p.dataQualityScore || 0) < 60 ? "coordonnées encore incomplètes" : "",
  ].filter(Boolean);
  if (!reasons.length)
    reasons.push("potentiel calculé à partir du profil actuel");
  const bestTime =
    channel === "Téléphone"
      ? /BTP|Transport|Livraison/i.test(p.sector || "")
        ? "Entre 7h30 et 9h00"
        : "Entre 9h00 et 11h30"
      : channel === "Visite terrain"
        ? "Matinée, avant 11h30"
        : "Envoi entre 8h00 et 10h00";
  const annualPotential = rawAnnualPotential(p);
  const visited = (p.visits || 0) > 0;
  const sectorBenefit = /BTP|Maintenance|Nettoyage|Paysage/i.test(
    p.sector || "",
  )
    ? "limiter l’immobilisation de vos véhicules d’intervention"
    : /Transport|Livraison|Taxi|Ambulance/i.test(p.sector || "")
      ? "maintenir vos véhicules disponibles et réduire leur temps d’immobilisation"
      : "simplifier la prise en charge de vos véhicules";
  const introduction = visited
    ? "Je me permets de revenir vers vous à la suite de mon passage dans vos locaux."
    : "Je me permets de vous contacter au nom de Rapid Pare-Brise Marseille.";
  const subject = visited
    ? `Suite à mon passage – solution vitrage pour ${p.name}`
    : `Solution vitrage pour les véhicules de ${p.name}`;
  const emailBody = `Bonjour,

${introduction}

Nous accompagnons les entreprises pour le remplacement de pare-brise et de tout vitrage automobile. Notre objectif est de ${sectorBenefit}, avec une prise en charge simple et adaptée à votre organisation.

Je souhaiterais échanger quelques minutes avec vous afin de comprendre vos besoins et, si cela est pertinent, convenir d’un rendez-vous.

Bien cordialement,

Samir – Rapid Pare-Brise Marseille
sasvinv13004@outlook.fr`;
  const callOpening = `Bonjour, Samir de Rapid Pare-Brise Marseille. ${visited ? "Je vous appelle à la suite de mon passage dans vos locaux. " : ""}Nous accompagnons les entreprises pour le remplacement de pare-brise et de tout vitrage sur leurs véhicules. Je souhaitais identifier la personne qui gère votre parc automobile et convenir d’un rendez-vous si notre solution peut vous être utile.`;
  return {
    prospectId: p.id,
    prospect: p.name,
    status: p.status || "Nouveau",
    priority,
    probability,
    action,
    channel,
    bestTime,
    cooling,
    reasons,
    annualPotential,
    weightedPotential: Math.round(annualPotential * (probability / 100)),
    learningInfluence:
      (p.observedSample || 0) >= 5
        ? {
            active: true,
            sample: p.observedSample || 0,
            rate: Math.round((p.observedSuccessRate || 0) * 100),
          }
        : { active: false, sample: p.observedSample || 0, rate: 0 },
    contactKit: {
      subject,
      emailBody,
      callOpening,
      canEmail: Boolean(p.email),
      canCall: Boolean(p.phone),
      context: visited ? "Après passage physique" : "Premier contact",
    },
    components: {
      fit: clamp(fit, 0, 35),
      engagement: clamp(engagement, 0, 38),
      urgency: clamp(urgency, 0, 35),
      data: clamp(quality, 0, 10),
    },
  };
}

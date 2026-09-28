export const replyCategories = [
  "interested",
  "callback",
  "information",
  "wrong_contact",
  "objection",
  "not_interested",
  "out_of_office",
  "unsubscribe",
  "ambiguous",
] as const;

export type ReplyCategory = (typeof replyCategories)[number];

export type ReplyDecision = {
  category: ReplyCategory;
  label: string;
  confidence: number;
  needsReview: boolean;
  taskType: string;
  taskTitle: string;
  nextAction: string;
  dueInDays: number;
  priority: number;
};

const has = (text: string, expressions: RegExp[]) =>
  expressions.some((expression) => expression.test(text));

export function classifyReply(subject = "", preview = ""): ReplyDecision {
  const text = `${subject} ${preview}`
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    has(text, [
      /desabonn/,
      /ne (me|nous) contactez plus/,
      /retir(ez|er).*(liste|fichier)/,
      /stop(p?ez)? (les )?(mails|messages)/,
    ])
  )
    return {
      category: "unsubscribe",
      label: "Désinscription",
      confidence: 98,
      needsReview: false,
      taskType: "compliance",
      taskTitle: "Vérifier la désinscription enregistrée",
      nextAction: "Aucun contact — désinscription reçue",
      dueInDays: 0,
      priority: 100,
    };

  if (
    has(text, [
      /absence du bureau/,
      /reponse automatique/,
      /je suis absent/,
      /de retour le/,
      /out of office/,
    ])
  )
    return {
      category: "out_of_office",
      label: "Absence du bureau",
      confidence: 94,
      needsReview: false,
      taskType: "follow_up",
      taskTitle: "Relancer après l’absence",
      nextAction: "Relancer après le retour de l’interlocuteur",
      dueInDays: 7,
      priority: 45,
    };

  if (
    has(text, [
      /pas (la bonne|le bon) (personne|interlocuteur|service)/,
      /voir avec/,
      /contacter .*(responsable|direction|service)/,
      /ne suis pas en charge/,
    ])
  )
    return {
      category: "wrong_contact",
      label: "Mauvais interlocuteur",
      confidence: 88,
      needsReview: true,
      taskType: "qualification",
      taskTitle: "Identifier le bon interlocuteur",
      nextAction: "Obtenir les coordonnées du décideur",
      dueInDays: 0,
      priority: 80,
    };

  if (
    has(text, [
      /rappel(ez|er|le)/,
      /plus tard/,
      /pas disponible/,
      /semaine prochaine/,
      /mois prochain/,
      /revenez vers/,
    ])
  )
    return {
      category: "callback",
      label: "À rappeler",
      confidence: 84,
      needsReview: true,
      taskType: "call",
      taskTitle: "Programmer le rappel demandé",
      nextAction: "Rappeler à la date convenue",
      dueInDays: 2,
      priority: 85,
    };

  if (
    has(text, [
      /rendez[- ]?vous/,
      /disponib/,
      /interess/,
      /pouvons[- ]?nous (echanger|nous rencontrer)/,
      /appelez[- ]?moi/,
      /pourquoi pas/,
    ])
  )
    return {
      category: "interested",
      label: "Intéressé / rendez-vous",
      confidence: 91,
      needsReview: true,
      taskType: "appointment",
      taskTitle: "Appeler pour convenir d’un rendez-vous",
      nextAction: "Appeler pour convenir d’un rendez-vous",
      dueInDays: 0,
      priority: 95,
    };

  if (
    has(text, [
      /envoy(ez|er).*(information|documentation|presentation|tarif)/,
      /plus d.information/,
      /documentation/,
      /plaquette/,
    ])
  )
    return {
      category: "information",
      label: "Demande d’informations",
      confidence: 89,
      needsReview: true,
      taskType: "email_review",
      taskTitle: "Préparer les informations demandées",
      nextAction: "Valider et envoyer une réponse personnalisée",
      dueInDays: 0,
      priority: 88,
    };

  if (
    has(text, [
      /deja (un|une) (prestataire|partenaire)/,
      /assurance/,
      /trop cher/,
      /tarif/,
      /contrat en cours/,
      /gere en interne/,
    ])
  )
    return {
      category: "objection",
      label: "Objection commerciale",
      confidence: 83,
      needsReview: true,
      taskType: "objection",
      taskTitle: "Traiter l’objection et décider de la suite",
      nextAction: "Analyser l’objection avant de répondre",
      dueInDays: 0,
      priority: 82,
    };

  if (
    has(text, [
      /pas interess/,
      /aucun besoin/,
      /ne donne(ra|rons) pas suite/,
      /non merci/,
      /refus/,
    ])
  )
    return {
      category: "not_interested",
      label: "Pas intéressé",
      confidence: 90,
      needsReview: true,
      taskType: "review",
      taskTitle: "Valider le refus et son motif",
      nextAction: "Valider le classement sans suite",
      dueInDays: 0,
      priority: 70,
    };

  return {
    category: "ambiguous",
    label: "Réponse à qualifier",
    confidence: 35,
    needsReview: true,
    taskType: "review",
    taskTitle: "Lire et qualifier la réponse",
    nextAction: "Examiner la réponse reçue",
    dueInDays: 0,
    priority: 75,
  };
}

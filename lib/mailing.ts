export const MAIL_FROM = {
  name: "Samir - Rapid Pare-Brise Marseille",
  email: "sasvinv13004@outlook.fr",
} as const;

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        c
      ] || c,
  );
}

export function renderTemplate(
  source: string,
  data: { company: string; contact?: string; sector?: string },
) {
  const values: Record<string, string> = {
    entreprise: data.company,
    contact: data.contact?.trim() || "Madame, Monsieur",
    secteur: data.sector?.trim() || "votre activité",
  };
  return source.replace(
    /{{\s*(entreprise|contact|secteur)\s*}}/gi,
    (_match, key) => values[String(key).toLowerCase()] || "",
  );
}

export function signatureHtml() {
  return `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:Arial,sans-serif;color:#111827"><strong>${escapeHtml(MAIL_FROM.name)}</strong><br><a href="mailto:${MAIL_FROM.email}" style="color:#dc2626;text-decoration:none">${MAIL_FROM.email}</a><br><img src="{{logo_url}}" width="160" alt="Rapid Pare-Brise" style="display:block;margin-top:14px;width:160px;height:auto"></div>`;
}

export function signatureText() {
  return `\n\n${MAIL_FROM.name}\n${MAIL_FROM.email}`;
}

export function microsoftConfigured() {
  return Boolean(
    process.env.MS_CLIENT_ID &&
      process.env.MS_CLIENT_SECRET &&
      process.env.MS_REFRESH_TOKEN &&
      process.env.CRM_PUBLIC_URL,
  );
}

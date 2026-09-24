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
  const baseUrl = String(process.env.CRM_PUBLIC_URL || "").replace(/\/$/, ""),
    logo = baseUrl
      ? `<img src="${escapeHtml(baseUrl)}/rapid-logo.png" width="160" alt="Rapid Pare-Brise" style="display:block;margin-top:14px;width:160px;height:auto">`
      : "";
  return `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:Arial,sans-serif;color:#111827"><strong>${escapeHtml(MAIL_FROM.name)}</strong><br><a href="mailto:${MAIL_FROM.email}" style="color:#dc2626;text-decoration:none">${MAIL_FROM.email}</a>${logo}<p style="margin:14px 0 0;color:#6b7280;font-size:11px">Vous ne souhaitez plus recevoir nos messages ? Répondez simplement « Stop » à cet e-mail.</p></div>`;
}

export function signatureText() {
  return `\n\n${MAIL_FROM.name}\n${MAIL_FROM.email}\n\nVous ne souhaitez plus recevoir nos messages ? Répondez simplement « Stop » à cet e-mail.`;
}

export function marketingFrameHtml(content: string) {
  return `<div style="max-width:620px;margin:0 auto;font-family:Arial,sans-serif;color:#111827;line-height:1.55"><div style="height:7px;background:#e5252a;border-radius:10px 10px 0 0"></div><div style="padding:20px 22px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px"><p style="margin:0 0 14px;color:#e5252a;font-size:11px;font-weight:700;letter-spacing:1.2px">RAPID PARE-BRISE · MARSEILLE</p>${content}<p style="margin:20px 0 0"><a href="mailto:${MAIL_FROM.email}?subject=Rendez-vous%20Rapid%20Pare-Brise" style="display:inline-block;padding:11px 16px;background:#e5252a;color:#ffffff;text-decoration:none;border-radius:7px;font-weight:700;font-size:13px">Convenons d’un rendez-vous</a></p></div></div>`;
}

export function microsoftConfigured() {
  return Boolean(
    process.env.MS_CLIENT_ID &&
      process.env.MS_CLIENT_SECRET &&
      process.env.MS_REFRESH_TOKEN &&
      process.env.CRM_PUBLIC_URL,
  );
}

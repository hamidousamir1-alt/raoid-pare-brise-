import { microsoftConfigured } from "./mailing";
let cached: { token: string; expiresAt: number } | null = null;
async function accessToken() {
  if (!microsoftConfigured()) throw new Error("microsoft_not_configured");
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const tenant = process.env.MS_TENANT_ID || "consumers",
    body = new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      refresh_token: process.env.MS_REFRESH_TOKEN!,
      grant_type: "refresh_token",
      scope: "offline_access Mail.Read Mail.Send",
    });
  const r = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    },
  );
  if (!r.ok) throw new Error(`microsoft_token_${r.status}`);
  const data = await r.json();
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 300) * 1000,
  };
  return cached.token;
}
export async function sendMicrosoftMail(message: {
  to: string;
  subject: string;
  html: string;
}) {
  const token = await accessToken(),
    r = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: message.subject,
          body: { contentType: "HTML", content: message.html },
          toRecipients: [{ emailAddress: { address: message.to } }],
        },
        saveToSentItems: true,
      }),
      cache: "no-store",
    });
  if (!r.ok) throw new Error(`microsoft_send_${r.status}`);
}
export async function recentInbox() {
  const token = await accessToken(),
    since = new Date(Date.now() - 72 * 3600_000).toISOString(),
    url = new URL(
      "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages",
    );
  url.searchParams.set("$select", "id,from,receivedDateTime,subject");
  url.searchParams.set("$filter", `receivedDateTime ge ${since}`);
  url.searchParams.set("$orderby", "receivedDateTime desc");
  url.searchParams.set("$top", "100");
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`microsoft_inbox_${r.status}`);
  return (await r.json()).value as Array<{
    id: string;
    from?: { emailAddress?: { address?: string } };
    receivedDateTime: string;
    subject: string;
  }>;
}

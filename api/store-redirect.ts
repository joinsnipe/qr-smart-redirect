export const config = { runtime: "edge" };

// Anonimiza IP preservando utilidad aproximada
function anonymizeIp(ip: string | null): string {
  if (!ip) return "";
  const first = ip.split(",")[0].trim(); // x-forwarded-for puede traer varias
  if (first.includes(":")) {
    // IPv6 → recorta a /64
    const parts = first.split(":");
    return parts.slice(0, 4).join(":") + "::/64";
  } else {
    // IPv4 → 1.2.3.4 → 1.2.3.0/24
    const a = first.split(".");
    if (a.length === 4) return `${a[0]}.${a[1]}.${a[2]}.0/24`;
    return first;
  }
}

export default async function handler(req: Request) {
  const ua = req.headers.get("user-agent") || "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  const country = req.headers.get("x-vercel-ip-country") || "Unknown";
  const city    = req.headers.get("x-vercel-ip-city") || ""; // no siempre disponible
  const ipRaw   = req.headers.get("x-forwarded-for");
  const ipAnon  = anonymizeIp(ipRaw);

  const url = new URL(req.url);
  const campaign = url.searchParams.get("c") || "default";

  const iosUrl = "https://apps.apple.com/es/app/snipe/id6743317310";
  const androidUrl = "https://play.google.com/store/apps/details?id=com.joinsnipe.mobile.snipe&hl=es";
  const fallbackUrl = "https://joinsnipe.com";

  const os = isIOS ? "ios" : isAndroid ? "android" : "other";
  const redirectUrl = isIOS ? iosUrl : isAndroid ? androidUrl : fallbackUrl;

  // --- LOG MÍNIMO a Notion (await para asegurar escritura) ---
  try {
    const notionToken = process.env.NOTION_TOKEN!;
    const notionDbId  = process.env.NOTION_DB_ID!;
    const pageBody = {
      parent: { database_id: notionDbId },
      properties: {
        "Name":       { title: [{ text: { content: `Scan - ${new Date().toISOString()}` } }] },
        "Timestamp":  { date: { start: new Date().toISOString() } },
        "OS":         { select: { name: os } },
        "Country":    { rich_text: [{ text: { content: country } }] },
        "City":       { rich_text: [{ text: { content: city } }] },
        "IP (anon)":  { rich_text: [{ text: { content: ipAnon } }] },
        "Campaign":   { rich_text: [{ text: { content: campaign } }] }
      }
    };

    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${notionToken}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(pageBody)
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("Notion error:", res.status, txt);
    }
  } catch (e) {
    console.error("Notion fetch failed:", e);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectUrl,
      "Cache-Control": "private, max-age=300", // 5 min por dispositivo
      "Vary": "User-Agent"
    }
  });
}

export const config = { runtime: "edge" };

// Util: anonimizar IP (IPv4/IPv6)
function anonymizeIp(ip: string | null): string {
  if (!ip) return "";
  const first = ip.split(",")[0].trim(); // x-forwarded-for puede tener varias
  if (first.includes(":")) {
    // IPv6 -> recorta a /64
    const parts = first.split(":");
    return parts.slice(0, 4).join(":") + "::/64";
  } else {
    // IPv4 -> 1.2.3.4 => 1.2.3.0/24
    const a = first.split(".");
    if (a.length === 4) return `${a[0]}.${a[1]}.${a[2]}.0/24`;
    return first;
  }
}

function parseBrowser(ua: string) {
  ua = ua.toLowerCase();
  if (ua.includes("edg/")) return "edge";
  if (ua.includes("chrome/") && !ua.includes("chromium")) return "chrome";
  if (ua.includes("safari") && !ua.includes("chrome")) return "safari";
  if (ua.includes("firefox/")) return "firefox";
  return "other";
}

function parseDevice(ua: string) {
  const l = ua.toLowerCase();
  if (l.includes("iphone")) return "iPhone";
  if (l.includes("ipad")) return "iPad";
  if (l.includes("pixel")) return "Pixel";
  if (l.includes("xiaomi") || l.includes("miui")) return "Xiaomi";
  if (l.includes("samsung")) return "Samsung";
  if (l.includes("huawei")) return "Huawei";
  if (l.includes("android")) return "Android";
  if (l.includes("macintosh")) return "Mac";
  if (l.includes("windows")) return "Windows";
  return "other";
}

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const ua = req.headers.get("user-agent") || "";
  const ref = req.headers.get("referer") || "";
  const ip = req.headers.get("x-forwarded-for");
  const ipAnon = anonymizeIp(ip);

  // Geo vía headers de Vercel Edge
  const country  = req.headers.get("x-vercel-ip-country") || "";
  const region   = req.headers.get("x-vercel-ip-country-region") || "";
  const city     = req.headers.get("x-vercel-ip-city") || "";
  const timezone = req.headers.get("x-vercel-ip-timezone") || "";

  // Tracking params
  const campaign = url.searchParams.get("c") || "default";
  const qrId     = url.searchParams.get("q") || ""; // tu identificador propio de QR (si lo usas)
  const epoch    = Date.now();

  // SO y destino
  const isAndroid = /android/i.test(ua);
  const isIOS     = /iphone|ipad|ipod/i.test(ua);
  const os        = isIOS ? "ios" : isAndroid ? "android" : "other";

  const IOS_URL     = "https://apps.apple.com/es/app/snipe/id6743317310";
  const ANDROID_URL = "https://play.google.com/store/apps/details?id=com.joinsnipe.mobile.snipe&hl=es";
  const FALLBACK_URL= "https://joinsnipe.com";

  const target = isIOS ? IOS_URL : isAndroid ? ANDROID_URL : FALLBACK_URL;
  const store  = isIOS ? "appstore" : isAndroid ? "playstore" : "fallback";

  // Browser & Device
  const browser = parseBrowser(ua);
  const device  = parseDevice(ua);

  // ------- Log a Notion (no bloquea la UX si falla) -------
  try {
    const notionToken = process.env.NOTION_TOKEN!;
    const notionDb    = process.env.NOTION_DB_ID!;
    const headers = {
      "Authorization": `Bearer ${notionToken}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    };
    const pageBody = {
      parent: { database_id: notionDb },
      properties: {
        "Name":        { title: [{ text: { content: `Scan #${epoch}` } }] },
        "Timestamp":   { date: { start: new Date(epoch).toISOString() } },
        "Created":     { created_time: {} }, // Notion lo rellena solo
        "Epoch":       { number: epoch },
        "OS":          { select: { name: os } },
        "Store":       { select: { name: store } },
        "Country":     { rich_text: [{ text: { content: country } }] },
        "Region":      { rich_text: [{ text: { content: region } }] },
        "City":        { rich_text: [{ text: { content: city } }] },
        "Timezone":    { rich_text: [{ text: { content: timezone } }] },
        "IP (anon)":   { rich_text: [{ text: { content: ipAnon } }] },
        "Campaign":    { rich_text: [{ text: { content: campaign } }] },
        "QR ID":       { rich_text: [{ text: { content: qrId } }] },
        "User Agent":  { rich_text: [{ text: { content: ua.slice(0, 1800) } }] },
        "Browser":     { rich_text: [{ text: { content: browser } }] },
        "Device":      { rich_text: [{ text: { content: device } }] },
        "Referrer":    { url: ref || null },
        "Request URL": { url: req.url },
      },
    };
    // No esperamos a que termine: fire-and-forget
    // (Edge Runtime también soporta ctx.waitUntil en Next, aquí basta con no bloquear)
    fetch("https://api.notion.com/v1/pages", { method: "POST", headers, body: JSON.stringify(pageBody) })
      .catch(() => {});
  } catch (_) {
    // ignoramos logging errors para no afectar al usuario
  }

  // ------- Redirección -------
  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Cache-Control": "private, max-age=300",
      "Vary": "User-Agent"
    }
  });
}

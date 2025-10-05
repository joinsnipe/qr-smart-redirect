export const config = { runtime: "edge" };

// IP anonimizada (IPv4 -> /24, IPv6 -> /64)
function anonymizeIp(ip: string | null): string {
  if (!ip) return "";
  const first = ip.split(",")[0].trim();
  if (first.includes(":")) {
    const parts = first.split(":");
    return parts.slice(0, 4).join(":") + "::/64";
  } else {
    const a = first.split(".");
    if (a.length === 4) return `${a[0]}.${a[1]}.${a[2]}.0/24`;
    return first;
  }
}

function pickOS(ua: string) {
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "other";
}
function pickBrowser(ua: string) {
  const l = ua.toLowerCase();
  if (l.includes("edg/")) return "edge";
  if (l.includes("chrome/") && !l.includes("chromium")) return "chrome";
  if (l.includes("safari") && !l.includes("chrome")) return "safari";
  if (l.includes("firefox/")) return "firefox";
  return "other";
}
function pickDevice(ua: string) {
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
  const now = Date.now();
  const url = new URL(req.url);
  const ua  = req.headers.get("user-agent") || "";
  const ref = req.headers.get("referer") || "";

  // Geo desde headers de Vercel (country casi siempre; city/region depende del POP)
  const country  = req.headers.get("x-vercel-ip-country") || "";
  const region   = req.headers.get("x-vercel-ip-country-region") || "";
  const city     = req.headers.get("x-vercel-ip-city") || "";
  const timezone = req.headers.get("x-vercel-ip-timezone") || "";

  const ipRaw  = req.headers.get("x-forwarded-for");
  const ipAnon = anonymizeIp(ipRaw);

  // Tracking params
  const campaign = url.searchParams.get("c") || "default";
  const qrId     = url.searchParams.get("q") || "";

  // SO y destino
  const os = pickOS(ua);
  const iosUrl     = "https://apps.apple.com/es/app/snipe/id6743317310";
  const androidUrl = "https://play.google.com/store/apps/details?id=com.joinsnipe.mobile.snipe&hl=es";
  const fallbackUrl= "https://joinsnipe.com";
  const redirectUrl = os === "ios" ? iosUrl : os === "android" ? androidUrl : fallbackUrl;
  const store       = os === "ios" ? "appstore" : os === "android" ? "playstore" : "fallback";

  const browser = pickBrowser(ua);
  const device  = pickDevice(ua);

  // ---- Log a Notion (await para asegurar escritura) ----
  try {
    const notionToken = process.env.NOTION_TOKEN!;
    const notionDbId  = process.env.NOTION_DB_ID!;

    const pageBody = {
      parent: { database_id: notionDbId },
      properties: {
        "Name":        { title: [{ text: { content: `Scan #${now}` } }] },
        "Timestamp":   { date: { start: new Date(now).toISOString() } },
        "Epoch":       { number: now },
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
        "Request URL": { url: req.url }
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

  // Sin caché para contar cada escaneo
  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectUrl,
      "Cache-Control": "no-store",
      "Vary": "User-Agent"
    }
  });
}


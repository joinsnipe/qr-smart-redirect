export const config = { runtime: "edge" };

// --- Utilidades ---
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
function isPrivateIPv4(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4) return false;
  const [a,b] = p;
  return a===10 || (a===172 && b>=16 && b<=31) || (a===192 && b===168) || a===127;
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

// Fallback por IP (rápido y con timeout)
async function geolocateByIp(ip: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 800);
  try {
    const r = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const j = await r.json();
      return {
        city: j.city || "",
        region: j.region || "",                // preferimos nombre completo
        country: j.country || j.country_code || "",
        timezone: j.timezone || ""
      };
    }
  } catch { /* ignore */ }
  // Segundo fallback
  try {
    const r2 = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`);
    if (r2.ok) {
      const j2 = await r2.json();
      if (j2 && j2.success !== false) {
        return {
          city: j2.city || "",
          region: j2.region || "",
          country: j2.country_code || j2.country || "",
          timezone: j2.timezone?.id || ""
        };
      }
    }
  } catch { /* ignore */ }
  return null;
}

export default async function handler(req: Request) {
  const now = Date.now();
  const url = new URL(req.url);
  const ua  = req.headers.get("user-agent") || "";
  const ref = req.headers.get("referer") || "";

  // Headers de Vercel
  let country  = req.headers.get("x-vercel-ip-country") || "";
  let region   = req.headers.get("x-vercel-ip-country-region") || "";
  let city     = req.headers.get("x-vercel-ip-city") || "";
  let timezone = req.headers.get("x-vercel-ip-timezone") || "";

  const ipRaw   = req.headers.get("x-forwarded-for") || "";
  const ipFirst = ipRaw.split(",")[0].trim();
  const ipAnon  = anonymizeIp(ipFirst || null);

  // Si falta ciudad o región, probamos por IP (solo si no es privada)
  if ((!city || !region) && ipFirst && !(/[:]/.test(ipFirst) /*ipv6 local?*/ || isPrivateIPv4(ipFirst))) {
    const g = await geolocateByIp(ipFirst);
    if (g) {
      city     = city || g.city;
      region   = region || g.region;
      country  = country || g.country;
      timezone = timezone || g.timezone;
    }
  }

  // Parámetros de tracking
  const campaign = url.searchParams.get("c") || "default";
  const qrId     = url.searchParams.get("q") || "";

  // SO y redirección
  const os = pickOS(ua);
  const iosUrl     = "https://apps.apple.com/es/app/snipe/id6743317310";
  const androidUrl = "https://play.google.com/store/apps/details?id=com.joinsnipe.mobile.snipe&hl=es";
  const fallbackUrl= "https://joinsnipe.com";
  const redirectUrl = os === "ios" ? iosUrl : os === "android" ? androidUrl : fallbackUrl;
  const store       = os === "ios" ? "appstore" : os === "android" ? "playstore" : "fallback";

  const browser = pickBrowser(ua);
  const device  = pickDevice(ua);

  // ----- Log a Notion (ID numérico primero) -----
  try {
    const notionToken = process.env.NOTION_TOKEN!;
    const notionDbId  = process.env.NOTION_DB_ID!;

    const pageBody = {
      parent: { database_id: notionDbId },
      properties: {
        "ID":          { number: now },                            // orden numérico
        "Name":        { title: [{ text: { content: `#${now} ${campaign} ${os}` } }] },
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
        // Si no quieres ver estas dos en la vista, simplemente ocúltalas:
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

  // sin caché para contar todos los escaneos
  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectUrl,
      "Cache-Control": "no-store",
      "Vary": "User-Agent"
    }
  });
}


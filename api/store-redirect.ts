export const config = { runtime: "edge" };

// --- Utiles ligeros ---
function anonymizeIp(ip: string | null): string {
  if (!ip) return "";
  const first = ip.split(",")[0].trim();
  if (first.includes(":")) {
    const parts = first.split(":");
    return parts.slice(0, 4).join(":") + "::/64";   // IPv6 ~/64
  } else {
    const a = first.split(".");
    return a.length === 4 ? `${a[0]}.${a[1]}.${a[2]}.0/24` : first; // IPv4 ~/24
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

// Comunidades autónomas (nombre completo)
const ES_REGION_MAP: Record<string, string> = {
  AN: "Andalucía",
  AR: "Aragón",
  AS: "Principado de Asturias",
  CN: "Canarias",
  CB: "Cantabria",
  CL: "Castilla y León",
  CM: "Castilla-La Mancha",
  CT: "Cataluña",
  EX: "Extremadura",
  GA: "Galicia",
  IB: "Islas Baleares",
  RI: "La Rioja",
  MD: "Comunidad de Madrid",
  MC: "Región de Murcia",
  NC: "Navarra",
  PV: "País Vasco",
  VC: "Comunidad Valenciana",
  CE: "Ceuta",
  ML: "Melilla"
};

export default async function handler(req: Request) {
  const now = Date.now();
  const url = new URL(req.url);
  const ua  = req.headers.get("user-agent") || "";

  // Headers de Vercel (nada externo para máxima velocidad)
  const country  = req.headers.get("x-vercel-ip-country") || "";
  const regionCd = req.headers.get("x-vercel-ip-country-region") || "";
  const city     = req.headers.get("x-vercel-ip-city") || "";
  const timezone = req.headers.get("x-vercel-ip-timezone") || "";
  const ipFirst  = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const ipAnon   = anonymizeIp(ipFirst || null);

  // Comunidad autonómica “bonita” en España
  const regionNice =
    country === "ES" && ES_REGION_MAP[regionCd as keyof typeof ES_REGION_MAP]
      ? ES_REGION_MAP[regionCd as keyof typeof ES_REGION_MAP]
      : regionCd || "Desconocida";

  // Tracking
  const campaign = (url.searchParams.get("c") || "default").toLowerCase();
  const qrId     = (url.searchParams.get("q") || "").toLowerCase();

  // Redirección por dispositivo
  const os = pickOS(ua);
  const iosUrl     = "https://apps.apple.com/es/app/snipe/id6743317310";
  const androidUrl = "https://play.google.com/store/apps/details?id=com.joinsnipe.mobile.snipe&hl=es";
  const fallbackUrl= "https://joinsnipe.com";
  const target = os === "ios" ? iosUrl : os === "android" ? androidUrl : fallbackUrl;
  const store  = os === "ios" ? "appstore" : os === "android" ? "playstore" : "fallback";

  // Extra (barato)
  const browser = pickBrowser(ua);
  const device  = pickDevice(ua);

  // --- Registro en Notion: usamos Unique ID "Seq" para numeración 1,2,3... ---
  try {
    const notionToken = process.env.NOTION_TOKEN!;
    const notionDbId  = process.env.NOTION_DB_ID!;

    // Name más legible; la serie real viene de "Seq" (Unique ID)
    const niceName = `${campaign} / ${qrId || "qr"} / ${os}`;

    const properties: any = {
      "Name":        { title: [{ text: { content: niceName } }] },
      "Timestamp":   { date: { start: new Date(now).toISOString() } },
      "Epoch":       { number: now },                 // por si quieres orden secundario
      "OS":          { select: { name: os } },
      "Store":       { select: { name: store } },
      "Country":     { rich_text: [{ text: { content: country } }] },
      "Region":      { rich_text: [{ text: { content: regionNice } }] },
      "City":        { rich_text: [{ text: { content: city } }] },
      "Timezone":    { rich_text: [{ text: { content: timezone } }] },
      "IP (anon)":   { rich_text: [{ text: { content: ipAnon } }] },
      "Campaign":    { rich_text: [{ text: { content: campaign } }] },
      "QR ID":       { rich_text: [{ text: { content: qrId } }] },
      "Browser":     { rich_text: [{ text: { content: browser } }] },
      "Device":      { rich_text: [{ text: { content: device } }] }
      // "Seq" NO se envía: Notion lo autogenera al crear la página
    };

    await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${notionToken}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ parent: { database_id: notionDbId }, properties })
    });
  } catch {
    // no rompemos la UX si falla el log
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Cache-Control": "no-store",
      "Vary": "User-Agent"
    }
  });
}



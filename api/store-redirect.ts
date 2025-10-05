export const config = { runtime: "edge" };

// --- Firma de build ---
const HANDLER_SIGNATURE = "store-redirect.ts@2025-10-05T17:41Z";

/* ---------------- Utilidades ligeras ---------------- */
function anonymizeIp(ip: string | null): string {
  if (!ip) return "";
  const first = ip.split(",")[0].trim();
  if (first.includes(":")) {
    const parts = first.split(":");
    return parts.slice(0, 4).join(":") + "::/64";
  } else {
    const a = first.split(".");
    return a.length === 4 ? `${a[0]}.${a[1]}.${a[2]}.0/24` : first;
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
  if (l.includes("opr/") || l.includes("opera")) return "opera";
  if (l.includes("firefox/")) return "firefox";
  if (l.includes("samsungbrowser")) return "samsung";
  if (l.includes("crios/") || l.includes("chrome/")) return "chrome";
  if (l.includes("safari/")) return "safari";
  return "other";
}
function pickDevice(ua: string) {
  const iua = ua.toLowerCase();
  const isiPad = /ipad/.test(iua);
  const isiPhone = /iphone/.test(iua);
  const isAndroid = /android/.test(iua);
  const isTablet = isiPad || (isAndroid && /tablet/.test(iua));
  if (isiPad) return "iPad";
  if (isiPhone) return "iPhone";
  if (isAndroid && isTablet) return "Android Tablet";
  if (isAndroid) return "Android Phone";
  if (/macintosh|windows nt|linux x86_64/i.test(ua)) return "Desktop";
  return "Other";
}
const ES_REGION_MAP: Record<string, string> = {
  AN:"Andalucía", AR:"Aragón", AS:"Principado de Asturias", CN:"Canarias", CB:"Cantabria",
  CL:"Castilla y León", CM:"Castilla-La Mancha", CT:"Cataluña", EX:"Extremadura", GA:"Galicia",
  IB:"Islas Baleares", RI:"La Rioja", MD:"Comunidad de Madrid", MC:"Región de Murcia",
  NC:"Navarra", PV:"País Vasco", VC:"Comunidad Valenciana", CE:"Ceuta", ML:"Melilla"
};
function toTitleCampaign(raw: string) {
  const pretty = raw.replace(/[_-]+/g, " ").trim();
  return pretty.replace(/\S+/g, (w) => w[0]?.toUpperCase() + w.slice(1));
}
function pad3(n: number) {
  const s = String(n);
  return s.length >= 3 ? s : "0".repeat(3 - s.length) + s;
}
function rt(content: string) {
  const safe = content && content.trim() ? content : "Desconocido";
  return { rich_text: [{ text: { content: safe } }] };
}

/* ---------------- Handler principal ---------------- */
export default async function handler(req: Request) {
  const now = Date.now();
  const url = new URL(req.url);
  const ua  = req.headers.get("user-agent") || "";

  // Geo headers
  const country  = req.headers.get("x-vercel-ip-country") || "";
  const regionCd = req.headers.get("x-vercel-ip-country-region") || "";
  const city     = req.headers.get("x-vercel-ip-city") || "";
  const timezone = req.headers.get("x-vercel-ip-timezone") || "";

  // IP
  const ipFirst =
    (req.headers.get("x-forwarded-for") ||
     req.headers.get("x-real-ip") ||
     req.headers.get("cf-connecting-ip") ||
     "").split(",")[0].trim();
  const ipAnon = anonymizeIp(ipFirst || null);

  // Región bonita
  const regionNice =
    country === "ES" && ES_REGION_MAP[regionCd as keyof typeof ES_REGION_MAP]
      ? ES_REGION_MAP[regionCd as keyof typeof ES_REGION_MAP]
      : (regionCd || "Desconocida");

  // Tracking params
  const campaignRaw = (url.searchParams.get("c") || "default").toLowerCase();
  const campaignPretty = toTitleCampaign(campaignRaw);
  const qrId = (url.searchParams.get("q") || "").toLowerCase();

  // UA
  const os = pickOS(ua);
  const browser = pickBrowser(ua);
  const device = pickDevice(ua);

  // Redirecciones
  const iosUrl = "https://apps.apple.com/es/app/snipe/id6743317310";
  const androidUrl = "https://play.google.com/store/apps/details?id=com.joinsnipe.mobile.snipe&hl=es";
  const fallbackUrl = "https://joinsnipe.com";
  const target = os === "ios" ? iosUrl : os === "android" ? androidUrl : fallbackUrl;
  const store = os === "ios" ? "appstore" : os === "android" ? "playstore" : "fallback";

  // --- Modo DEBUG ---
  if (url.searchParams.get("debug") === "1") {
    return new Response(
      JSON.stringify({
        signature: HANDLER_SIGNATURE,
        ua, os, browser, device,
        headers: {
          country, regionCd, regionNice, city, timezone,
          "x-forwarded-for": req.headers.get("x-forwarded-for"),
          "x-real-ip": req.headers.get("x-real-ip"),
          "cf-connecting-ip": req.headers.get("cf-connecting-ip")
        },
        ipAnon, campaignRaw, campaignPretty, qrId, target, store
      }, null, 2),
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  }

  // --- Registro en Notion ---
  try {
    const notionToken = process.env.NOTION_TOKEN!;
    const notionDbId  = process.env.NOTION_DB_ID!;
    const headers = {
      "Authorization": `Bearer ${notionToken}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json"
    };

    const provisionalName = `${campaignPretty} / —${qrId ? ` / ${qrId}` : ""}`;
    const properties: any = {
      "Name":        { title: [{ text: { content: provisionalName } }] },
      "Timestamp":   { date: { start: new Date(now).toISOString() } },
      "Epoch":       { number: now },
      "OS":          { select: { name: os } },
      "Store":       { select: { name: store } },
      "Country":     rt(country),
      "Region":      rt(regionNice),
      "City":        rt(city),
      "Timezone":    rt(timezone),
      "IP (anon)":   rt(ipAnon),
      "Campaign":    rt(campaignRaw),
      "QR ID":       rt(qrId || "—"),
      "Browser":     rt(browser),
      "Device":      rt(device)
    };

    await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        parent: { type: "database_id", database_id: notionDbId },
        properties
      })
    });
  } catch (err) {
    console.error("Edge Notion exception:", err);
  }

  // --- Redirección final ---
  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Cache-Control": "no-store",
      "Vary": "User-Agent",
      "X-QR-Handler": HANDLER_SIGNATURE
    }
  });
}




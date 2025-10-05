export const config = { runtime: "edge" };

/** ---------- utils ---------- */
function anonymizeIp(ip: string | null): string {
  if (!ip) return "";
  const first = ip.split(",")[0].trim();
  if (first.includes(":")) { const parts = first.split(":"); return parts.slice(0,4).join(":")+"::/64"; }
  const a = first.split("."); return a.length===4 ? `${a[0]}.${a[1]}.${a[2]}.0/24` : first;
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
const ES_REGION_MAP: Record<string, string> = {
  AN:"Andalucía", AR:"Aragón", AS:"Principado de Asturias", CN:"Canarias", CB:"Cantabria",
  CL:"Castilla y León", CM:"Castilla-La Mancha", CT:"Cataluña", EX:"Extremadura",
  GA:"Galicia", IB:"Islas Baleares", RI:"La Rioja", MD:"Comunidad de Madrid",
  MC:"Región de Murcia", NC:"Navarra", PV:"País Vasco", VC:"Comunidad Valenciana",
  CE:"Ceuta", ML:"Melilla"
};
function toTitleCampaign(raw: string) {
  const pretty = raw.replace(/[_-]+/g, " ").trim();
  return pretty.replace(/\S+/g, w => w[0]?.toUpperCase() + w.slice(1));
}
function pad3(n: number) { const s = String(n); return s.length>=3 ? s : "0".repeat(3-s.length)+s; }

async function countPagesForCampaign(notionToken: string, dbId: string, campaignRaw: string): Promise<number> {
  let total = 0, cursor: string | null = null;
  const headers = {
    "Authorization": `Bearer ${notionToken}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
  };
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST", headers,
      body: JSON.stringify({
        page_size: 100,
        start_cursor: cursor || undefined,
        filter: { property: "Campaign", rich_text: { equals: campaignRaw } }
      })
    });
    if (!res.ok) break;
    const data = await res.json();
    total += data.results?.length || 0;
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return total;
}

/** ---------- handler ---------- */
export default async function handler(req: Request) {
  const now = Date.now();
  const url = new URL(req.url);
  const ua  = req.headers.get("user-agent") || "";

  // Headers Vercel
  const country  = req.headers.get("x-vercel-ip-country") || "";
  const regionCd = req.headers.get("x-vercel-ip-country-region") || "";
  const city     = req.headers.get("x-vercel-ip-city") || "";
  const timezone = req.headers.get("x-vercel-ip-timezone") || "";
  const ipFirst  = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const ipAnon   = anonymizeIp(ipFirst || null);
  const regionNice =
    country === "ES" && ES_REGION_MAP[regionCd as keyof typeof ES_REGION_MAP]
      ? ES_REGION_MAP[regionCd as keyof typeof ES_REGION_MAP]
      : regionCd || "Desconocida";

  // Tracking
  const campaignRaw = (url.searchParams.get("c") || "default").toLowerCase();
  const campaignPretty = toTitleCampaign(campaignRaw);
  const qrId = (url.searchParams.get("q") || "").toLowerCase();

  // Redirección instantánea
  const os = pickOS(ua);
  const iosUrl     = "https://apps.apple.com/es/app/snipe/id6743317310";
  const androidUrl = "https://play.google.com/store/apps/details?id=com.joinsnipe.mobile.snipe&hl=es";
  const fallbackUrl= "https://joinsnipe.com";
  const target = os === "ios" ? iosUrl : os === "android" ? androidUrl : fallbackUrl;

  // Info rápida de agente
  const browser = pickBrowser(ua);
  const device  = pickDevice(ua);

  // --- secuencia por campaña ---
  try {
    const notionToken = process.env.NOTION_TOKEN!;
    const notionDbId  = process.env.NOTION_DB_ID!;
    const seq = (await countPagesForCampaign(notionToken, notionDbId, campaignRaw)) + 1;

    const headers = {
      "Authorization": `Bearer ${notionToken}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json"
    };
    const properties: any = {
      "Name":        { title: [{ text: { content: `${campaignPretty} / ${pad3(seq)}${qrId ? ` / ${qrId}` : ""}` } }] },
      "SeqC":        { number: seq },
      "Timestamp":   { date: { start: new Date(now).toISOString() } },
      "Epoch":       { number: now },
      "OS":          { select: { name: os } },
      "Store":       { select: { name: os === "ios" ? "appstore" : os === "android" ? "playstore" : "fallback" } },
      "Country":     { rich_text: [{ text: { content: country } }] },
      "Region":      { rich_text: [{ text: { content: regionNice } }] },
      "City":        { rich_text: [{ text: { content: city } }] },
      "Timezone":    { rich_text: [{ text: { content: timezone } }] },
      "IP (anon)":   { rich_text: [{ text: { content: ipAnon } }] },
      "Campaign":    { rich_text: [{ text: { content: campaignRaw } }] },
      "QR ID":       { rich_text: [{ text: { content: qrId } }] },
      "Browser":     { rich_text: [{ text: { content: browser } }] },
      "Device":      { rich_text: [{ text: { content: device } }] }
    };

    await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers,
      body: JSON.stringify({ parent: { database_id: notionDbId }, properties })
    });
  } catch { /* no bloquear UX */ }

  return new Response(null, {
    status: 302,
    headers: { Location: target, "Cache-Control": "no-store", "Vary": "User-Agent" }
  });
}


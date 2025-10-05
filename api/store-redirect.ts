export const config = { runtime: "edge" };

/** -------- utilidades ligeras -------- */
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
function toTitleCampaign(raw: string) {
  // "lanzamiento_octubre-2025" -> "Lanzamiento Octubre 2025"
  const pretty = raw.replace(/[_-]+/g, " ").trim();
  return pretty.replace(/\S+/g, (w) => w[0]?.toUpperCase() + w.slice(1));
}
function pad3(n: number) {
  const s = String(n);
  return s.length >= 3 ? s : "0".repeat(3 - s.length) + s;
}

/** -------- handler -------- */
export default async function handler(req: Request) {
  const now = Date.now();
  const url = new URL(req.url);
  const ua  = req.headers.get("user-agent") || "";

  // Headers de Vercel (rápidos, sin llamadas externas)
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
  const campaignRaw = (url.searchParams.get("c") || "default").toLowerCase();
  const campaignPretty = toTitleCampaign(campaignRaw); // para mostrar en Name
  const qrId     = (url.searchParams.get("q") || "").toLowerCase();

  // Redirección por dispositivo (sin poner OS en el nombre)
  const os = pickOS(ua);
  const iosUrl     = "https://apps.apple.com/es/app/snipe/id6743317310";
  const androidUrl = "https://play.google.com/store/apps/details?id=com.joinsnipe.mobile.snipe&hl=es";
  const fallbackUrl= "https://joinsnipe.com";
  const target = os === "ios" ? iosUrl : os === "android" ? androidUrl : fallbackUrl;
  const store  = os === "ios" ? "appstore" : os === "android" ? "playstore" : "fallback";

  // --- 1) Crear la página en Notion (Name provisional con /—) ---
  let pageId: string | null = null;
  let seqNumber: number | null = null;
  try {
    const notionToken = process.env.NOTION_TOKEN!;
    const notionDbId  = process.env.NOTION_DB_ID!;
    const headers = {
      "Authorization": `Bearer ${notionToken}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json"
    };

    // Name provisional (hasta que tengamos "Seq")
    const provisionalName =
      `${campaignPretty} / —${qrId ? ` / ${qrId}` : ""}`;

    const properties: any = {
      "Name":        { title: [{ text: { content: provisionalName } }] },
      "Timestamp":   { date: { start: new Date(now).toISOString() } },
      "Epoch":       { number: now }, // útil para orden secundario
      "OS":          { select: { name: os } },       // lo seguimos registrando (no en Name)
      "Store":       { select: { name: store } },    // idem
      "Country":     { rich_text: [{ text: { content: country } }] },
      "Region":      { rich_text: [{ text: { content: regionNice } }] },
      "City":        { rich_text: [{ text: { content: city } }] },
      "Timezone":    { rich_text: [{ text: { content: timezone } }] },
      "IP (anon)":   { rich_text: [{ text: { content: ipAnon } }] },
      "Campaign":    { rich_text: [{ text: { content: campaignRaw } }] },
      "QR ID":       { rich_text: [{ text: { content: qrId } }] }
      // "Seq" es Unique ID y lo genera Notion automáticamente
    };

    const createRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers,
      body: JSON.stringify({ parent: { database_id: notionDbId }, properties })
    });

    if (createRes.ok) {
      const created = await createRes.json();
      pageId = created.id || null;

      // Notion suele devolver el valor de unique_id; si está, lo usamos ya
      const seqProp = created?.properties?.["Seq"]?.unique_id;
      if (seqProp?.number) {
        seqNumber = Number(seqProp.number);
      }
    } else {
      // si hay error de validación, lo dejamos en logs pero no rompemos la UX
      const txt = await createRes.text();
      console.error("Notion create error:", createRes.status, txt);
    }

    // --- 2) Si no vino Seq en la respuesta, intentamos leer la página una vez ---
    if (pageId && seqNumber == null) {
      const readRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers });
      if (readRes.ok) {
        const page = await readRes.json();
        const seqProp2 = page?.properties?.["Seq"]?.unique_id;
        if (seqProp2?.number) seqNumber = Number(seqProp2.number);
      }
    }

    // --- 3) Si ya tenemos Seq, actualizamos el Name a "Campaña / 001 [/ qrId]" ---
    if (pageId && seqNumber != null) {
      const finalName =
        `${campaignPretty} / ${pad3(seqNumber)}${qrId ? ` / ${qrId}` : ""}`;

      await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          properties: {
            "Name": { title: [{ text: { content: finalName } }] }
          }
        })
      });
    }
  } catch {
    // nunca bloqueamos la redirección
  }

  // Redirección inmediata, sin caché para contar cada escaneo
  return new Response(null, { status: 302, headers: {
    Location: target,
    "Cache-Control": "no-store",
    "Vary": "User-Agent"
  }});
}



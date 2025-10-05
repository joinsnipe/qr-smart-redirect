export const config = { runtime: "edge" };

function pickOS(ua: string) {
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "other";
}

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const ua  = req.headers.get("user-agent") || "";
  const os  = pickOS(ua);
  const country  = req.headers.get("x-vercel-ip-country") || "Unknown";
  const campaign = url.searchParams.get("c") || "default";

  const IOS_URL     = "https://apps.apple.com/es/app/snipe/id6743317310";
  const ANDROID_URL = "https://play.google.com/store/apps/details?id=com.joinsnipe.mobile.snipe&hl=es";
  const FALLBACK_URL= "https://joinsnipe.com";

  const target = os === "ios" ? IOS_URL : os === "android" ? ANDROID_URL : FALLBACK_URL;

  // ---- LOG A NOTION (con await) ----
  try {
    const notionToken = process.env.NOTION_TOKEN!;
    const notionDbId  = process.env.NOTION_DB_ID!;
    if (!notionToken || !notionDbId) throw new Error("NOTION env vars missing");

    const pageBody = {
      parent: { database_id: notionDbId },
      properties: {
        "Name":       { title: [{ text: { content: `Scan - ${new Date().toISOString()}` } }] },
        "Timestamp":  { date: { start: new Date().toISOString() } },
        "OS":         { select: { name: os } },
        "Country":    { rich_text: [{ text: { content: country } }] },
        "Campaign":   { rich_text: [{ text: { content: campaign } }] },
        "QR Version": { rich_text: [{ text: { content: "1" } }] }
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

    // Si falla, lo dejamos en logs de Vercel para diagnosticar
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
      Location: target,
      "Cache-Control": "private, max-age=300",
      "Vary": "User-Agent"
    }
  });
}

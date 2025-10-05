export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  const ua = req.headers.get("user-agent") || "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const country = req.headers.get("x-vercel-ip-country") || "Unknown";

  const url = new URL(req.url);
  const campaign = url.searchParams.get("c") || "default";

  const iosUrl = "https://apps.apple.com/es/app/snipe/id6743317310";
  const androidUrl = "https://play.google.com/store/apps/details?id=com.joinsnipe.mobile.snipe&hl=es";
  const fallbackUrl = "https://joinsnipe.com";

  const os = isIOS ? "ios" : isAndroid ? "android" : "other";
  const redirectUrl = isIOS ? iosUrl : isAndroid ? androidUrl : fallbackUrl;

  // --- LOG A NOTION ---
  try {
    const notionToken = process.env.NOTION_TOKEN!;
    const notionDbId = process.env.NOTION_DB_ID!;

    const pageBody = {
      parent: { database_id: notionDbId },
      properties: {
        "Name": { title: [{ text: { content: `Scan - ${new Date().toISOString()}` } }] },
        "Timestamp": { date: { start: new Date().toISOString() } },
        "OS": { select: { name: os } },
        "Country": { rich_text: [{ text: { content: country } }] },
        "Campaign": { rich_text: [{ text: { content: campaign } }] },
        "QR Version": { rich_text: [{ text: { content: "1" } }] }
      }
    };

    await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${notionToken}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(pageBody)
    });
  } catch (e) {
    console.error("Notion fetch failed:", e);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectUrl,
      "Cache-Control": "no-store",
      "Vary": "User-Agent"
    }
  });
}


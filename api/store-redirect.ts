export const config = {
  runtime: "edge",
};

export default async function handler(req: Request) {
  const userAgent = req.headers.get("user-agent") || "";
  const country = req.headers.get("x-vercel-ip-country") || "Unknown";
  const url = new URL(req.url);

  // Parámetros de tracking opcionales
  const campaign = url.searchParams.get("c") || "default";
  const qrVersion = url.searchParams.get("v") || "1";

  // Detección simple de SO
  let os = "other";
  if (/android/i.test(userAgent)) os = "android";
  else if (/iphone|ipad|ipod/i.test(userAgent)) os = "ios";

  // URLs oficiales de las stores
  const iosUrl = "https://apps.apple.com/es/app/snipe/id6743317310";
  const androidUrl = "https://play.google.com/store/apps/details?id=com.joinsnipe.mobile.snipe&hl=es";
  const fallbackUrl = "https://joinsnipe.com";

  const redirectUrl =
    os === "ios" ? iosUrl :
    os === "android" ? androidUrl :
    fallbackUrl;

  // Lógica de logging a Notion
  try {
    const notionToken = process.env.NOTION_TOKEN!;
    const notionDb = process.env.NOTION_DB_ID!;
    const headers = {
      "Authorization": `Bearer ${notionToken}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    };

    const pageBody = {
      parent: { database_id: notionDb },
      properties: {
        "Name": { title: [{ text: { content: `Scan - ${new Date().toISOString()}` } }] },
        "Timestamp": { date: { start: new Date().toISOString() } },
        "OS": { select: { name: os } },
        "Country": { rich_text: [{ text: { content: country } }] },
        "Campaign": { rich_text: [{ text: { content: campaign } }] },
        "QR Version": { rich_text: [{ text: { content: qrVersion } }] },
      },
    };

    await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers,
      body: JSON.stringify(pageBody),
    });
  } catch (err) {
    console.error("Error Notion:", err);
  }

  // Respuesta HTTP
  return Response.redirect(redirectUrl, 302);
}

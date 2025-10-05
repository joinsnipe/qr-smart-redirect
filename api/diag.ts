export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  const token = process.env.NOTION_TOKEN;
  const dbId  = process.env.NOTION_DB_ID;

  const result: any = {
    ok: true,
    hasToken: !!token,
    hasDbId: !!dbId,
    notionOk: false,
    notionStatus: null as any,
    notionText: "",
  };

  if (!token || !dbId) {
    result.ok = false;
    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = {
    parent: { database_id: dbId },
    properties: {
      "Name":       { title: [{ text: { content: `Diag - ${new Date().toISOString()}` } }] },
      "Timestamp":  { date: { start: new Date().toISOString() } },
      "OS":         { select: { name: "other" } },
      "Country":    { rich_text: [{ text: { content: "diag" } }] },
      "Campaign":   { rich_text: [{ text: { content: "diag" } }] },
      "QR Version": { rich_text: [{ text: { content: "1" } }] }
    }
  };

  try {
    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    result.notionStatus = res.status;
    result.notionText = await res.text();
    result.notionOk = res.ok;
  } catch (e: any) {
    result.ok = false;
    result.notionText = String(e?.message || e);
  }

  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

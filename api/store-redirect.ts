export const config = { runtime: "edge" };

const IOS_URL     = "https://apps.apple.com/es/app/snipe/id6743317310";
const ANDROID_URL = "https://play.google.com/store/apps/details?id=com.joinsnipe.mobile.snipe&hl=es";
const FALLBACK_URL= "https://joinsnipe.com/descargar"; // opcional

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const ua  = (req.headers.get("user-agent") || "").toLowerCase();

  // Forzado en test: ?os=ios|android|fallback
  const forced = url.searchParams.get("os");
  const targetForced =
    forced === "ios" ? IOS_URL :
    forced === "android" ? ANDROID_URL :
    forced === "fallback" ? FALLBACK_URL : null;
  if (targetForced) return htmlRedirect(targetForced);

  const isAndroid = /\bandroid\b|silk|kindle|kftt|kfps|kf[a-z0-9]+/.test(ua);
  const isIOS     = /\b(iphone|ipad|ipod|ios)\b/.test(ua) || (ua.includes("mac os x") && ua.includes("mobile"));

  const target = isIOS ? IOS_URL : isAndroid ? ANDROID_URL : FALLBACK_URL;
  return htmlRedirect(target);
}

function htmlRedirect(target: string) {
  const body = `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=${target}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Redirigiendo…</title>
<script>location.replace(${JSON.stringify(target)});</script>
<style>
  body{margin:0;display:grid;place-items:center;height:100vh;font-family:system-ui,Segoe UI,Roboto,Arial}
  .card{padding:24px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.1)}
</style>
</head><body>
  <div class="card">
    <noscript>Si no te hemos redirigido, <a href="${target}">toca aquí</a>.</noscript>
    <p>Redirigiendo…</p>
  </div>
</body></html>`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, max-age=300", // 5 min por dispositivo
      "Vary": "User-Agent",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

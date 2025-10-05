export const config = { runtime: "edge" };

// ⭐️ Rellena estos 3 enlaces con los definitivos
const IOS_URL = "https://apps.apple.com/app/idXXXXXXXXX";
const ANDROID_URL = "https://play.google.com/store/apps/details?id=com.tuapp";
const FALLBACK_URL = "https://tu-dominio.com/descargar"; // página con botones (opcional)

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const ua = (req.headers.get("user-agent") || "").toLowerCase();

  // Forzar destino en pruebas: ?os=ios|android|fallback
  const forced = url.searchParams.get("os");
  if (forced === "ios")     return redirect(IOS_URL);
  if (forced === "android") return redirect(ANDROID_URL);
  if (forced === "fallback")return redirect(FALLBACK_URL);

  // Detección robusta
  const isAndroid = /\bandroid\b|silk|kindle|kftt|kfps|kf[a-z0-9]+/.test(ua);
  const isIOS = /\b(iphone|ipad|ipod|ios)\b/.test(ua)
             || (ua.includes("mac os x") && ua.includes("mobile"));

  const target = isIOS ? IOS_URL : isAndroid ? ANDROID_URL : FALLBACK_URL;
  return redirect(target);
}

function redirect(target: string) {
  return new Response(null, {
    status: 302,
    headers: {
      "Location": target,
      "Cache-Control": "public, max-age=60"
    }
  });
}

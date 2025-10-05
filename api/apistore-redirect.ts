// Vercel Edge Function
export const config = { runtime: "edge" };

const IOS_URL = "https://apps.apple.com/app/idXXXXXXXXX"; // ← pon tu ID real
const ANDROID_URL = "https://play.google.com/store/apps/details?id=com.tuapp"; // ← tu package real
const FALLBACK_URL = "https://tu-dominio.com/descargar"; // landing con botones por si es escritorio/bot

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const ua = (req.headers.get("user-agent") || "").toLowerCase();

  // Permite forzar destino para test: ?os=ios | android | fallback
  const forced = url.searchParams.get("os");
  if (forced === "ios") return redirect(IOS_URL);
  if (forced === "android") return redirect(ANDROID_URL);
  if (forced === "fallback") return redirect(FALLBACK_URL);

  // Detección básica y robusta
  const isAndroid = /\bandroid\b|silk|kindle|kftt|kfps|kf[a-z0-9]+/.test(ua);
  const isIOS =
    /\b(iphone|ipad|ipod|ios)\b/.test(ua) ||
    (ua.includes("mac os x") && ua.includes("mobile")); // iPadOS antiguos

  const target = isIOS ? IOS_URL : isAndroid ? ANDROID_URL : FALLBACK_URL;
  return redirect(target);
}

function redirect(target: string) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      // Cache corto = rápido y te permite cambiar destinos sin reimprimir QR
      "Cache-Control": "public, max-age=60",
    },
  });
}

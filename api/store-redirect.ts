export const config = { runtime: "edge" };

const IOS_URL = "https://apps.apple.com/es/app/snipe/id6743317310";
const ANDROID_URL = "https://play.google.com/store/apps/details?id=com.joinsnipe.mobile.snipe&hl=es";
const FALLBACK_URL = "https://joinsnipe.com/descargar"; // opcional, landing si quieres

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const ua = (req.headers.get("user-agent") || "").toLowerCase();

  // Forzar destino manual (solo test)
  const forced = url.searchParams.get("os");
  if (forced === "ios") return redirect(IOS_URL);
  if (forced === "android") return redirect(ANDROID_URL);
  if (forced === "fallback") return redirect(FALLBACK_URL);

  // Detección del sistema operativo
  const isAndroid = /\bandroid\b|silk|kindle|kftt|kfps|kf[a-z0-9]+/.test(ua);
  const isIOS =
    /\b(iphone|ipad|ipod|ios)\b/.test(ua) ||
    (ua.includes("mac os x") && ua.includes("mobile"));

  const target = isIOS ? IOS_URL : isAndroid ? ANDROID_URL : FALLBACK_URL;

  return redirect(target);
}

function redirect(target: string) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Cache-Control": "public, max-age=60",
    },
  });
}

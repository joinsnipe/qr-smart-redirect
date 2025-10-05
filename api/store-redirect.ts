export const config = { runtime: "edge" };

const IOS_WEB_URL    = "https://apps.apple.com/es/app/snipe/id6743317310";
const ANDROID_WEB_URL= "https://play.google.com/store/apps/details?id=com.joinsnipe.mobile.snipe&hl=es";
// Esquemas nativos (abren directamente la app de la tienda)
const IOS_NATIVE     = "itms-apps://itunes.apple.com/app/id6743317310";
const ANDROID_NATIVE = "market://details?id=com.joinsnipe.mobile.snipe";

const FALLBACK_URL   = "https://joinsnipe.com/descargar"; // landing con botones

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const ua  = (req.headers.get("user-agent") || "").toLowerCase();

  // Forzado manual (tests)
  const forced = url.searchParams.get("os");
  if (forced === "ios")     return redirect(IOS_WEB_URL);
  if (forced === "android") return redirect(ANDROID_WEB_URL);
  if (forced === "fallback")return redirect(FALLBACK_URL);

  const isAndroid = /\bandroid\b|silk|kindle|kftt|kfps|kf[a-z0-9]+/.test(ua);
  const isIOS = /\b(iphone|ipad|ipod|ios)\b/.test(ua) || (ua.includes("mac os x") && ua.includes("mobile"));

  // “Fast Mode”: usa esquema nativo si es móvil; si no, web
  const target = isIOS
    ? IOS_NATIVE
    : isAndroid
      ? ANDROID_NATIVE
      : FALLBACK_URL;

  // Algunos navegadores muy viejos no abren esquemas nativos desde Location.
  // Si el cliente no soporta, el usuario quedará en el navegador.
  // Como “second chance”, podrías cambiar target a URL web.
  return redirect(target);
}

function redirect(target: string) {
  return new Response(null, {
    status: 302, // mantenemos 302 para poder cambiar destinos si hiciera falta
    headers: {
      "Location": target,
      "Cache-Control": "private, max-age=86400", // cachea 1 día por dispositivo
      "Vary": "User-Agent"
    }
  });
}

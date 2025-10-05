qr embajador meter qr planet en url


🧭 POR QUÉ DEBEMOS DOCUMENTARLO

Porque todo esto (QR dinámico + redirección inteligente + analítica por campaña) es parte del core de adquisición orgánica de Snipe.
El día de mañana:

alguien tendrá que replicar o mantener la arquitectura,

los embajadores y partners usarán los UTM para medir resultados,

y el equipo de growth o data necesitará referencias claras para los informes.

Sin documentación, esa trazabilidad se pierde.

📘 QUÉ DEBE INCLUIR LA DOCUMENTACIÓN

Yo lo estructuraría así, con formato de Notion o README dentro del repo qr-smart-redirect:

1️⃣ Descripción general

Sistema de redirección inteligente para QR, alojado en Vercel, que detecta el sistema operativo (iOS/Android) y redirige automáticamente a la tienda correspondiente.
Soporta parámetros UTM para rastreo de campañas y embajadores.

2️⃣ Flujo técnico
Escaneo QR → QR Planet → Vercel Edge Function (/api/store-redirect)
→ Redirección HTTPS → App Store / Google Play
→ Datos de escaneo registrados en QR Planet
→ Instalaciones rastreadas en Play Console / App Store Connect

3️⃣ Configuración actual

Dominio de producción: https://qr-smart-redirect.vercel.app

Repositorio: github.com/joinsnipe/qr-smart-redirect

Archivo principal: api/store-redirect.ts

Caché: Cache-Control: private, max-age=3600

Headers: Vary: User-Agent

4️⃣ Parámetros UTM

Ejemplo de URLs:

const IOS_URL = "https://apps.apple.com/es/app/snipe/id6743317310?utm_source=qrplanet&utm_medium=sticker&utm_campaign=lanzamiento";
const ANDROID_URL = "https://play.google.com/store/apps/details?id=com.joinsnipe.mobile.snipe&hl=es&utm_source=qrplanet&utm_medium=sticker&utm_campaign=lanzamiento";


Opcional dinámico:

...?c=embajador_mikel


→ genera utm_campaign=embajador_mikel.

5️⃣ Donde ver métricas

QR Planet: Escaneos, país, SO, repeticiones.

Google Play Console:
Crecimiento → Adquisición de usuarios → Campañas personalizadas.

App Store Connect:
App Analytics → Fuentes de tráfico → Referencias externas.

6️⃣ Buenas prácticas

Usar siempre HTTPS (no market://).

Redirección directa en QR Planet.

Actualizar versión (?v=2, ?v=3) si se cambian destinos.

Documentar cada campaña con nombre UTM único.

7️⃣ Responsables
Área	Responsable	Tareas
Infraestructura QR	Rubén / Iván	Gestión en Vercel y GitHub
Creación QR	Judith	Generación en QR Planet
Métricas	Cristina	Revisión de campañas UTM en consolas
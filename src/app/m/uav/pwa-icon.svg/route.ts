/**
 * Modul-eigenes Icon als Route statt Datei in `public/` — Muster
 * `qr/pwa-icon.svg/route.ts` (siehe dort für die Begründung: `public/` wird auf
 * *allen* Hosts ausgeliefert, ein Route Handler unterhalb von `/m/uav/` nur auf
 * dem Modul-Host). Motiv: eine einfache Drohne (Vierarm-Rahmen mit Rotoren).
 */
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="24" fill="#c8000f"/>
  <g stroke="#fff" stroke-width="8" stroke-linecap="round">
    <line x1="60" y1="60" x2="132" y2="132"/>
    <line x1="132" y1="60" x2="60" y2="132"/>
  </g>
  <circle cx="60" cy="60" r="20" fill="none" stroke="#fff" stroke-width="8"/>
  <circle cx="132" cy="60" r="20" fill="none" stroke="#fff" stroke-width="8"/>
  <circle cx="60" cy="132" r="20" fill="none" stroke="#fff" stroke-width="8"/>
  <circle cx="132" cy="132" r="20" fill="none" stroke="#fff" stroke-width="8"/>
  <rect x="80" y="80" width="32" height="32" rx="6" fill="#fff"/>
</svg>`;

export function GET() {
  return new Response(ICON, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=3600",
    },
  });
}

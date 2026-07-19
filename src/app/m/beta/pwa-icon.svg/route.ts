/**
 * Modul-eigenes Icon als Route statt Datei in `public/`: `public/` wird auf
 * *allen* Hosts ausgeliefert (die Middleware sieht statische Assets nicht),
 * ein Route Handler unterhalb von `/m/beta/` nur auf dem Modul-Host.
 */
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="24" fill="#c8000f"/>
  <rect x="40" y="40" width="44" height="44" fill="#fff"/>
  <rect x="108" y="40" width="44" height="44" fill="#fff"/>
  <rect x="40" y="108" width="44" height="44" fill="#fff"/>
  <rect x="112" y="112" width="16" height="16" fill="#fff"/>
  <rect x="136" y="136" width="16" height="16" fill="#fff"/>
</svg>`;

export function GET() {
  return new Response(ICON, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=3600",
    },
  });
}

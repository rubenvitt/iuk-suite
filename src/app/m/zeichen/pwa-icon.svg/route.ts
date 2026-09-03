/**
 * Modul-eigenes Icon als Route statt Datei in `public/`: `public/` wird auf
 * ALLEN Hosts ausgeliefert (die Middleware sieht statische Assets nicht), ein
 * Route Handler unterhalb von `/m/zeichen/` nur auf dem Modul-Host.
 *
 * Handgeschriebenes SVG, KEIN Import aus `@ant-design/icons` (Falle 7): der
 * nackte Spezifizierer loest in der RSC-Ebene auf CJS auf, das `createContext`
 * auf Modulebene ruft — HTTP 500 schon beim Import, und `"use client"` behebt
 * das nicht, es macht es still.
 *
 * Das Motiv ist das Grundzeichen einer Gruppe: das Rechteck der Einheit mit
 * drei Punkten darueber.
 */
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="24" fill="#c8000f"/>
  <circle cx="72" cy="54" r="8" fill="#fff"/>
  <circle cx="96" cy="54" r="8" fill="#fff"/>
  <circle cx="120" cy="54" r="8" fill="#fff"/>
  <rect x="36" y="80" width="120" height="72" fill="none" stroke="#fff" stroke-width="10"/>
</svg>`;

export function GET(): Response {
  return new Response(ICON, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=3600",
    },
  });
}

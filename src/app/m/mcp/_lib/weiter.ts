import type { Weiter } from "./vermittlung";

/** Eine Umleitung oder eine knappe Fehlerseite. */
export function alsAntwort(w: Weiter): Response {
  if (w.art === "umleiten") return new Response(null, { status: 302, headers: { location: w.ziel, "cache-control": "no-store" } });
  return new Response(w.text, { status: w.status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}

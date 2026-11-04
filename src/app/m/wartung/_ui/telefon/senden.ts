import type { SendeAntwort } from "../../_lib/koerper";

/**
 * Eine Sendung an die multipart-Routen am Gerät (Prüfung, Mangel) — IDA-358.
 *
 * ⚠️ NUR EINE ANTWORT DER ROUTE IST EINE ANTWORT. Während eines Rollouts liefert der
 * Proxy 502 oder eine HTML-Fehlerseite, ohne JSON. Das ist kein „abgelehnt", sondern
 * „nicht angekommen": dann WIRFT diese Funktion, und `useEntwurf` versucht es erneut.
 */
export async function sendeAnRoute(url: string, daten: FormData): Promise<SendeAntwort> {
  const r = await fetch(url, { method: "POST", body: daten });
  const a = (await r.json().catch(() => null)) as SendeAntwort | null;
  if (!a || typeof a.ok !== "boolean") throw new Error(`Keine Antwort der Route (HTTP ${r.status})`);
  return a;
}

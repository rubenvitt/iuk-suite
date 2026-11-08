/**
 * Hilfen für die multipart-Routen am Gerät (Prüfung, Mangel) — Vorbild `lagerbuch/helfer/mangel/melden`.
 */
import { FOTO_MAX_BYTES } from "./fotos";

export const KOPF = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } as const;

/** `weiter` wie in `Ergebnis`: nach der Rückgabe der ganzen Kiste die jetzt fällige Prüfart „nach Benutzung“. */
export type SendeAntwort = { ok: true; maengel?: number; weiter?: string } | { ok: false; fehler: string; feld?: string };

export function antwort(status: number, koerper: SendeAntwort): Response {
  return new Response(JSON.stringify(koerper), { status, headers: KOPF });
}

/** Eine fremde Seite darf hier nichts abschicken. */
export function fremdeHerkunft(req: Request): boolean {
  const herkunft = req.headers.get("origin");
  if (!herkunft) return false;
  try {
    return new URL(herkunft).host !== req.headers.get("host");
  } catch {
    return true;
  }
}

/** Höchstens so viele Fotos je Sendung (ein Foto je Mangel). */
export const MAX_FOTOS = 10;
/** Platz für Textfelder und multipart-Rahmen neben den Fotos. */
export const RAHMEN_MAX = 256 * 1024;
export const KOERPER_MAX = MAX_FOTOS * FOTO_MAX_BYTES + RAHMEN_MAX;

/** Den Körper lesen, aber nie mehr als `max` Bytes; gezählt wird beim Lesen. */
export async function formularGelesen(req: Request, max = KOERPER_MAX): Promise<FormData | "zu_gross" | null> {
  const angegeben = req.headers.get("content-length");
  if (angegeben !== null && (!/^\d+$/.test(angegeben) || Number(angegeben) > max)) return "zu_gross";
  const reader = req.body?.getReader();
  if (!reader) return null;
  let bytes = 0;
  const teile: Uint8Array[] = [];
  try {
    while (true) {
      const teil = await reader.read();
      if (teil.done) break;
      bytes += teil.value.byteLength;
      if (bytes > max) {
        await reader.cancel();
        return "zu_gross";
      }
      teile.push(teil.value);
    }
    return await new Request(req.url, {
      method: "POST",
      headers: { "content-type": req.headers.get("content-type") ?? "" },
      body: new Uint8Array(Buffer.concat(teile)),
    }).formData();
  } catch {
    return null;
  }
}

export function datei(wert: FormDataEntryValue | null): File | null {
  return wert instanceof File && wert.size > 0 ? wert : null;
}

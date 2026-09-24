import { ausBase64, type Bytes } from "../kern/bytes";

export const KEK_VARIABLE = "EINSATZBUCH_SCHLUESSEL_KEK";
/** NUR für lokale Entwicklung und Tests (Seed). UTF-8 von „einsatzbuch-entwicklungs-kek-32b". */
export const ENTWICKLUNGS_KEK = "ZWluc2F0emJ1Y2gtZW50d2lja2x1bmdzLWtlay0zMmI=";

export type KekErgebnis = { status: "ok"; kek: Bytes } | { status: "fehlt" } | { status: "ungueltig" };

/** Liest den KEK frisch aus der Umgebung (nie auf Modulebene zwischenspeichern: Tests setzen ihn um). */
export function kekAusUmgebung(env: Record<string, string | undefined> = process.env): KekErgebnis {
  const roh = env[KEK_VARIABLE]?.trim();
  if (!roh) return { status: "fehlt" };
  try {
    const kek = ausBase64(roh);
    return kek.length === 32 ? { status: "ok", kek } : { status: "ungueltig" };
  } catch {
    return { status: "ungueltig" };
  }
}

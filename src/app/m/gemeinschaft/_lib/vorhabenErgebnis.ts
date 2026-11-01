import { ZodError } from "zod";

/**
 * Rückgabetyp der Planungs-Actions (`_actions/vorhaben.ts`), Bauart wie `schichtplan/_lib/actionErgebnis.ts`:
 * Rückgabewert statt Wurf, weil Next Fehlertexte aus Server Actions im Produktionsbau durch einen englischen
 * Allgemeinsatz ersetzt. Keine Direktive: Actions und Client-Inseln lesen diese Datei.
 */
export type FeldFehler = Record<string, string>;

export type ActionErgebnis<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { wert: T }))
  | { ok: false; fehler: string; feldFehler?: FeldFehler };

/** Der gemeinsame Nenner für Aufrufer, die nur Erfolg oder Fehlersatz brauchen. */
export type ActionAusgang = { ok: true } | { ok: false; fehler: string; feldFehler?: FeldFehler };

/** Erster Fehler je Feld, als Karte für die Anzeige am Feld. */
export function zodFehler(e: unknown): FeldFehler | null {
  if (!(e instanceof ZodError)) return null;
  const karte: FeldFehler = {};
  for (const problem of e.issues) {
    const feld = problem.path.join(".") || "_";
    if (!(feld in karte)) karte[feld] = problem.message;
  }
  return karte;
}

import { ZodError } from "zod";

/**
 * DER GEMEINSAME RUECKGABETYP ALLER VERWALTUNGS-ACTIONS.
 *
 * WARUM RUECKGABEWERT UND NICHT WURF (§11.2 (d), §6.15 Auflage 20): der
 * Bestand hat 22 ungefangene Action-Aufrufstellen, 19 davon in der
 * Verwaltung. Sie liegen alle in Bausteinen, die dieses Vorhaben anfaszt — der
 * Umbau ist also der Anlass, sie zu schlieszen, und kein Nachtrag danach.
 *
 * ⚠️ UND DIE ZWOELF GEFANGENEN STELLEN WERDEN EBENFALLS UMGESTELLT:
 * `e.message` ist in Produktion NICHT der deutsche Satz aus der Action,
 * sondern „An error occurred in the Server Components render…" (Falle 66).
 * Next ersetzt Fehlermeldungen aus Server Actions im Produktionsbau durch
 * einen generischen englischen Text — ein `catch (e) { setFehler(e.message) }`
 * sieht in der Entwicklung richtig aus und zeigt der Verwaltenden im Betrieb
 * Framework-Englisch statt „Noch mit 12 Buchungen verknuepft".
 *
 * KEIN "use server" auf dieser Datei: dort waere jeder Export eine Action, und
 * ein exportierter TYP ist dort ein Fehler, den erst die Laufzeit meldet.
 * KEIN "use client": Server Actions lesen sie.
 */
export type FeldFehler = Record<string, string>;

export type ActionErgebnis<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { wert: T }))
  | { ok: false; fehler: string; feldFehler?: FeldFehler };

/**
 * Uebersetzt einen `ZodError` in eine Feldkarte, damit die Insel den Text am
 * FELD anzeigen kann statt in einem Kasten daneben. Der erste Fehler je Feld
 * gewinnt: zwei Meldungen an einem Eingabefeld sind eine mehr, als jemand
 * lesen wird.
 *
 * Liefert `null`, wenn `e` kein `ZodError` ist — der Aufrufer entscheidet dann
 * auf einen allgemeinen Fehler.
 */
export function zodFehler(e: unknown): FeldFehler | null {
  if (!(e instanceof ZodError)) return null;
  const karte: FeldFehler = {};
  for (const problem of e.issues) {
    const feld = problem.path.join(".") || "_";
    if (!(feld in karte)) karte[feld] = problem.message;
  }
  return karte;
}

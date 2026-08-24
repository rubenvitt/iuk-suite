/**
 * Die zweite Rechtestufe des Moduls `radio` — ihr Name, ihre Feld-Allowlist und der Filter
 * darauf. Entschieden ist sie als Betreiberentscheidung C.6 / B4 vom 2026-08-21 (ZWEI Stufen
 * wie im Bestand); der Verzeichnisbaum der Spec fuehrt genau diese drei Traeger hier
 * (`Spec:4290`).
 *
 * ⛔ DIESE DATEI IST REIN. Sie liest KEINE Umgebung, sie ruft nichts, und sie hat KEINEN
 * Import — auch keinen Typimport. Das ist die ganze Begruendung ihrer Existenz:
 *   - `UPDATER_FELDER` wird als WERT von einer `"use client"`-Insel gelesen (V14, das
 *     Geraeteformular sperrt daraus seine Felder), also liegt diese Datei im Client-Bundle.
 *   - Die GRUPPENQUELLE `SUITE_UPDATER_GROUP_RADIO` liegt deshalb NICHT hier, sondern in
 *     `_lib/zugang.ts` (Aufgabe V3), neben `istRadioAdmin` — ausschliesslich serverseitig
 *     gelesen. Dort stehen `updaterGruppe()` und `istInUpdaterGruppe()`.
 *   - Beides in EINER Datei ginge still schief: eine Umgebungsvariable ohne den Praefix, den
 *     Next in den Browser reicht, ist im Bundle schlicht nicht gesetzt, und die
 *     Stufenpruefung gaebe `false` zurueck. Typkorrekt, lint-sauber, fuer `build`
 *     unsichtbar. Dieselbe Bruchstelle aus der Gegenrichtung: `src/core/shell/types.ts:10-15`.
 *   - Ein Import auf ein serverseitiges Modul zoege es ueber dieselbe Grenze mit. Wer hier
 *     einen Typ braucht, deklariert ihn HIER.
 *
 * ⚠️ BENANNTE ABWEICHUNG VON DER SPEC, KEINE AUSLASSUNG: `Spec:4415-4425` und `Spec:4843-4845`
 * legen die Gruppenquelle und ihre vier Testfaelle in diese Datei bzw. in `_lib/rollen.test.ts`.
 * Der Schnitt folgt hier der Client/Server-Grenze, nicht dem Kapiteltext — und der
 * Verzeichnisbaum `Spec:4290` zieht ihn ohnehin so: er fuehrt hier NUR die drei Traeger
 * unten. Der eigenstaendige Mechanismus als solcher bleibt begruendet wie in `Spec:4415-4425`:
 * `src/core/registry.ts` kennt je Modul genau zwei Ueberschreibungen, `SUITE_HOST_<KEY>` und
 * `SUITE_ADMIN_GROUP_<KEY>` (`CLAUDE.md:139-140`) — eine zweite Gruppe ist dort nicht
 * vorgesehen.
 *
 * ⛔ PROSA-SPERRE AUF DIESER DATEI, UND SIE IST GEMESSEN. `_lib/rollen.test.ts` scannt den
 * ROHEN Dateitext, Kommentare eingeschlossen, auf den Namen des Umgebungszugriffs. Wer die
 * Trennung hier auch nur ERKLAEREN will, indem er ihn ausschreibt, faerbt den Scan rot.
 * Vorbild und Messung im Modul: `_db/leihen.ts:57-64` (`1 failed | 25 passed`, allein an
 * einem Kommentar). Die strengere Richtung ist hier die sichere — der Scan meldet lieber
 * einmal zu viel als eine stille Wiedervereinigung.
 *
 * ⛔ KEIN `"use client"` UND KEIN `"use server"`. Falle 6 (`CLAUDE.md`): ein Wert aus einem
 * als Client markierten Modul kommt in einer Server Component nicht an — HTTP 500 fuer die
 * ganze Seite, und Vitest kann es strukturell nicht sehen. `riegel.test.ts:1064-1117` setzt
 * beide Richtungen modulweit durch.
 *
 * ⬜ V-L1 / E1b — wie die Updater-Gruppe in PRODUKTION heisst, weiss nur der Betreiber;
 * faellig vor Cut 26 (`docs/superpowers/plans/SPERREN-radio-spec2.md:110`). Diese Datei
 * traegt deshalb keinen Gruppennamen; `.env.example` traegt einen auskommentierten Vorschlag.
 * ⛔ Ein leerer oder fehlender Wert SCHLIESST die Stufe (`Spec:4420-4422`) — der Riegel dazu
 * steht in `_lib/zugang.ts` (V3), nicht hier.
 */

/**
 * Die zwei Stufen, 1:1 aus `radio-admin/shared/src/role.ts:1` (`export type Role = 'admin' |
 * 'updater'`).
 *
 * ⛔ `admin` IST STRIKT STRENGER ALS `updater`, nicht daneben: im Bestand gewinnt `admin` bei
 * Ueberschneidung (`radio-admin/shared/src/role.ts:7-8`, Faelle in `role.test.ts:4-33`). Wer
 * die zweite Stufe als `||` in `istRadioAdmin` hineinfaltet, macht aus einer Verfeinerung eine
 * Aufweichung (`_lib/zugang.ts:153-155`).
 *
 * ⚠️ NAMENSDIVERGENZ, BENANNT STATT STILL: `Spec:4290` schreibt den Traeger als `RADIO_ROLLE`.
 * Verbindlich ist die Typform `RadioRolle` — so fuehren ihn `Spec:4203`
 * (`radioNav(stufe: RadioRolle)`), `Spec:4353` und `Spec:4508`; `Spec:4290` ist die einzige
 * abweichende Stelle.
 */
export type RadioRolle = "admin" | "updater";

/**
 * Die drei Felder, die eine Updater-Person am Geraet aendern darf.
 *
 * ⛔ 1:1 AUS `radio-admin/shared/src/editable-fields.ts:3` (`UPDATER_EDITABLE_FIELDS`) —
 * Reihenfolge und Woerter unveraendert. Ein viertes Feld hier ist eine Rechteerweiterung, die
 * kein Tor sieht; `rollen.test.ts` haelt die Liste deshalb mit `toEqual` fest, nicht mit
 * `toContain`.
 *
 * ⚠️ DER SATZ DANEBEN, DEN DER BESTAND NICHT UEBER DIESE LISTE FUEHRT: Notizen anhaengen darf
 * die Updater-Stufe ebenfalls — die Tafel „Was die Stufen duerfen" fuehrt „Notiz anfuegen | ja |
 * ja" auf `Spec:4448` (Tafel `Spec:4444-4454`). Das ist ein eigener Schreibpfad
 * (`_lib/notiz.ts`, V8) und kein Feld dieses Patches — wer es hier eintraegt,
 * oeffnet das Notizfeld des GERAETEFORMULARS, was etwas anderes ist.
 */
export const UPDATER_FELDER = ["softwareVersion", "lastUpdatedAt", "status"] as const;

/**
 * Schneidet aus einem Patch die Felder heraus, die die Stufe schreiben darf.
 *
 * ⛔ 1:1 AUS `radio-admin/shared/src/editable-fields.ts:5-18` (`filterEditableFields`).
 *
 * ⛔ VERWIRFT STILL, LEHNT NICHT AB (`Spec:4435-4440`): das Alt-Formular zeigt gesperrte
 * Felder als `disabled` (`radio-admin/client/src/features/devices/DeviceFields.tsx:67`), ein
 * Fehler statt eines Verwerfens waere also nur mit einer manipulierten Anfrage erreichbar —
 * und wuerde dort einen Riegel verraten, den ein Verwerfen still haelt.
 *
 * ⛔ ITERIERT `Object.keys(patch)`, NICHT `UPDATER_FELDER` (`editable-fields.ts:12`). Ueber die
 * Allowlist zu laufen setzte jedes im Patch FEHLENDE Feld als `undefined` — und `diffGeraet`
 * (V8) schriebe es als Aenderung fort. Der Bestand faengt das eine Ebene tiefer zwar ab
 * (`diff-device.ts:18`: `if (next === undefined) continue;`), aber sich darauf zu verlassen
 * waere eine Kopplung ueber zwei Dateien.
 *
 * ⛔ DIE ADMIN-STUFE BEKOMMT EINE FLACHE KOPIE, NICHT DAS UEBERGEBENE OBJEKT: der Aufrufer in
 * `admin/actions.ts` (V10) baut aus dem Ergebnis weiter, und eine zurueckgegebene Referenz
 * schriebe jede spaetere Aenderung in seinen Patch zurueck.
 */
export function filterSchreibbareFelder<T extends Record<string, unknown>>(
  rolle: RadioRolle,
  patch: T,
): Partial<T> {
  if (rolle === "admin") return { ...patch };
  const erlaubt = new Set<string>(UPDATER_FELDER);
  const ergebnis: Partial<T> = {};
  for (const schluessel of Object.keys(patch)) {
    if (erlaubt.has(schluessel)) {
      (ergebnis as Record<string, unknown>)[schluessel] = patch[schluessel];
    }
  }
  return ergebnis;
}

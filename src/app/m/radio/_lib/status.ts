import { einsatzbereitschaftAus } from "./einsatzbereitschaft";
/**
 * Der eigene Status-Chip des Ausleihwegs: Union, Etiketten, Toene und die vier Hexpaare (Entscheidung E3, Spec 1 §4.6.2,
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:3671-3697`).
 *
 * ⛔ KEIN `"use client"` — Falle 6 (`CLAUDE.md`, Punkt 6). Diese Datei wird von einer
 * SERVER Component gelesen (`_ui/StatusChip.tsx`, A16) UND von den Client-Zeilen der
 * Geraeteliste (A18); ein Wert aus einem Client-Modul kaeme in der Server Component nicht
 * an — HTTP 500 fuer die ganze Seite, und Vitest kann es strukturell nicht sehen. Der Scan,
 * der das modulweit durchsetzt, steht in `src/app/m/radio/riegel.test.ts:909-962`.
 *
 * ⛔ KEIN ANTD-`Tag`, KEIN `Alert type="error"` — und der Grund ist gemessen:
 * `colorError === colorPrimary === FARBEN.rot` (`src/core/theme/theme.ts:32-33`). Rot ist
 * in dieser Suite die PRIMAERAKTION; ein `Tag color="error"` fuer „Defekt" saehe aus wie
 * der Knopf, den man druecken soll (Falle 3).
 *
 * ⛔ UND DESHALB WERDEN DIE VIER HEXPAARE HIER GEFUEHRT UND NICHT AUS ANTD-TOKENS
 * ABGELEITET (⬜ A-L10, Spec:3691-3694). Diese Datei importiert `@/core/theme/tokens`
 * ABSICHTLICH NICHT: ein Import laese sich als genau jene Ableitung. Der Vergleich gegen
 * `FARBEN.rot` steht im Test (`_lib/status.test.ts`), wo er hingehoert.
 * **A16 liest `STATUS_HEX` von HIER** und schreibt die Werte als EIGENE CSS-Variablen ins
 * Modul-Stylesheet — ⛔ nicht als `--ant-*` (Falle 2: antd deklariert seine Variablen auf
 * seiner Scope-Klasse, eigenes Markup sieht sie nicht, und der Fehler ist still).
 *
 * ⚠️ FARBE IST NIE DER EINZIGE TRAEGER. Der Statuspunkt (10px, `aria-hidden`) steht neben
 * einem ETIKETT, nicht an seiner Stelle (Spec:3696-3697). Zugesichert wird das an
 * `_ui/StatusChip.tsx` in A16 (`.superpowers/sdd/planteil3/VORABSCAN-A.md:295-304`,
 * Fund F15) — hier gibt es dafuer kein Pruefobjekt.
 */

/**
 * Die vier Zustaende eines Geraets auf der Ausleihflaeche.
 *
 * ⬜ A-L13, ERSTER TEIL — DIE WERTE. Sie existierten in diesem Repo bis heute nicht
 * (gemessen: `grep -rn "GeraeteStatus" src/app/m/radio/` lieferte null Treffer, und
 * `_db/schema.ts:30` fuehrt `status: text("status")` als NULLABLE Textspalte OHNE `enum`).
 * Abgelesen, nicht geraten, aus dem Alt-Bestand:
 * `radio-inventar/packages/shared/src/schemas/device.schema.ts:141` —
 * `z.enum(['AVAILABLE', 'ON_LOAN', 'DEFECT', 'MAINTENANCE'])`.
 *
 * ⛔ VIER ZWEIGE, KEIN FUENFTER. Was ein `status = NULL` bedeutet, ist entschieden und
 * steht an `geraeteZustandAus` unten.
 *
 * ⚠️ `ON_LOAN` KOMMT NIE AUS DER SPALTE `devices.status`, sondern aus der Tabelle `loans`
 * — die Ueberlagerung baut A15 (`_db/leihen.ts`). Der Bestand trennt genauso
 * (`radio-admin/shared/src/loan.ts:12-14`).
 */
export type GeraeteStatus = "AVAILABLE" | "ON_LOAN" | "DEFECT" | "MAINTENANCE";

/**
 * Der geschlossene Satz, als WERT — nach dem Vorbild von `GATE_GRUENDE`
 * (`src/app/m/radio/_lib/gateTexte.ts:37-43`). Er ist exportiert, damit der Test ihn
 * durchlaufen kann: waechst die Union um einen Zweig, ohne dass diese Liste ihn kennt, ist
 * das ein Typfehler an `ETIKETT` und `TON` unten und kein stilles `undefined`.
 */
export const GERAETE_STATUS: readonly GeraeteStatus[] = [
  "AVAILABLE",
  "ON_LOAN",
  "DEFECT",
  "MAINTENANCE",
] as const;

/** Die vier Farbtoene des Chips. Deutsch benannt — sie haben keine Quelle, die sie bindet. */
export type StatusTon = "frei" | "vergeben" | "defekt" | "wartung";

/** Der geschlossene Satz der Toene, aus demselben Grund wie `GERAETE_STATUS`. */
export const STATUS_TOENE: readonly StatusTon[] = [
  "frei",
  "vergeben",
  "defekt",
  "wartung",
] as const;

/**
 * Zustand -> Ton. Umkehrbar eindeutig; `_lib/status.test.ts` sichert das zu, weil eine
 * Zuordnung „DEFECT auf frei" sonst vollzaehlig UND gruen waere.
 */
const TON: Record<GeraeteStatus, StatusTon> = {
  AVAILABLE: "frei",
  ON_LOAN: "vergeben",
  DEFECT: "defekt",
  MAINTENANCE: "wartung",
};

/**
 * Zustand -> Etikett, woertlich aus dem Alt-Kiosk
 * (`radio-inventar/apps/frontend/src/components/features/StatusBadge.tsx`, Zeilen 25, 32,
 * 39, 46).
 *
 * ⚠️ BILDSCHIRMTEXTE MIT UMLAUTEN — die eine benannte Ausnahme der Hausregel
 * „keine Umlaute in Bezeichnern und zitierten Werten" (`briefs/KOPF.md`, Global
 * Constraints). Ein „Verfuegbar" auf dem Chip waere schlicht falsches Deutsch.
 */
const ETIKETT: Record<GeraeteStatus, string> = {
  AVAILABLE: "Verfügbar",
  ON_LOAN: "Ausgeliehen",
  DEFECT: "Defekt",
  MAINTENANCE: "Wartung",
};

/** Der Farbton des Chips zu einem Zustand. */
export function statusTon(status: GeraeteStatus): StatusTon {
  return TON[status];
}

/** Der sichtbare Text des Chips zu einem Zustand. */
export function statusEtikett(status: GeraeteStatus): string {
  return ETIKETT[status];
}

/**
 * ⬜ A-L10 — DIE VIER HEXPAARE, WOERTLICH aus
 * `/Users/rubeen/dev/personal/drk/radio-inventar/apps/frontend/src/components/features/StatusBadge.tsx`,
 * und zwar aus `badgeClassName` (Zeilen 27, 34, 41, 49).
 *
 * ⛔ NICHT AUS `indicatorClassName` (Zeilen 28-29, 35-36, 42-43, 50-51): das sind dieselben
 * Farben MIT Deckkraft-Zusaetzen, und bei „Wartung" sogar ganz andere Werte (`slate-*`
 * statt `#6b7280`). Wer die falsche der beiden Zeilen liest, bekommt ein plausibles
 * Ergebnis, das nicht der Chip ist.
 *
 * Die Lesart von `bg-[#22c55e] dark:bg-[#16a34a]`: der erste Wert ist die HELLE
 * Darstellung, der zweite die DUNKLE. Der Alt-Kiosk begruendet die Paare mit WCAG-AA
 * (`StatusBadge.tsx:19-22`).
 */
export const STATUS_HEX: Record<StatusTon, { hell: string; dunkel: string }> = {
  frei: { hell: "#22c55e", dunkel: "#16a34a" },
  vergeben: { hell: "#f59e0b", dunkel: "#d97706" },
  defekt: { hell: "#ef4444", dunkel: "#dc2626" },
  wartung: { hell: "#6b7280", dunkel: "#9ca3af" },
};

/**
 * Der FREITEXT der Spalte `devices.status` -> einer der vier Zustaende.
 *
 * ⛔ DIE EINTEILUNG IST DIE DER VERWALTUNG (IDA-397): `einsatzbereitschaftAus`
 * (`_lib/einsatzbereitschaft.ts`) entscheidet, ob ein Geraet raus darf; diese Funktion
 * waehlt danach nur noch das Etikett. Bis IDA-397 faltete sie nur „Defekt" und „Wartung"
 * auf gesperrt, und jeder andere Wert („in Reparatur", „ausgemustert", „Sonstiges") lief
 * als frei durch — ein Geraet in Reparatur liess sich ausleihen.
 *
 * ⛔ ⬜ A-L13, ZWEITER TEIL — LEER BLEIBT FREI, UND DAS IST EINE BETREIBERENTSCHEIDUNG,
 * KEIN VERGESSENER ZWEIG. Beleg: `.superpowers/sdd/planteil3/progress.md:22-32`,
 * woertlich: „`status = NULL` faellt auf ‚frei' zurueck … Kein fuenfter Chip-Zustand,
 * kein eigener Ton ‚unbekannt', keine Sperre der Ausleihe." `einsatzbereitschaftAus`
 * liest leer ebenso als einsatzbereit; IDA-397 aendert daran nichts.
 *
 * ⚠️ DER PREIS IST BEKANNT UND ANGENOMMEN (`progress.md:27-29`): „ein Geraet ohne
 * erfassten Zustand sieht auf der Flaeche aus wie ein geprueft freies."
 *
 * ⚠️ EIN ALTES „Ausgeliehen" (oder `ON_LOAN`) IM FREITEXT IST EIN DATENREST, KEIN
 * LEIHSTAND, und zaehlt in beiden Einteilungen als einsatzbereit. Wer es mitliest, sperrt
 * ein freies Geraet auf Dauer.
 *
 * ⛔ JEDER ANDERE GESPERRTE WERT TRAEGT DAS ETIKETT VON `DEFECT`. Die Ausleihflaeche kennt
 * vier Zustaende (A-L13, kein fuenfter), und wer etwas anderes als „einsatzbereit"
 * eintraegt, meint fast immer, dass etwas fehlt — dieselbe Lesart wie in der Verwaltung.
 * Nur „Wartung" behaelt sein eigenes Etikett, weil der Chip es fuehrt.
 *
 * ⚠️ „ausgemustert" faellt rechnerisch ebenfalls auf `DEFECT`, erscheint aber nirgends:
 * `geraeteMitLeihstand` nimmt es aus der Liste, und `bucheAusleihe` lehnt es als nicht
 * freigegeben ab (`_db/leihen.ts`). Eine offene Leihe darauf bleibt rueckgebbar.
 *
 * ⛔ SIE LIEFERT NIE `ON_LOAN`, UND DAS STEHT IM TYP STATT NUR IN DIESEM SATZ. Der
 * Leihstand kommt aus der Tabelle `loans`; die Ueberlagerung baut A15 (`_db/leihen.ts`).
 * Der Rueckgabetyp ist deshalb `Exclude<GeraeteStatus, "ON_LOAN">`.
 * ⚠️ FUER A15 AENDERT DAS NICHTS: `hatLeihe ? "ON_LOAN" : geraeteZustandAus(...)` weitet
 * sich von selbst auf `GeraeteStatus`.
 *
 * ⛔ DIESE FUNKTION IST DER EINZIGE FALTUNGSORT DER AUSLEIHE. Sie steht hier und nicht in
 * `_db/leihen.ts`, weil A15, A16 UND A18 diese Datei lesen. Weil `GeraeteStatus` kein
 * `null` kennt, kann eine rohe Spalte konstruktiv nicht an ihr vorbeilaufen.
 *
 * `trim()`/`toLowerCase()` wie in `radio-admin/shared/src/loan.ts:19-28`: die Spalte ist
 * Freitext ohne `enum` (`_db/schema.ts:30`), und ohne Trimmen liefe ein „ Defekt" als
 * frei durch. `einsatzbereitschaftAus` trimmt genauso.
 */
export function geraeteZustandAus(
  rohStatus: string | null | undefined,
): Exclude<GeraeteStatus, "ON_LOAN"> {
  if (einsatzbereitschaftAus(rohStatus) === "einsatzbereit") return "AVAILABLE";
  // Gesperrt: nur noch die Wahl des Etiketts; ob es raus darf, entschied die Zeile davor.
  switch (rohStatus?.trim().toLowerCase()) {
    case "wartung":
      return "MAINTENANCE";
    default:
      return "DEFECT";
  }
}

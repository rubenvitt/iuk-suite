// src/app/m/radio/_ui/verwaltungIkonen.tsx
import { Icons8Ikone, type Icons8Name } from "@/core/ikonen/Icons8Ikone";

/*
 * DIE ZEICHENQUELLE DES VERWALTUNGSZWEIGS — Icons8 ueber `core/ikonen`, Bauform 1:1
 * nach `lagerbuch/_ui/ikonen.tsx` (bis 2026-09-30 Phosphor, `react-icons/pi`).
 * Angelegt am 2026-08-28: die Alt-Anwendung trug an ihren Verwaltungsknoepfen Zeichen
 * (`react-icons/fi`), der Nachbau trug keine.
 *
 * ⛔ DIES IST DIE ZWEITE ZEICHENQUELLE DES MODULS UND NICHT IHR ERSATZ. `_ui/ikonen.tsx`
 * bleibt UNBERUEHRT: Spec 1 §4.6.4 bindet die AUSLEIHflaeche woertlich auf Inline-SVG,
 * und Kapitel 4 bindet ueber jede Planzeile, die ihm widerspricht. Die Verwaltung ist
 * davon nicht erfasst — sie lief in der Alt-Anwendung mit einem Zeichenpaket. Zwei
 * Zweige, zwei Bediendichten, zwei Zeichenquellen; die Namen ueberschneiden sich
 * absichtlich nicht ueber die Zweiggrenze hinweg (`funk`, `haken`, `haken-kreis`, `lupe`
 * stehen in BEIDEN Unions, jede fuer ihren Zweig — ein Import ueber die Grenze waere ein
 * zweiter Zeichenstil auf einer Flaeche).
 *
 * ⛔ KEIN "use client". Diese Datei exportiert mit `ZEICHEN` einen WERT und mit
 * `VerwaltungsIkonName` einen TYP, und die Verwaltungsflaechen sind teils SERVER
 * Components. Eine Direktive hier machte aus Falle 7 die Falle 6: die Server Component
 * bekaeme eine Client-Referenz statt des Objekts, HTTP 200 mit leerer Map und still
 * falschem Bild — und Vitest kann das strukturell nicht sehen (`CLAUDE.md`, Fallen 6/7;
 * die zwei Ursachen sind GEGENLAEUFIG und werden nicht zusammengelegt).
 *
 * ⚠️ `Icons8Ikone` ist eine reine Funktion auf ein `<svg>` ohne Context und ohne
 * Direktive — sicher in Server Components wie in Client-Inseln. Falle 7
 * (`@ant-design/icons` wirft in RSC schon beim IMPORT) hat mit dem Paket die Suite
 * verlassen; `core/ikonen/ikonen.test.ts` verbietet jeden Icon-Paket-Import.
 *
 *
 * DIE UNION IST DIE AUTORITAET. Ein Name ohne Eintrag in `ZEICHEN` ist ein Typfehler,
 * kein stilles `undefined`; `verwaltungIkonen.test.tsx` prueft jeden literal benutzten
 * Namen unter `admin/` gegen sie.
 */

/**
 * Zwanzig Zeichen, in Klammern der Alt-Name aus `radio-admin/client/src/features/**`,
 * damit die Zuordnung nachschlagbar bleibt. Deutsche, umlautfreie Namen sind Hausform
 * (`lagerbuch/_ui/ikonen.tsx:45-53`).
 */
export type VerwaltungsIkonName =
  // ── Werkzeugleisten und Tabellen ─────────────────────────────────────────
  | "filter" // FiFilter
  | "herunterladen" // FiDownload
  | "plus" // FiPlus
  | "regler" // FiSliders
  | "spalten" // FiColumns
  | "papierkorb" // FiTrash2
  | "kopieren" // FiCopy
  | "schluessel" // FiKey
  | "hochladen" // FiUpload
  | "lupe" // die Suche der Verwaltungstabellen
  // ── Zustand und Meldung ──────────────────────────────────────────────────
  | "haken" // FiCheck
  | "haken-kreis" // FiCheckCircle
  | "warnung" // FiAlertTriangle
  | "frage" // FiHelpCircle
  // ── Fachzeichen und Navigation ───────────────────────────────────────────
  | "pfeil-oben" // FiArrowUp
  | "pfeil-unten" // FiArrowDown
  | "ziel" // FiTarget
  | "funk" // FiRadio
  | "drucken" // FiPrinter (Zugangs-Blatt)
  | "pfeil-links"; // der Zurueck-Weg der Unterseiten

/**
 * Ein Icons8-Zeichen je Name (`core/ikonen`, Satz „Windows 11 Outline").
 *
 * Die Schluessel rechts sind die des Katalogs `core/ikonen/katalog.ts`; ein Tippfehler
 * dort ist ein typecheck-Fehler, kein still leeres Zeichen.
 */
export const ZEICHEN: Record<VerwaltungsIkonName, Icons8Name> = {
  filter: "filter",
  herunterladen: "download",
  plus: "plus",
  regler: "sliders",
  spalten: "columns",
  papierkorb: "trash",
  kopieren: "copy",
  schluessel: "key",
  hochladen: "upload",
  lupe: "search",
  haken: "checkmark",
  "haken-kreis": "ok",
  warnung: "warning",
  frage: "help",
  "pfeil-oben": "arrow-up",
  "pfeil-unten": "arrow-down",
  ziel: "target",
  funk: "walkie-talkie",
  drucken: "print",
  "pfeil-links": "arrow-left",
};

/**
 * Ein Zeichen. `groesse` wirkt auf Breite UND Hoehe — ein Zeichen ist quadratisch.
 *
 * `V` wie Verwaltung: der kurze Name `Ikone` gehoert im selben Verzeichnis schon der
 * Ausleihflaeche, und zwei gleichnamige Komponenten mit verschiedenen Unions waeren die
 * Verwechslung, die kein Tor sieht.
 *
 * `aria-hidden`, `focusable="false"` und `flex: none` stehen HIER und nicht an den
 * Aufrufstellen (Bauform `lagerbuch/_ui/ikonen.tsx:116-118`): jedes Zeichen dieser Flaechen
 * steht neben der Beschriftung seines Knopfes, und eine Regel, die an jeder Aufrufstelle
 * wiederholt werden muss, wird an der naechsten vergessen.
 *
 * ⛔ 16 UND NICHT 18: die Verwaltung laeuft auf `SCHREIBTISCHDICHTE` (32/40,
 * `core/theme/theme.ts`). Ein 18er Zeichen in einem 32px-Knopf ist zu laut.
 * ⚠️ DER EINZIGE AUFRUFER MIT EINEM ANDEREN MASZ IST DIE KENNZAHLKARTE (`groesse={20}`,
 * `admin/(arbeit)/page.tsx`): dort steht das Zeichen NICHT in einem Knopf, sondern allein
 * in der Kopfzeile einer Karte, ueber einer gemessenen 24px-Zahl — 16 verschwaende dort.
 *
 * ⛔ KEIN `staerke`-Regler. Der Verwaltungszweig hat keinen Aufrufer dafuer (in `lagerbuch`
 * ist es allein der Helfer-Stepper), und ein Regler ohne Aufrufer ist ein zweites Aussehen
 * ohne Grund.
 *
 * `groesse` geht als Pixelzahl an `Icons8Ikone` und von dort an `width`/`height` des
 * `<svg>` — kein `size` an einem Bedienelement, Falle 4 ist nicht beruehrt.
 *
 *
 *
 */
export function VIkone({
  name,
  groesse = 16,
}: {
  name: VerwaltungsIkonName;
  groesse?: number;
}) {
  return (
    <Icons8Ikone
      name={ZEICHEN[name]}
      groesse={groesse}
      data-zeichen={name}
    />
  );
}

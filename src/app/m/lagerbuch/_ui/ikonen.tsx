/*
 * DIE EINE ZEICHENQUELLE DES MODULS — die Union ist die Autoritaet, die
 * Aufloesung liegt bei Icons8 (`core/ikonen`, Satz „Windows 11 Outline").
 *
 * Bis 2026-08-12 malte diese Datei 36 SVG-Pfade selbst, weil das Modul KEIN
 * fremdes Zeichenpaket haben durfte (Falle 7: @ant-design/icons ergibt in
 * einer Server Component HTTP 500 schon beim Import). Betreiberentscheidung
 * E1 kehrte das um (Phosphor, `react-icons/pi`); seit 2026-09-30 loest
 * Icons8 auf — reine SVG-Daten, kein Paket, kein Context, RSC-sicher.
 *
 * WAS SICH NICHT AENDERT UND SICH NICHT AENDERN DARF:
 *
 *  * KEIN "use client". Diese Datei exportiert den TYP `IkonName`, und der
 *    steht als DATENFELD in serialisierbaren Anzeigezeilen
 *    (`CheckErgebnisChip.zeichen`, `checks/ChecksTabelle.tsx:12`), die von
 *    Server Components gelesen werden. Wer hier "use client" ergaenzt, macht
 *    aus Falle 7 die Falle 6: HTTP 200 mit leerer Map und still falschem
 *    Bild. Genau das ist `core/shell/icons.ts` bis 2026-08-01 passiert.
 *  * DIE UNION BLEIBT DIE AUTORITAET. `ikonen.test.ts` prueft jeden literal
 *    benutzten Namen gegen sie. Wer ein Zeichen ergaenzt, ergaenzt HIER.
 *
 * WAS NEU IST: `data-zeichen`. Das Attribut traegt den Namen ins DOM, damit
 * Tests „an dieser Stelle steht das Warnzeichen" pruefen koennen, ohne an
 * SVG-Pfaddaten zu kleben. Die alten Tests verglichen `PFADE.warnung` gegen
 * ein `d`-Attribut; Icons8-Zeichen bestehen aus mehreren Pfaden, und ein
 * Paket-Update aenderte die Zusicherung still.
 *
 * WER MEHR ZEICHEN BRAUCHT, ALS DIE UNION FUEHRT, nimmt `Icons8Ikone` aus
 * `core/ikonen` direkt. Die Union ist nur dort Pflicht, wo ein Name ueber eine
 * Komponentengrenze wandert.
 */
import { Icons8Ikone, type Icons8Name } from "@/core/ikonen/Icons8Ikone";

/** 30 reine UI-Zeichen und 10 Fachzeichen. Reihenfolge wie Spec 6.5.2, dahinter Nachtraege. */
export type IkonName =
  // ── 30 reine UI-Zeichen ──────────────────────────────────────────────────
  | "pfeil-links" | "pfeil-rechts" | "chevron-rechts" | "chevron-links"
  | "plus" | "minus" | "kreuz" | "haken" | "stift" | "papierkorb" | "archiv"
  | "kopieren" | "herunterladen" | "hochladen" | "drucken" | "lupe" | "info"
  | "erneut" | "zuruecksetzen" | "verketten" | "entketten" | "tabelle" | "liste"
  | "scannen" | "qr" | "schluessel" | "taschenlampe" | "auf-ab"
  // DRK-299: Aufklappknopf der Inventurzeile.
  | "aufklappen" | "zuklappen"
  // ── 9 Fachzeichen (Spec 6.5.4) ───────────────────────────────────────────
  | "warnung" | "medizin" | "objekt" | "sauerstoff" | "akku" | "verfall"
  | "handlager-griff" | "fahrzeug"
  // DRK-309: die Tasche neben dem Fahrzeug — zwei Arten derselben Einheit,
  // und in der Liste stehen sie in DERSELBEN Spalte untereinander. Ein
  // Zeichen, das nur „irgendein Behaelter" meint, traegt dort nicht.
  | "tasche"
  // DRK-314: die Entnahmebox. KEIN geliehenes Zeichen — `archiv` (PiArchive)
  // meint das Stilllegen, `handlager-griff` (PiHandGrabbing) das Herausnehmen
  // AUS dem Regal, `tasche` (PiBagSimple) eine Einheit, die mitfaehrt. Die Box
  // ist keins davon: sie NIMMT AUF, und der Pfeil nach unten in die Schale ist
  // genau diese Bewegung.
  | "box";

/** Ein Icons8-Zeichen je Name. Loest `PFADE` ab. */
export const ZEICHEN: Record<IkonName, Icons8Name> = {
  // ── UI ───────────────────────────────────────────────────────────────────
  "pfeil-links": "arrow-left",
  "pfeil-rechts": "arrow-right",
  "chevron-rechts": "chevron-right",
  "chevron-links": "chevron-left",
  plus: "plus",
  minus: "minus",
  kreuz: "close",
  haken: "checkmark",
  stift: "pencil",
  papierkorb: "trash",
  archiv: "archive",
  kopieren: "copy",
  herunterladen: "download",
  hochladen: "upload",
  drucken: "print",
  lupe: "search",
  info: "info",
  erneut: "refresh",
  zuruecksetzen: "undo",
  verketten: "link",
  entketten: "broken-link",
  tabelle: "table",
  liste: "list",
  scannen: "barcode",
  qr: "qr-code",
  schluessel: "key",
  taschenlampe: "flashlight",
  "auf-ab": "sort",
  aufklappen: "chevron-down",
  zuklappen: "chevron-up",
  // ── Fachzeichen (Spec 6.5.4) ─────────────────────────────────────────────
  warnung: "warning",
  medizin: "heart-pulse",
  objekt: "package",
  sauerstoff: "wind",
  akku: "charging-battery",
  verfall: "calendar-expired",
  "handlager-griff": "grab",
  box: "inbox",
  fahrzeug: "truck",
  tasche: "bag",
};

/**
 * Kraeftige Zweitfassung fuer die Zeichen, die den `staerke`-Regler brauchen.
 *
 * NUR ZWEI EINTRAEGE, und das ist Absicht: heute ruft allein der Helfer-Stepper
 * mit `staerke > 2` (`Stepper.tsx:99,129`). Jeder weitere Eintrag waere ein
 * zweites Aussehen ohne Aufrufer — und die Regel des Moduls ist ein Aussehen
 * je Zeichen, solange nichts anderes belegt ist.
 */
const ZEICHEN_KRAEFTIG: ReadonlySet<IkonName> = new Set<IkonName>([
  "plus",
  "minus",
]);

/**
 * Alle Zeichen sind dekorativ. Ein Zeichen ohne sichtbaren Nachbartext wird
 * am Bedienelement benannt; der Scanner-Taschenlampenschalter traegt dort
 * zusaetzlich `aria-pressed`.
 *
 * `aria-hidden`, `focusable` und `flex:none` stehen HIER und nicht an den 52
 * Aufrufstellen (`Icons8Ikone` setzt sie), und eine Regel,
 * die an 52 Stellen wiederholt werden muss, wird an der 53. vergessen.
 *
 * ⚠️ `staerke` UEBERLEBT AUCH DIE ICONS8-UMSTELLUNG, als Kontur um die Fuellung.
 * Die Absicht stammt aus `5a3aa16` und bleibt gueltig: der Helfer-Stepper
 * (`Stepper.tsx:99,129`) zeichnet `minus`/`plus` kraeftiger, weil die 56px-Taste
 * nach dem Button-Reset (`helfer.module.css`) weder Rahmen noch Hintergrund
 * traegt — dann entscheidet das Zeichen selbst, wie deutlich die Flaeche steht.
 *
 * Die alten Pfade waren STRICHzeichnungen, dort war `strokeWidth` der Regler.
 * Icons8-Zeichen sind GEFUELLTE Umrisse, und Icons8 fuehrt fuer diesen Satz
 * keine Bold-Variante. Der Regler zieht deshalb ab `staerke > 2` eine Kontur
 * in Textfarbe um die Fuellung (`Icons8Ikone kraeftig`) — das Zeichen wird
 * sichtbar dicker, ohne einen zweiten Satz zu laden. Nur fuer die Namen in
 * `ZEICHEN_KRAEFTIG`.
 *
 * Die Tabelle fuehrt bewusst nur die zwei Zeichen, die den Regler heute
 * brauchen — nicht alle 38. Ein Name ohne Eintrag faellt auf sein
 * Normalgewicht zurueck: sichtbar unveraendert, nie ein Absturz.
 */
export function Ikone({
  name,
  groesse = 18,
  staerke = 2,
}: {
  name: IkonName;
  groesse?: number;
  staerke?: number;
}) {
  const kraeftig = staerke > 2 && ZEICHEN_KRAEFTIG.has(name);
  return (
    <Icons8Ikone
      name={ZEICHEN[name]}
      groesse={groesse}
      kraeftig={kraeftig}
      data-zeichen={name}
    />
  );
}

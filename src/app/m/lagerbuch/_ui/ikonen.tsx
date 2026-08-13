/*
 * DIE EINE ZEICHENQUELLE DES MODULS — die Union ist die Autoritaet, die
 * Aufloesung liegt bei Phosphor (react-icons/pi).
 *
 * Bis 2026-08-12 malte diese Datei 36 SVG-Pfade selbst, weil das Modul KEIN
 * fremdes Zeichenpaket haben durfte (Falle 7: @ant-design/icons ergibt in
 * einer Server Component HTTP 500 schon beim Import). Betreiberentscheidung
 * E1 kehrt das um; der Beleg, dass react-icons davon nicht betroffen ist,
 * steht in der Spec und wurde in Task 1 an einem echten Abruf gemessen.
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
 * ein `d`-Attribut; Phosphor-Zeichen bestehen aus mehreren Pfaden, und ein
 * Paket-Update aenderte die Zusicherung still.
 *
 * WER MEHR ZEICHEN BRAUCHT, ALS DIE UNION FUEHRT, importiert direkt aus
 * `react-icons/pi`. Die Union ist nur dort Pflicht, wo ein Name ueber eine
 * Komponentengrenze wandert.
 */
import type { IconType } from "react-icons/lib";
import {
  PiArchive, PiArrowCounterClockwise, PiArrowLeft, PiArrowRight,
  PiArrowsClockwise, PiBarcode, PiBatteryCharging, PiCalendarX,
  PiCaretLeft, PiCaretRight, PiCaretUpDown, PiCheck, PiCopy,
  PiDownloadSimple, PiFlashlight, PiHandGrabbing, PiHeartbeat, PiInfo,
  PiKey, PiLink, PiLinkBreak, PiList, PiMagnifyingGlass, PiMinus,
  PiMinusBold, PiPackage, PiPencilSimple, PiPlus, PiPlusBold, PiPrinter,
  PiQrCode, PiTable, PiTrash, PiTruck, PiUploadSimple, PiWarning,
  PiWind, PiX,
} from "react-icons/pi";

/** 28 reine UI-Zeichen und 8 Fachzeichen. Reihenfolge wie Spec 6.5.2. */
export type IkonName =
  // ── 28 reine UI-Zeichen ──────────────────────────────────────────────────
  | "pfeil-links" | "pfeil-rechts" | "chevron-rechts" | "chevron-links"
  | "plus" | "minus" | "kreuz" | "haken" | "stift" | "papierkorb" | "archiv"
  | "kopieren" | "herunterladen" | "hochladen" | "drucken" | "lupe" | "info"
  | "erneut" | "zuruecksetzen" | "verketten" | "entketten" | "tabelle" | "liste"
  | "scannen" | "qr" | "schluessel" | "taschenlampe" | "auf-ab"
  // ── 8 Fachzeichen (Spec 6.5.4) ───────────────────────────────────────────
  | "warnung" | "medizin" | "objekt" | "sauerstoff" | "akku" | "verfall"
  | "handlager-griff" | "fahrzeug";

/** Ein Phosphor-Zeichen je Name. Loest `PFADE` ab. */
export const ZEICHEN: Record<IkonName, IconType> = {
  // ── UI ───────────────────────────────────────────────────────────────────
  "pfeil-links": PiArrowLeft,
  "pfeil-rechts": PiArrowRight,
  "chevron-rechts": PiCaretRight,
  "chevron-links": PiCaretLeft,
  plus: PiPlus,
  minus: PiMinus,
  kreuz: PiX,
  haken: PiCheck,
  stift: PiPencilSimple,
  papierkorb: PiTrash,
  archiv: PiArchive,
  kopieren: PiCopy,
  herunterladen: PiDownloadSimple,
  hochladen: PiUploadSimple,
  drucken: PiPrinter,
  lupe: PiMagnifyingGlass,
  info: PiInfo,
  erneut: PiArrowsClockwise,
  zuruecksetzen: PiArrowCounterClockwise,
  verketten: PiLink,
  entketten: PiLinkBreak,
  tabelle: PiTable,
  liste: PiList,
  scannen: PiBarcode,
  qr: PiQrCode,
  schluessel: PiKey,
  taschenlampe: PiFlashlight,
  "auf-ab": PiCaretUpDown,
  // ── Fachzeichen (Spec 6.5.4) ─────────────────────────────────────────────
  warnung: PiWarning,
  medizin: PiHeartbeat,
  objekt: PiPackage,
  sauerstoff: PiWind,
  akku: PiBatteryCharging,
  verfall: PiCalendarX,
  "handlager-griff": PiHandGrabbing,
  fahrzeug: PiTruck,
};

/**
 * Kraeftige Zweitfassung fuer die Zeichen, die den `staerke`-Regler brauchen.
 *
 * NUR ZWEI EINTRAEGE, und das ist Absicht: heute ruft allein der Helfer-Stepper
 * mit `staerke > 2` (`Stepper.tsx:99,129`). Jeder weitere Eintrag waere ein
 * zweites Aussehen ohne Aufrufer — und die Regel des Moduls ist ein Aussehen
 * je Zeichen, solange nichts anderes belegt ist.
 */
const ZEICHEN_KRAEFTIG: Partial<Record<IkonName, IconType>> = {
  plus: PiPlusBold,
  minus: PiMinusBold,
};

/**
 * Alle Zeichen sind dekorativ. Ein Zeichen ohne sichtbaren Nachbartext wird
 * am Bedienelement benannt; der Scanner-Taschenlampenschalter traegt dort
 * zusaetzlich `aria-pressed`.
 *
 * `aria-hidden`, `focusable` und `flex:none` stehen HIER und nicht an den 52
 * Aufrufstellen: react-icons setzt keines davon von selbst, und eine Regel,
 * die an 52 Stellen wiederholt werden muss, wird an der 53. vergessen.
 *
 * ⚠️ `staerke` UEBERLEBT DIE PHOSPHOR-UMSTELLUNG, ABER NICHT ALS strokeWidth.
 * Die Absicht stammt aus `5a3aa16` und bleibt gueltig: der Helfer-Stepper
 * (`Stepper.tsx:99,129`) zeichnet `minus`/`plus` kraeftiger, weil die 56px-Taste
 * nach dem Button-Reset (`helfer.module.css`) weder Rahmen noch Hintergrund
 * traegt — dann entscheidet das Zeichen selbst, wie deutlich die Flaeche steht.
 *
 * Die alten Pfade waren STRICHzeichnungen, dort war `strokeWidth` der Regler.
 * Phosphor-Zeichen sind GEFUELLT (`strokeWidth: 0`), und ein `strokeWidth` an
 * ihnen ist wirkungslos — es haette den Regler still verschluckt und die Taste
 * waere duenner geworden, ohne dass ein Test es zeigt. Der Regler waehlt
 * deshalb jetzt das GEWICHT: ab `staerke > 2` die Bold-Variante, sofern
 * `ZEICHEN_KRAEFTIG` eine fuehrt.
 *
 * Die Tabelle fuehrt bewusst nur die zwei Zeichen, die den Regler heute
 * brauchen — nicht alle 36. Ein Name ohne Eintrag faellt auf sein
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
  const Zeichen = (staerke > 2 ? ZEICHEN_KRAEFTIG[name] : undefined) ?? ZEICHEN[name];
  return (
    <Zeichen
      size={groesse}
      aria-hidden
      focusable="false"
      data-zeichen={name}
      style={{ flex: "none" }}
    />
  );
}

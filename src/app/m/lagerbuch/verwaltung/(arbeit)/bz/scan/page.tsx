import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { BzScanner } from "./BzScanner";

export const dynamic = "force-dynamic";

/**
 * Die Seite trägt bewusst kein eigenes Icon: Der Scanner bringt seine Zeichen
 * aus dem gemeinsamen lokalen Icon-System mit. Der verschachtelte Scan-Pfad
 * wird in der Navigation nicht markiert, daher ist der `zurueck`-Weg im
 * Seitenkopf verbindlich.
 *
 * PRUEFLISTE PUNKT 2 IST HIER AUSGESETZT, MIT BEGRUENDUNG: `BzScanner`
 * reicht ausschließlich an denselben `BarcodeScanner` (`_ui/BarcodeScanner.tsx`)
 * weiter wie `/verwaltung/geraete/scan` — dessen Kopfkommentar nennt beide
 * Seiten ausdrücklich als die zwei einzigen Aufrufer ("Ihre zwei Aufrufer sind
 * `/verwaltung/geraete/scan` und `/verwaltung/bz/scan`") und begründet die
 * Kamera-Insel eigens für "jemanden in einer Fahrzeughalle". Die
 * Bedienelemente dort (Taschenlampen-Taste, manuelles Eingabefeld,
 * Suchen-Knopf) sind eigenes Markup aus `_ui/helfer.module.css`, nicht antd
 * mit `size`-Prop, und tragen durchgehend `min-height: 56px` — das
 * Suite-Handschuhmaß, nicht die 44px-Arbeitsdichte dieser sonst
 * tastaturbedienten Verwaltung. Diese Seite bleibt deshalb bewusst bei 56px
 * statt auf 44px umgestellt zu werden.
 */
export default function BzScanSeite() {
  return (
    <>
      <SeitenKopf
        titel="Gerät scannen"
        beschreibung="Barcode auf das Kamerabild halten — der Sprung ins Geräteblatt erfolgt automatisch."
        zurueck={{ titel: "BZ-Kontrolle", href: "/verwaltung/bz" }}
      />
      <BzScanner />
    </>
  );
}

import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { GeraetScanner } from "./GeraetScanner";

export const dynamic = "force-dynamic";

/**
 * Auch diese Elternseite bleibt icon-frei. Der verschachtelte Scan-Pfad wird
 * in der Navigation nicht markiert, daher ist der `zurueck`-Weg im Seitenkopf
 * verbindlich.
 *
 * PRUEFLISTE PUNKT 2 IST HIER AUSGESETZT, MIT BEGRUENDUNG: Diese Seite wird
 * im Fahrzeug/in der Fahrzeughalle benutzt, mit Handschuhen und der
 * Rückkamera des Telefons, nicht am Schreibtisch — `GeraetScanner`
 * (`_ui/BarcodeScanner.tsx`) sagt das im eigenen Kopfkommentar ausdrücklich
 * ("fuer jemanden in einer Fahrzeughalle"). Die Bedienelemente dort
 * (Taschenlampen-Taste, manuelles Eingabefeld, Suchen-Knopf) sind eigenes
 * Markup aus `_ui/helfer.module.css`, nicht antd mit `size`-Prop, und tragen
 * durchgehend `min-height: 56px` — das Suite-Handschuhmaß, nicht die
 * 44px-Arbeitsdichte dieser sonst tastaturbedienten Verwaltung. Diese Seite
 * bleibt deshalb bewusst bei 56px statt auf 44px umgestellt zu werden.
 */
export default function GeraetScanSeite() {
  return (
    <>
      <SeitenKopf
        titel="Gerät scannen"
        beschreibung="Barcode auf das Kamerabild halten — der Sprung ins Geräteblatt erfolgt automatisch."
        zurueck={{ titel: "Geräte", href: "/verwaltung/geraete" }}
      />
      <GeraetScanner />
    </>
  );
}

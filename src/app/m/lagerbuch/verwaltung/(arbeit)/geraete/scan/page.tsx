import { Brotkrume } from "../../../../_ui/Brotkrume";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { GeraetScanner } from "./GeraetScanner";

export const dynamic = "force-dynamic";

/**
 * Auch diese Elternseite bleibt icon-frei. Der verschachtelte Scan-Pfad wird
 * in der Navigation nicht markiert, daher ist die Rück-Brotkrume verbindlich.
 */
export default function GeraetScanSeite() {
  return (
    <>
      <Brotkrume href="/verwaltung/geraete">Geräte</Brotkrume>
      <SeitenKopf
        titel="Gerät scannen"
        beschreibung="Barcode auf das Kamerabild halten — der Sprung ins Geräteblatt erfolgt automatisch."
      />
      <GeraetScanner />
    </>
  );
}

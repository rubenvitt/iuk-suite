import { Brotkrume } from "../../../../_ui/Brotkrume";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { BzScanner } from "./BzScanner";

export const dynamic = "force-dynamic";

/**
 * Die Seite trägt bewusst kein eigenes Icon: Der Scanner bringt seine Zeichen
 * aus dem gemeinsamen lokalen Icon-System mit. Die Brotkrume ersetzt zugleich
 * die fehlende Navigationsmarkierung für den verschachtelten Scan-Pfad.
 */
export default function BzScanSeite() {
  return (
    <>
      <Brotkrume href="/verwaltung/bz">BZ-Kontrolle</Brotkrume>
      <SeitenKopf
        titel="Gerät scannen"
        beschreibung="Barcode auf das Kamerabild halten — der Sprung ins Geräteblatt erfolgt automatisch."
      />
      <BzScanner />
    </>
  );
}

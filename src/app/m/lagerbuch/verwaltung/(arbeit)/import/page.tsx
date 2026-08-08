import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";

export default function ImportSeite() {
  return (
    <>
      <SeitenKopf
        titel="CSV-Import"
        beschreibung="Spalten: Name · Einheit · Fach · Mindestbestand · Startbestand. Trennzeichen Komma oder Semikolon; die Kopfzeile ist optional. Ein Startbestand über 0 wird als Korrektur-Buchung „CSV-Startbestand“ im Journal erfasst."
      />
      <ImportForm />
    </>
  );
}

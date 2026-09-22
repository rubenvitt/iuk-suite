import { auth } from "@/core/auth";
import { launcherEintraege } from "@/core/shell/launcherEintraege";
import { leseAnsprechpartner } from "@/app/m/portal/_lib/einstellungen";
import { DiensteRaster } from "@/app/m/portal/_ui/DiensteRaster";
import { RueckmeldungKarte } from "@/app/m/portal/_ui/RueckmeldungKarte";
import { rueckmeldungUrl } from "@/core/rueckmeldung/konfiguration";
import { Seitenkopf } from "@/core/shell/Seitenkopf";

/**
 * Server Component: sie löst Sitzung, Liste und Ansprechpartner auf und
 * übergibt fertige Daten. Icons und Suchzustand gehören in die Client-Insel
 * darunter — `@ant-design/icons` hier wäre HTTP 500 schon beim Import.
 *
 * Die Kachel-Typografie und die beiden Klassen (`portal-kachel-link`,
 * `portal-kachel`) sind mit dem Markup nach `DiensteRaster` gewandert, nicht
 * verlorengegangen: `e2e/portal.spec.ts` misst die Kachelkante über genau
 * diese Klassen, und die Kaskade dahinter besitzt kein Quelltext-Scan.
 *
 * `Seitenkopf` direkt aus `@/core/shell/Seitenkopf` (Durchgang Aufgabe 13,
 * kein modul-eigener Adapter): diese Seite ist die Startseite der Suite und
 * trug bislang gar keine Überschrift — `DiensteRaster` begann direkt mit dem
 * Suchfeld. Kein `zurueck`: das Portal IST die Wurzel, ein Rückweg auf sich
 * selbst wäre eine Schleife (dieselbe Begründung wie bei `feedback`s
 * Einstiegsseite).
 */
export default async function PortalPage() {
  const session = await auth();
  const [eintraege, ansprechpartner] = await Promise.all([
    launcherEintraege(session?.user?.groups ?? null),
    leseAnsprechpartner(),
  ]);
  /*
   * ⚠️ DIE KACHEL STEHT AUSSERHALB VON `DiensteRaster`, UND ZWAR ABSICHTLICH.
   * Drinnen wäre sie ein Eintrag der Suche und verschwände beim Tippen — und
   * sie stünde nicht da, wenn für jemanden noch gar nichts freigeschaltet ist
   * (`DiensteRaster` steigt in diesem Fall vor dem Raster mit einem `Result`
   * aus). Genau dann ist der Weg, etwas zu melden, am wichtigsten.
   *
   * `rueckmeldungUrl()` liefert `null`, solange die Adresse nicht eingerichtet
   * ist; dann steht hier nichts. Der Aufruf liegt HIER und nicht in der Kachel,
   * weil diese Seite die Server Component ist und `process.env` im
   * Client-Bundle nicht existiert.
   */
  const rueckmeldung = rueckmeldungUrl();
  return (
    <>
      <Seitenkopf titel="Apps & Dienste" />
      <DiensteRaster eintraege={eintraege} ansprechpartner={ansprechpartner} />
      {rueckmeldung && <RueckmeldungKarte url={rueckmeldung} />}
    </>
  );
}

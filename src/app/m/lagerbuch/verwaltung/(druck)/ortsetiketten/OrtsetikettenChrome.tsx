"use client";

/*
 * DAS BILDSCHIRM-CHROME DER ORTSKARTEN (DRK-312, Bogenformat seit DRK-388).
 *
 * Dieselbe Bauform und dieselben Gruende wie `etiketten/EtikettenChrome.tsx`:
 * das `(druck)`-Layout laesst die Suite-Shell weg (FullShell druckte Kopfzeile
 * und App-Switcher mit, und sein `minHeight:100vh` erzeugte leere Folgeseiten),
 * der Rahmen fehlt also nur am BILDSCHIRM — und genau dort setzt diese Insel an.
 *
 * JEDES AEUSSERE ELEMENT TRAEGT `lb-nichtDrucken`. Das ist hier nicht bloss
 * Kosmetik wie am A4-Bogen, sondern TRAGEND: Chromium verwirft die
 * CSS-Seitengroesse vollstaendig, sobald ein Dokument gemischte Seitengroessen
 * ergibt. Bliebe das Chrome im Druck stehen, stuende es auf einer
 * VORGABE-grossen Seite neben den Kartenbogen — und die kaemen ebenfalls im
 * Vorgabeformat heraus, mit einem Raster, das dann auf nichts mehr passt.
 * Gemessen ist beides: mit `display: none` kommen alle Seiten mit 210 x 297 mm,
 * gemischt kommt Letter.
 *
 * WARUM EINE CLIENT-INSEL: `page.tsx` ist eine Server Component und traegt
 * bewusst KEIN antd und KEIN Zeichen (Fallen 1 und 7). Der Druckknopf braucht
 * ausserdem `window.print()`.
 */
import { Button, Flex } from "antd";
import Link from "next/link";
import { SPACE } from "@/core/theme/tokens";
import { Ikone } from "../../../_ui/ikonen";
import {
  ORT_JE_BLATT, ORT_KARTE_BREITE_MM, ORT_KARTE_HOEHE_MM,
} from "../../../_lib/ortEtikettMasse";

export function OrtsetikettenChrome({
  basis,
  neueCodes,
}: {
  basis: string;
  /**
   * WIE VIELE ORTSCODES BEIM OEFFNEN DIESER SEITE NEU ENTSTANDEN SIND — DRK-406.
   *
   * ⚠️ PFLICHT-PROP, KEIN OPTIONAL. Ein vergessenes `neueCodes?` waere still
   * `undefined`, der Satz verschwaende wortlos, und die Seite schriebe
   * ungefragt Datenbankzeilen, ohne es zu sagen. Genau das soll sie nicht.
   */
  neueCodes: number;
}) {
  return (
    <div className="lb-nichtDrucken" data-testid="lb-ort-chrome">
      <Link href="/verwaltung">
        {/* 6 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32) — enger Abstand
            zwischen Zeichen und Text, kein Skalenwert ohne sichtbaren Sprung. */}
        <Flex align="center" gap={6}>
          <Ikone name="pfeil-links" groesse={15} />
          Zurück zur Verwaltung
        </Flex>
      </Link>

      <Flex align="center" justify="space-between" gap={SPACE.md} style={{ marginBlock: SPACE.md }}>
        <div>
          <h1 style={{ margin: 0 }}>Ortsetiketten</h1>
          {/*
            §8.1, 8-B: `moduleUrl` nimmt `prodHostsFor(mod)[0]`. Eine
            Umsortierung von SUITE_HOST_LAGERBUCH aendert STILL jedes ab dann
            gedruckte Etikett, waehrend die alten weiter auf den frueheren
            ersten Eintrag zeigen. Diese Zeile ist der einzige Weg, den Fehler
            VOR dem Papier zu bemerken — und bei einer laminierten Karte am
            Fahrzeug ist „danach" teuer.
          */}
          <p data-testid="lb-ort-basis" style={{ margin: 0 }}>
            Alle QR-Codes zeigen auf {basis}
          </p>
          {/*
            ⚠️ DER SATZ STEHT NUR DA, WENN ES ETWAS ZU SAGEN GIBT. Null ist der
            Normalfall — ein dauerhaftes „0 Codes neu erzeugt" waere Rauschen an
            der Stelle, an der sonst die Formatansage steht, und genau die muss
            jemand vor dem Druck lesen.

            ⚠️ ER NENNT DIE FOLGE, NICHT NUR DIE ZAHL: neue Codes heisst neue
            Karten, und wer das nicht liest, klebt die alte wieder an.

            ⚠️ „ORT" UND NICHT „EINHEIT", auch im Singular. Der eine fehlende
            Code ist haeufig der des HANDLAGERS — und der ist keine Einheit,
            sondern das Lager (`standortMeta` gibt dort „Lager"). „Für eine
            Einheit" schickte die Suche dann auf die Fahrzeugliste.
          */}
          {neueCodes > 0 && (
            <p data-testid="lb-ort-neu" style={{ margin: 0, fontWeight: 600 }}>
              {neueCodes === 1
                ? "Für einen Ort ist gerade ein neuer Zugangs-Code entstanden."
                : `Für ${neueCodes} Orte sind gerade neue Zugangs-Codes entstanden.`}
              {" "}Diese Karten musst du ausdrucken und anbringen.
            </p>
          )}
          {/*
            DIE FORMATANSAGE STEHT AM BILDSCHIRM, nicht nur im Stylesheet. Der
            Druckdialog uebernimmt Groesse UND Rand aus dem Dokument; wer den
            Rand im Dialog groesser stellt, bekommt vier Karten je Blatt statt
            acht — und sieht erst am Papier, dass er selbst der Grund war.
          */}
          <p data-testid="lb-ort-format" style={{ margin: 0 }}>
            {ORT_JE_BLATT} Karten je A4-Blatt, je {ORT_KARTE_BREITE_MM} ×{" "}
            {ORT_KARTE_HOEHE_MM} mm zum Ausschneiden. Im Druckdialog Seitengröße
            und Ränder aus dem Dokument übernehmen.
          </p>
        </div>
        <Button type="primary" onClick={() => window.print()} icon={<Ikone name="drucken" groesse={16} />}>
          Drucken
        </Button>
      </Flex>
    </div>
  );
}

import { requireLagerbuchAdmin } from "../../_lib/zugang";
import { kontoZugangAus } from "../../_lib/helferZugang";
import { sitzungsEtikett } from "../../_lib/zugangHerkunft";
import { boxOrt, einraeumPosten } from "../../_lib/lesepfade/entnahmebox";
import { zugangsZiele } from "../../_lib/lesepfade/orte";
import { ENTNAHMEBOX_NAME } from "../../_lib/konstanten";
import { getDb } from "../../_db/client";
import { AuffuellRahmen } from "../../_ui/AuffuellRahmen";
import { BoxEinraeumen } from "../../_ui/BoxEinraeumen";
import { LeerZustand } from "../../_ui/LeerZustand";

/**
 * AUS DER ENTNAHMEBOX EINRAEUMEN — DRK-381, die zweite Haelfte von DRK-313.
 *
 * ⚠️ WARUM DIESE ROUTE EIN STATISCHES SEGMENT NEBEN `[artikelId]` SEIN DARF.
 * Next.js laesst ein statisches Segment gegen ein dynamisches gewinnen, also
 * beschattet `/auffuellen/box` jeden Artikel mit der Id `box`. Es KANN keinen
 * geben: `newId()` ist nanoid mit 21 Zeichen (`_db/schema.ts`), und drei
 * Buchstaben sind darin nicht darstellbar. Dieselbe Eigenschaft, auf der in
 * `_ui/Auffuellen.tsx` der Wert `NEUE_CHARGE` ruht — und sie steht hier noch
 * einmal, weil ein Leser sonst zu Recht stutzt.
 *
 * ⚠️ DER RIEGEL STEHT HIER, OBWOHL `auffuellen/layout.tsx` IHN TRAEGT — aus
 * demselben Grund wie in den beiden Nachbarseiten: ein Layout kann einer Seite
 * keine Props reichen, und das Kopf-Etikett kommt aus dem Viewer, den dieser
 * Aufruf zurueckgibt. Er ist billig (`auth()` ist innerhalb einer Anfrage
 * gecacht). Die tragende Zusage ist ohnehin der Riegel der ACTION
 * (`raeumeAusEntnahmebox`): eine Action-Id ist global, ohne ihn dort waere
 * jedes Layout wirkungslos.
 *
 * ⚠️ DREI ZUSTAENDE, UND SIE SIND VERSCHIEDENE AUSKUENFTE — dieselbe
 * Unterscheidung wie auf dem Helferschirm (`helfer/box/page.tsx`):
 *
 *   Box fehlt   → „es gibt sie nicht" (jemand hat die Zeile geloescht)
 *   Box leer    → „es liegt nichts drin"
 *   sonst       → die Liste
 *
 * Mit einer leeren Liste zu antworten, wo die Kiste fehlt, hiesse zu
 * behaupten, sie sei leer.
 *
 * ⚠️ EINE STILLGELEGTE BOX IST KEIN AUSSCHLUSS, anders als beim Ablegen. Eine
 * Kiste, die nichts mehr aufnimmt, muss man erst recht ausraeumen koennen —
 * sonst strandet alles, was beim Stilllegen darin lag. Die Action prueft `aktiv`
 * aus demselben Grund NICHT.
 */
export const dynamic = "force-dynamic";

export default async function EinraeumenSeite() {
  const viewer = await requireLagerbuchAdmin();
  const db = getDb();
  const etikett = sitzungsEtikett(kontoZugangAus(viewer));

  const box = boxOrt(db);
  if (box === null) {
    return (
      <AuffuellRahmen etikett={etikett}>
        <LeerZustand
          titel={`Keine ${ENTNAHMEBOX_NAME}`}
          text={
            "Die Kiste entsteht normalerweise beim Start der Anwendung. Fehlt sie, " +
            "wurde sie gelöscht oder umbenannt — bitte an die Betreiberin wenden."
          }
          weg={{ href: "/auffuellen", text: "Zum Auffüllen" }}
        />
      </AuffuellRahmen>
    );
  }

  /*
   * ⚠️ `einraeumPosten` UND NICHT `boxInhalt`: derselbe Inhalt, plus Fach und
   * Stilllegung je Artikel. Warum die beiden Felder nicht in `BoxPosten`
   * stehen, steht am Typ — kurz: `helfer/box` reicht `BoxPosten` unveraendert
   * an seine Insel weiter und sichert dort zu, dass nichts Ueberzaehliges im
   * RSC-Payload liegt.
   */
  const posten = einraeumPosten(db);
  if (posten.length === 0) {
    return (
      <AuffuellRahmen etikett={etikett}>
        <LeerZustand
          titel={`${box.name} ist leer`}
          text={
            "Hier steht, was aus einem Fahrzeug oder einer Tasche genommen und noch " +
            "nicht wieder eingeräumt wurde. Steht nichts da, ist alles einsortiert."
          }
          weg={{ href: "/auffuellen", text: "Zum Auffüllen" }}
        />
      </AuffuellRahmen>
    );
  }

  return (
    <AuffuellRahmen etikett={etikett}>
      <BoxEinraeumen
        boxName={box.name}
        posten={posten}
        /*
         * DIE WAEHLBAREN SCHRAENKE WERDEN BEI JEDEM AUFRUF NEU AUFGELOEST,
         * nicht einmal gemerkt: die Verwaltung kann in der Zwischenzeit einen
         * Schrank stilllegen. Die Action prueft dieselbe Liste noch einmal —
         * die Seite zeigt damit nichts an, was die Buchung danach verwirft.
         *
         * ⚠️ DIESELBE FUNKTION WIE IN `auffuellen/[artikelId]`, und das ist der
         * Punkt: zwei Flaechen, die Material ins Handlager buchen, muessen
         * dieselben Orte anbieten. Die Begruendung, warum das nicht
         * `handlagerSchraenke` ist, steht an `zugangsZiele`.
         */
        ziele={zugangsZiele(db)}
      />
    </AuffuellRahmen>
  );
}

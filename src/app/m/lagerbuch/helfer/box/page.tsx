import { requireHelferSitzung } from "../../_lib/helferZugang";
import { sitzungsEtikett } from "../../_lib/zugangHerkunft";
import { fahrzeugListe } from "../../_lib/lesepfade/fahrzeuge";
import { boxOrt, postenAmOrt } from "../../_lib/lesepfade/entnahmebox";
import { ENTNAHMEBOX_NAME, inDerEinheit } from "../../_lib/konstanten";
import { bucheInEntnahmebox } from "../../_actions/entnahmebox";
import { getDb } from "../../_db/client";
import { HelferRahmen } from "../../_ui/HelferRahmen";
import { FahrzeugWahl } from "../../_ui/FahrzeugWahl";
import { BoxAbgabe } from "../../_ui/BoxAbgabe";
import { LeerZustand } from "../../_ui/LeerZustand";

/**
 * „IN DIE BOX LEGEN" — DER DRITTE HELFERSCHIRM, DRK-314.
 *
 * ERST WAEHLEN, DANN LADEN — dieselbe Struktur und dieselbe Begruendung wie
 * `helfer/check/page.tsx`: ohne die Wahl im PFAD laege der Bestand JEDER Einheit
 * im RSC-Payload, auf einem privaten Telefon in einer Sitzung ohne Konto
 * (§3.4.5). Bei zehn Einheiten ist das eine Zehntelung.
 *
 * ⚠️ HOST- UND SITZUNGSRIEGEL: `requireHelferSitzung` ruft
 * `requireLagerbuchHost` INTERN als erste Anweisung (Global Constraint 24) — er
 * wird hier NICHT noch einmal gerufen. Dass diese Seite den Riegel ueberhaupt
 * selbst ruft, obwohl `helfer/layout.tsx` ihn traegt, hat denselben Grund wie
 * bei den Nachbarseiten: ein Layout kann einer Seite keine Props reichen, und
 * `sitzungsetikett` und `laeuftAb` kommen von dort.
 *
 * ⚠️ DIE KAERTCHEN-BINDUNG GILT HIER GENAUSO WIE IM CHECK (DRK-302). Wer ein
 * Fahrzeug-Kaertchen eingeloest hat, raeumt DIESES Fahrzeug aus; ein `?fz=` auf
 * ein anderes zaehlt nicht. Das ist eine ANZEIGE-Entscheidung und kein Riegel —
 * dieselbe Abgrenzung wie dort, und sie im Vorbeigehen zu verschaerfen hiesse,
 * die offene Betreiberfrage 5 zu beantworten.
 *
 * ⚠️ WAS AN DER `.map()`-ZEILE UNTEN HAENGT: `fahrzeugListe` fuehrt mehr Felder,
 * als die Wahl zeigt. Weil Arrays kovariant sind und die Ueberschuss-Pruefung
 * nur auf frischen Objektliteralen greift, kompilierte ein Durchreichen OHNE die
 * `.map()` sauber — `typecheck` und `build` saehen nichts, und die
 * Verwaltungsfelder landeten still im Payload.
 */
export const dynamic = "force-dynamic";

export default async function BoxSeite({
  searchParams,
}: {
  searchParams: Promise<{ fz?: string }>;
}) {
  const { fz } = await searchParams;
  const db = getDb();
  const zugang = await requireHelferSitzung(db);
  const etikett = sitzungsEtikett(zugang);

  /*
   * ⚠️ DIE BOX WIRD VOR DER EINHEIT GEPRUEFT, und die Reihenfolge ist die
   * Aussage: fehlt die Kiste, ist die Wahl einer Einheit sinnlos — man waehlte
   * eine Quelle fuer einen Vorgang, den die Action danach ablehnt. Migration
   * 0011 legt die Zeile an; `null` heisst hier „jemand hat sie geloescht oder
   * umbenannt", und dann gehoert das gesagt statt gezeigt.
   */
  const box = boxOrt(db);
  if (box === null || !box.aktiv) {
    return (
      <HelferRahmen aktiv="box" sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
        <LeerZustand
          titel={box === null ? `Keine ${ENTNAHMEBOX_NAME}` : `${box.name} ist stillgelegt`}
          text={"Die Verwaltung muss die Entnahmebox einrichten, bevor hier etwas "
              + "abgelegt werden kann. Bis dahin bitte nichts aus der Einheit nehmen, "
              + "ohne es zu melden."}
          weg={{ href: "/helfer", text: "Zur Entnahme" }}
        />
      </HelferRahmen>
    );
  }

  // NUR AKTIVE: eine stillgelegte Einheit anzubieten hiesse, einen Weg zu
  // zeigen, den niemand am Regal gehen soll. Die Action laesst sie ausdruecklich
  // zu — ausraeumen darf man sie, aber aus der Verwaltung heraus.
  const fahrzeuge = fahrzeugListe(db).filter((f) => f.aktiv);

  const gebunden = zugang.fahrzeugBindung
    ? fahrzeuge.find((f) => f.id === zugang.fahrzeugBindung)
    : undefined;

  // Genau EINE aktive Einheit → keine Wahl anbieten. KEIN `redirect()`: das
  // spart eine Anfrage und schreibt keinen Pfad, den jemand verwechseln
  // koennte. Ein `?fz=` auf eine unbekannte oder stillgelegte Zeile faellt hier
  // still durch auf die Wahl.
  const gewaehlt =
    gebunden ??
    (fz ? fahrzeuge.find((f) => f.id === fz) : undefined) ??
    (fahrzeuge.length === 1 ? fahrzeuge[0] : null);

  if (fahrzeuge.length === 0) {
    return (
      <HelferRahmen aktiv="box" sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
        <LeerZustand
          // NEUTRAL, weil hier ueber ALLE Einheiten gesprochen wird und es keine
          // gibt — es gibt also auch keine Art zu nennen (DRK-309).
          titel="Keine Einheit angelegt"
          text={"Die Verwaltung muss zuerst ein Fahrzeug oder eine Tasche pflegen. "
              + "Bis dahin gibt es hier nichts auszuräumen."}
          weg={{ href: "/helfer", text: "Zur Entnahme" }}
        />
      </HelferRahmen>
    );
  }

  if (!gewaehlt) {
    return (
      <HelferRahmen aktiv="box" sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
        <FahrzeugWahl
          pfad="/helfer/box"
          fahrzeuge={fahrzeuge.map((f) => ({
            id: f.id, name: f.name, kennung: f.kennung, einheitenart: f.einheitenart,
          }))}
        />
      </HelferRahmen>
    );
  }

  // ERST JETZT laden — und nur fuer diese EINE Einheit.
  //
  // ⚠️ UEBER DEN BESTAND, NICHT UEBER DAS SOLL. Was herausgenommen wird, ist
  // haeufig genau das, was NICHT im Soll steht — „jemand hat zu viel drauf
  // gelegt" ist der Anlass des Tickets. Eine Liste aus `sollFuerFahrzeug`
  // zeigte den Ueberschuss nur dann, wenn er zufaellig auch im Soll steht.
  const posten = postenAmOrt(db, gewaehlt.id);

  if (posten.length === 0) {
    /*
     * ⚠️ „ANDERE EINHEIT" NUR, WENN ES EINE ANDERE GIBT (Codex-Review zu
     * PR #175). Der Weg hier ist die EINZIGE Handlung auf einem Schirm, der
     * sonst nichts anbietet — er darf nicht im Kreis fuehren. `/helfer/box`
     * waehlt oben aber genau dieselbe Einheit erneut, sobald eine der beiden
     * Bedingungen gilt:
     *
     *   `gebunden`             — das Kaertchen zeigt auf DIESE Einheit und
     *                            gewinnt gegen jedes `?fz=` (DRK-302).
     *   genau EINE aktive      — die Wahl wird uebersprungen.
     *
     * In beiden Faellen landete die Helferin auf demselben leeren Schirm, und
     * zwar ohne dass etwas kaputt aussieht: der Link funktioniert, er tut nur
     * nichts. Dann fuehrt der Weg stattdessen nach draussen — derselbe
     * Rueckweg wie in den beiden Leerzustaenden darueber.
     *
     * ⚠️ NICHT DIE BINDUNG LOCKERN: sie ist eine Anzeige-Entscheidung, kein
     * Riegel, aber sie im Vorbeigehen zu umgehen hiesse, die offene
     * Betreiberfrage 5 zu beantworten. Geaendert wird der WEG, nicht die Wahl.
     */
    const andereEinheitErreichbar = gebunden === undefined && fahrzeuge.length > 1;

    return (
      <HelferRahmen aktiv="box" sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
        <LeerZustand
          titel={`Nichts ${inDerEinheit(gewaehlt.einheitenart)} gebucht`}
          text={"Hier steht, was das Lagerbuch dieser Einheit zuschreibt. Steht nichts "
              + "da, lässt sich auch nichts abgeben — bitte der Verwaltung melden."}
          weg={andereEinheitErreichbar
            ? { href: "/helfer/box", text: "Andere Einheit" }
            : { href: "/helfer", text: "Zur Entnahme" }}
        />
      </HelferRahmen>
    );
  }

  return (
    <HelferRahmen aktiv="box" sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
      <BoxAbgabe
        einheit={{
          id: gewaehlt.id, name: gewaehlt.name, kennung: gewaehlt.kennung,
          einheitenart: gewaehlt.einheitenart,
        }}
        posten={posten}
        buchen={bucheInEntnahmebox}
        // DRK-305: faellt der Zugang mitten im Ausraeumen aus, entscheidet diese
        // Angabe den Rueckweg. Der Server kann die Herkunft dann nicht mehr
        // unterscheiden — diese Seite kennt sie.
        kontoZugang={zugang.herkunft === "konto"}
      />
    </HelferRahmen>
  );
}

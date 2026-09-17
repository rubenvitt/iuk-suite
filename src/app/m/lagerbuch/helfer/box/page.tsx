import { redirect } from "next/navigation";
import { bereichsAbweisung, darf, startPfad } from "../../_lib/helferBereich";
import { requireHelferSitzung } from "../../_lib/helferZugang";
import { sitzungsEtikett } from "../../_lib/zugangHerkunft";
import { fahrzeugListe } from "../../_lib/lesepfade/fahrzeuge";
import { boxOrt, postenAmOrt } from "../../_lib/lesepfade/entnahmebox";
import { ENTNAHMEBOX_NAME, inDerEinheit } from "../../_lib/konstanten";
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

  /*
   * DER REGAL-CODE KOMMT HIER NICHT HEREIN — DRK-406, seit DRK-417 jeder Code
   * ohne den Bereich „box".
   *
   * ⚠️ `redirect` UND NICHT `notFound`: die Seite EXISTIERT, sie ist fuer
   * diesen Zugang nur nicht gedacht. Eine 404 behauptete, es gebe sie nicht,
   * und schickte jemanden am Regal auf die Suche nach einem Tippfehler.
   *
   * ⚠️ ER STEHT DIREKT HINTER DEM SITZUNGSRIEGEL, vor jedem Lesepfad. Weiter
   * unten haette die Seite den Bestand einer Einheit bereits geladen und in den
   * RSC-Payload gelegt — auf ein privates Telefon, fuer einen Zugang, der ihn
   * nicht bekommen soll (§3.4.5).
   *
   * ⚠️ UND DAS IST ANZEIGE, KEIN RIEGEL. Die Durchsetzung steht in der Action,
   * die DIESELBE Funktion ruft; ohne sie waere dieser Redirect mit einem
   * selbstgebauten POST zu umgehen.
   *
   * ⚠️ DIE BEDINGUNG GEHT UEBER `bereichsAbweisung` UND NICHT UEBER
   * `zugang.reichweite` DIREKT, obwohl das hier kuerzer waere. Der Grund ist
   * der Protokolleintrag: die Funktion schreibt das `access_denied` mit dem
   * Akteur des Zugangs. Ein direkter Feldzugriff liesse die Umleitung STILL —
   * und still ist sie genau in dem Fall falsch, fuer den es sie gibt: jemand
   * tippt die Adresse, weil die Reiterleiste sie nicht anbietet.
   *
   * ⚠️ DAS ZIEL IST NICHT MEHR FEST `/helfer` (DRK-417). Es gibt jetzt Codes
   * OHNE Entnahme — die Karte an einer Einheit ist einer —, und fuer sie war
   * die Artikelliste eine Umleitung auf den naechsten Redirect. `startPfad`
   * gibt denselben Schirm, auf dem dieser Code auch nach dem Scan landet.
   */
  if (bereichsAbweisung(zugang, "box")) {
    redirect(startPfad(zugang.reichweite, zugang.fahrzeugBindung));
  }
  const etikett = sitzungsEtikett(zugang);

  /*
   * DER RUECKWEG AUS EINEM LEERZUSTAND — DRK-417.
   *
   * ⚠️ „Zur Entnahme" STAND HIER FEST, UND DAS IST SEIT DIESEM TICKET EIN
   * KREIS: die Karte an der Entnahmebox darf `/helfer` nicht oeffnen — sie
   * landet dort auf der Umleitung, die sie hierher zurueckschickt. Der Link
   * funktioniert, er tut nur nichts; dieselbe Sorte Weg, gegen die der
   * `andereEinheitErreichbar`-Block weiter unten geschrieben ist. Genau in
   * einem Leerzustand ist er die EINZIGE Handlung auf dem Schirm.
   *
   * ⚠️ DAS GATE IST DER RICHTIGE AUSGANG, nicht der Check: den darf eine
   * Box-Karte ebenso wenig, ein Ausweichen dorthin waere derselbe Kreis eine
   * Tuer weiter. Und es ist kein Notbehelf, sondern der Weg, den die
   * Betreiberentscheidung vom 17.09.2026 vorsieht — ein Scan ersetzt die
   * laufende Sitzung, und wer hier nichts zu tun hat, scannt die Karte an dem
   * Ort, an dem er etwas zu tun hat. Das Gate leitet eine gueltige
   * Kaertchen-Sitzung ausdruecklich NICHT weiter (`page.tsx`), der Weg ist
   * also schleifenfrei.
   */
  const rueckweg = darf(zugang.reichweite, "entnahme")
    ? { href: "/helfer", text: "Zur Entnahme" }
    : { href: "/", text: "Andere Karte scannen" };

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
      <HelferRahmen aktiv="box" reichweite={zugang.reichweite} sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
        <LeerZustand
          titel={box === null ? `Keine ${ENTNAHMEBOX_NAME}` : `${box.name} ist stillgelegt`}
          text={"Die Verwaltung muss die Entnahmebox einrichten, bevor hier etwas "
              + "abgelegt werden kann. Bis dahin bitte nichts aus der Einheit nehmen, "
              + "ohne es zu melden."}
          weg={rueckweg}
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
      <HelferRahmen aktiv="box" reichweite={zugang.reichweite} sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
        <LeerZustand
          // NEUTRAL, weil hier ueber ALLE Einheiten gesprochen wird und es keine
          // gibt — es gibt also auch keine Art zu nennen (DRK-309).
          titel="Keine Einheit angelegt"
          text={"Die Verwaltung muss zuerst ein Fahrzeug oder eine Tasche pflegen. "
              + "Bis dahin gibt es hier nichts auszuräumen."}
          weg={rueckweg}
        />
      </HelferRahmen>
    );
  }

  if (!gewaehlt) {
    return (
      <HelferRahmen aktiv="box" reichweite={zugang.reichweite} sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
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

  /*
   * ⚠️ „ANDERE EINHEIT" NUR, WENN ES EINE ANDERE GIBT (Codex-Review zu PR #175,
   * zwei Runden). Der Weg ist die EINZIGE Navigation dieses Schirms — im
   * Leerzustand die einzige Handlung ueberhaupt, in der gefuellten Ansicht der
   * einzige Ausgang neben der Reiterleiste. Er darf nicht im Kreis fuehren.
   * `/helfer/box` waehlt oben aber genau dieselbe Einheit erneut, sobald eine
   * der beiden Bedingungen gilt:
     *
     *   `gebunden`             — das Kaertchen zeigt auf DIESE Einheit und
     *                            gewinnt gegen jedes `?fz=` (DRK-302).
     *   genau EINE aktive      — die Wahl wird uebersprungen.
     *
   * In beiden Faellen landete die Helferin auf demselben Schirm, und zwar ohne
   * dass etwas kaputt aussieht: der Link funktioniert, er tut nur nichts. Dann
   * fuehrt der Weg stattdessen nach draussen — derselbe Rueckweg wie in den
   * beiden Leerzustaenden oben.
   *
   * ⚠️ EINE ENTSCHEIDUNG FUER BEIDE AUSGAENGE, und deshalb steht sie hier und
   * nicht in einem der beiden Zweige: der Leerzustand und die Insel stellen
   * dieselbe Frage, und zwei Rechnungen dafuer liefen beim naechsten Griff
   * auseinander — die zweite Codex-Runde fand genau das, weil die erste nur
   * den Leerzustand geheilt hatte.
   *
   * ⚠️ NICHT DIE BINDUNG LOCKERN: sie ist eine Anzeige-Entscheidung, kein
   * Riegel, aber sie im Vorbeigehen zu umgehen hiesse, die offene
   * Betreiberfrage 5 zu beantworten. Geaendert wird der WEG, nicht die Wahl.
   */
  const andereEinheitErreichbar = gebunden === undefined && fahrzeuge.length > 1;

  if (posten.length === 0) {
    return (
      <HelferRahmen aktiv="box" reichweite={zugang.reichweite} sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
        <LeerZustand
          titel={`Nichts ${inDerEinheit(gewaehlt.einheitenart)} gebucht`}
          text={"Hier steht, was das Lagerbuch dieser Einheit zuschreibt. Steht nichts "
              + "da, lässt sich auch nichts abgeben — bitte der Verwaltung melden."}
          /*
           * ⚠️ DER ZWEITE ZWEIG IST `rueckweg`, NICHT FEST `/helfer` — Codex-
           * Befund P2 zu PR #205. Fuer eine Box-Karte ist die Artikelliste eine
           * Umleitung hierher zurueck; im Leerzustand ist dieser Link die
           * einzige Handlung auf dem Schirm, und ein Kreis ist dort das Ende
           * des Weges.
           */
          weg={andereEinheitErreichbar
            ? { href: "/helfer/box", text: "Andere Einheit" }
            : rueckweg}
        />
      </HelferRahmen>
    );
  }

  return (
    <HelferRahmen aktiv="box" reichweite={zugang.reichweite} sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
      <BoxAbgabe
        einheit={{
          id: gewaehlt.id, name: gewaehlt.name, kennung: gewaehlt.kennung,
          einheitenart: gewaehlt.einheitenart,
        }}
        posten={posten}
        // ⚠️ KEIN `buchen`-PROP MEHR (DRK-375): `_ui/BoxAbgabe.tsx` importiert
        // `bucheInEntnahmebox` selbst — Falle 9.
        andereEinheitErreichbar={andereEinheitErreichbar}
        /*
         * ⚠️ DER AUSWEG WIRD HEREINGEREICHT, NICHT IN DER INSEL GERECHNET —
         * Codex-Befund P2 zu PR #205. Sie baute ihn aus
         * `andereEinheitErreichbar` allein und landete damit fuer jede
         * begrenzte Karte auf `/helfer`, also im Kreis. Die REICHWEITE kennt
         * nur der Server; eine zweite Rechnung in der Insel waere die Naht, an
         * der die beiden Ausgaenge dieses Schirms auseinanderlaufen — dieselbe
         * Begruendung, aus der `andereEinheitErreichbar` schon hier oben steht
         * und nicht dort.
         */
        rueckweg={rueckweg}
        // DRK-305: faellt der Zugang mitten im Ausraeumen aus, entscheidet diese
        // Angabe den Rueckweg. Der Server kann die Herkunft dann nicht mehr
        // unterscheiden — diese Seite kennt sie.
        kontoZugang={zugang.herkunft === "konto"}
      />
    </HelferRahmen>
  );
}

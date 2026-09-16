import { Alert, Col, Row } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { getDb, type DB } from "../../../_db/client";
import { ENTNAHMEBOX_NAME } from "../../../_lib/konstanten";
import {
  boxInhalt, boxOrt, letzteBoxZugaenge, postenAmOrt,
} from "../../../_lib/lesepfade/entnahmebox";
import { fahrzeugListe } from "../../../_lib/lesepfade/fahrzeuge";
import { fmtDatumZeit } from "../../../_lib/zeit";
import { Kachel } from "../../../_ui/Kachel";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { BoxAnsicht, type ZugangZeile } from "./BoxAnsicht";

/**
 * DIE ENTNAHMEBOX IN DER VERWALTUNG — DRK-314.
 *
 * Zwei Fragen, und die Seite beantwortet sie in dieser Reihenfolge, weil man
 * sie in dieser Reihenfolge stellt: **was liegt in der Kiste?** und **woher kam
 * es?** Das Ablegen selbst passiert am Fahrzeug — dafuer gibt es den Reiter
 * „Box" im Helfer-Ast —, aber es steht hier trotzdem: wer die Kiste
 * durchsieht, findet regelmaessig etwas, das noch niemand gebucht hat.
 *
 * ⚠️ KEIN COMPOUND-ZUGRIFF AUF antd IN DIESER DATEI (Falle 1). `Card`, `Row`,
 * `Col`, `Alert` und `Result` sind sicher; `Typography.Title` und `Form.Item`
 * ergaeben HTTP 500 fuer die ganze Seite, und weder `build` noch Vitest sehen
 * es. Die Abschnittsueberschrift steht deshalb in der Insel.
 *
 * ⚠️ KEINE SPALTE UND KEIN `render` IN DIESER DATEI (Falle 9): antds `Table`
 * ist selbst eine Client-Komponente, und eine hier entstandene
 * `render`-Funktion liesse sich nicht ueber die RSC-Grenze reichen. Alles
 * Tabellarische lebt in `BoxAnsicht.tsx`.
 *
 * ⚠️ UND KEIN `Date` AN DIE INSEL. `letzteBoxZugaenge` liefert `Date`; diese
 * Seite formatiert sie mit `fmtDatumZeit` (zonenexplizit) und reicht
 * Zeichenketten weiter. Ein `Date` ueberquert die Grenze klaglos und
 * formatiert danach in der Zone des GERAETS — auf einem Rechner mit falsch
 * gestellter Zone stuende der Zeitpunkt still daneben.
 */
export const dynamic = "force-dynamic";

/**
 * Als benannte Funktion, damit `page.test.tsx` sie mit einer Test-Datenbank
 * rendern kann, ohne `getDb()` zu treffen — dieselbe Bauform wie
 * `lagerorteSeitenInhalt` und `fahrzeugInhalt`.
 */
export function entnahmeboxInhalt(db: DB, von: string | undefined, jetzt: Date) {
  const box = boxOrt(db);

  if (box === null) {
    return (
      <>
        <SeitenKopf
          titel={ENTNAHMEBOX_NAME}
          beschreibung="Die Kiste in der Halle, in die Material aus Fahrzeugen und Taschen kommt."
        />
        {/*
          ⚠️ `type="warning"` UND NICHT `"error"` (Falle 3): in diesem Theme ist
          `colorError === colorPrimary === #c8000f`, ein Fehler-Alert sieht also
          aus wie eine Primaeraktion.

          Der Satz nennt den HANDGRIFF, nicht die Ursache: dass die Zeile
          `entnahmebox` in `lagerorte` fehlt, hilft niemandem weiter.
        */}
        <Alert
          type="warning"
          showIcon={false}
          title="Die Entnahmebox ist nicht eingerichtet."
          description={
            "Sie entsteht normalerweise beim Start der Anwendung. Fehlt sie, wurde sie "
            + "gelöscht oder umbenannt — bitte an die Betreiberin wenden. Bis dahin lässt "
            + "sich nichts abgeben."
          }
        />
      </>
    );
  }

  /*
   * ⚠️ ALLE EINHEITEN, AUCH DIE STILLGELEGTEN — anders als auf dem
   * Helferschirm daneben, und das ist kein Widerspruch, sondern dieselbe
   * Festlegung wie beim Aussondern: eine stillgelegte Einheit ist genau die,
   * die man ausraeumt. Die Helferflaeche bietet sie nicht an, weil dort niemand
   * eine ausserdienstliche Einheit sucht; hier ist das Ausraeumen der Anlass.
   * Die Auswahl markiert sie.
   */
  const einheiten = fahrzeugListe(db).map((f) => ({
    id: f.id, name: f.name, kennung: f.kennung,
    einheitenart: f.einheitenart, aktiv: f.aktiv,
  }));
  const gewaehlt = von ? einheiten.find((e) => e.id === von) : undefined;
  /*
   * ERST WAEHLEN, DANN LADEN: ohne Wahl kein Bestand im Payload.
   *
   * ⚠️ UND GAR NICHTS, WENN DIE BOX STILLGELEGT IST (Codex-Review zu PR #175).
   * Die Abgabe verschwindet in dem Fall; ihren Bestand trotzdem zu laden waere
   * Arbeit fuer eine Flaeche, die nicht rendert — und der Payload traege ihn
   * mit.
   */
  const quellPosten = gewaehlt && box.aktiv ? postenAmOrt(db, gewaehlt.id, jetzt) : [];

  const inhalt = boxInhalt(db, jetzt);
  const zugaenge: ZugangZeile[] = letzteBoxZugaenge(db).map((z) => ({
    buchungId: z.buchungId,
    zeit: fmtDatumZeit(z.ts),
    artikelName: z.artikelName,
    menge: z.menge,
    einheit: z.einheit,
    herkunft: z.herkunft,
    wer: z.wer,
  }));

  /*
   * ⚠️ ZWEI KACHELN, UND SIE ZAEHLEN VERSCHIEDENES. „Posten" sind ARTIKEL mit
   * Bestand — das ist die Zahl, die sagt, wie viele Entscheidungen beim
   * Einraeumen anstehen. „Teile" ist die Summe der Mengen und sagt, wie voll die
   * Kiste ist. Eine Zahl allein beantwortete jeweils die andere Frage falsch:
   * fünf Artikel zu je einem Stück sind fünf Handgriffe, ein Artikel zu fünfzig
   * Stück ist einer.
   *
   * KEIN TON an den Kacheln: eine volle Kiste ist kein Alarm, sondern Arbeit.
   * Rot traegt in diesem Modul fachliche Bedeutung (Verfall) und gehoert nicht
   * auf eine Datenflaeche, die nur zaehlt.
   */
  const teile = inhalt.reduce((summe, p) => summe + p.menge, 0);

  return (
    <>
      <SeitenKopf
        titel={box.name}
        beschreibung={
          "Was hier liegt, wurde aus einem Fahrzeug oder einer Tasche genommen und ist "
          + "noch nicht wieder eingeräumt. Es zählt weder zur Einheit noch zum Handlager."
        }
      />

      {!box.aktiv && (
        <div style={{ marginBlockEnd: SPACE.md }}>
          <Alert
            type="warning"
            showIcon={false}
            title="Die Entnahmebox ist stillgelegt und nimmt nichts mehr auf."
            description="Was bereits darin liegt, steht unverändert unten."
          />
        </div>
      )}

      <Row gutter={[SPACE.md, SPACE.md]} style={{ marginBlockEnd: SPACE.xl }}>
        <Col xs={24} md={12}>
          <Kachel zahl={inhalt.length} beschriftung="Artikel in der Box" />
        </Col>
        <Col xs={24} md={12}>
          <Kachel zahl={teile} beschriftung="Teile insgesamt" />
        </Col>
      </Row>

      <BoxAnsicht
        boxName={box.name}
        // Stillgelegt ⇒ keine Abgabe. Der Hinweis dazu steht oben; der INHALT
        // bleibt sichtbar, denn ausraeumen soll man die Kiste weiterhin.
        nimmtAuf={box.aktiv}
        einheiten={einheiten}
        gewaehltId={gewaehlt?.id ?? ""}
        quellPosten={quellPosten}
        inhalt={inhalt}
        zugaenge={zugaenge}
      />
    </>
  );
}

export default async function EntnahmeboxSeite({
  searchParams,
}: {
  searchParams: Promise<{ von?: string }>;
}) {
  const { von } = await searchParams;
  return entnahmeboxInhalt(getDb(), von, new Date());
}

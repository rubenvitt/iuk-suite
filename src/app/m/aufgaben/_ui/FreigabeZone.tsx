"use client";

import { useActionState, useState } from "react";
import { Button, Input, Modal } from "antd";
import { freigebenAction, zurueckweisenAction } from "../actions";
import type { FreigabeZeile } from "../_db/queries";
import { NACHWEIS_ART_TEXT } from "../_lib/anzeige";
import { FORM_START, feldFehler, feldWert } from "../_lib/formState";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { AufgabenZeile } from "./AufgabenZeile";
import { Ikone } from "./ikonen";
import { NachweisBild } from "./NachweisBild";
import s from "./aufgaben.module.css";

/*
 * DIE FREIGABEZONE — GETEILT ZWISCHEN `/freigaben` UND `EinstiegAuftrag.tsx`s EIGENER
 * WARTESCHLANGE (Aufgabe 15, Spec §8.3, §8.4), DIESELBE FORM WIE `VerteilenDialog.tsx`s
 * `VerteilenTabelle` (dort begruendet: EINE Client-Insel fuer die adressierbare Route UND den
 * Einstieg, statt sie zweimal zu bauen). `_db/queries.ts`s `freigabeDaten(db, person, heute)` ist
 * die EINE Ladefunktion fuer beide Aufrufer — dieselbe Lehre wie `verteilDaten` (Aufgabe 14,
 * Fix-Runde 1: zwei separate Ladebloecke liefen bei der naechsten Aenderung auseinander, ohne dass
 * ein Test es sah).
 *
 * KEINE `<Table>` HIER, ANDERS ALS `VerteilenDialog.tsx`/`PersonenTabelle.tsx`/`RoutinenTabelle.tsx`
 * — eine Tabellenzeile ist fuer Spaltenwerte gebaut, nicht fuer einen mehrzeiligen Nachweistext.
 * Diese Datei rendert deshalb eine eigene Kartenliste; `<Table columns={[{render: fn}]}>` waere
 * ohnehin nur AUSSERHALB einer Server Component erlaubt (Falle 3), und diese Datei traegt bereits
 * `"use client"`.
 *
 * DER NACHWEIS GEHOERT SICHTBAR DAZU (Brief, Spec §8.4: „wer freigibt, muss sehen, was er
 * freigibt"). DIE NAHT FUER AUFGABE 19: `NachweisEintrag` unten unterscheidet `art === "text"`
 * (heute anzeigbar) von `art === "bild"` (heute strukturell erreichbar, aber ohne Auslieferung —
 * Aufgabe 17-19 bauen `core/av/scanner.ts`, die Ablage-Warteschlange und die Auslieferung erst
 * noch). Aufgabe 19 haengt dort NUR den Bildteil ein, sie tauscht keine Struktur aus.
 *
 * „ZURUECKWEISEN" IST BESTAETIGUNGSPFLICHTIG UND VERLANGT TEXT (Spec §8.4, §9.9) — ANDERS ALS
 * `PersonenTabelle.tsx`s „Beenden" (Popconfirm reicht dort, weil kein Feld noetig ist) TRAEGT DIESE
 * AKTION EIN PFLICHTFELD: ein `Popconfirm` kann keine Begruendung entgegennehmen. Der Klick auf
 * „Zurueckweisen" oeffnet deshalb — Vorbild `VerteilenDialog.tsx`s `VerteilenModal` — einen `Modal`
 * mit der Begruendung als `Input.TextArea` UND den beiden Knoepfen „Zurueckweisen“/„Abbrechen": der
 * zweite, deliberate Klick TRAEGT die Bestaetigung, der Text ist Pflicht (die Action lehnt seit
 * Aufgabe 10 ohne ihn ab — Feldfehler, kein Wurf, s. `zurueckweisenAction`s Kopfkommentar).
 *
 * „FREIGEBEN" BRAUCHT KEINE BESTAETIGUNG (Spec §9.9 nennt nur Zurueckziehen/Zurueckweisen/Person
 * deaktivieren) UND KEIN `useActionState` — dieselbe Form wie `RoutinenTabelle.tsx`s
 * `routineRuhenAction`: ein natives `<form action={freigebenAction}>` mit einem einzigen versteckten
 * Feld.
 *
 * `FreigabeAktionen` IST EXPORTIERT (Aufgabe 16) — die Knopfzeile (Freigeben/Zurückweisen) samt
 * Bestaetigungsdialog, OHNE Titel/Chips/Meta/Nachweis drumherum. `a/[id]/page.tsx`s
 * `_ui/AktionsZone.tsx` haengt sie dort ein, WEIL die Detailseite Titel, Chips, Metablock und
 * Nachweisbereich bereits selbst als eigene Abschnitte zeigt (Spec §8.4) — eine eingebettete volle
 * `FreigabeKarte` verlinkte dort auf sich selbst und wiederholte, was schon auf derselben Seite
 * steht. `FreigabeKarte` unten ruft `FreigabeAktionen` fuer genau dieselbe Logik — KEINE zweite
 * Fassung von „Freigeben"/„Zurückweisen bestaetigungspflichtig", nur ein zweiter Aufrufer.
 */
export function FreigabeAktionen({
  aufgabe,
  primaer = true,
}: {
  aufgabe: FreigabeZeile["aufgabe"];
  /**
   * OB „FREIGEBEN" DER PRIMAERKNOPF IST (Oberflaechen-Spec 2026-08-16 §7 Nr. 2) — VORGABE `true`,
   * und die Vorgabe ist die tragende Haelfte: `/freigaben`, die Freigabe-Zone und die
   * Fuehrungskarte behalten damit ihre heutige Form, ohne dass eine von ihnen den Schalter kennen
   * muss. Nur `_ui/AktionsZone.tsx` setzt ihn auf `false`, naemlich dann, wenn auf `/a/<id>` schon
   * ein hoeher stehender Eintrag der Vorrangliste den einen Primaerknopf besetzt.
   */
  primaer?: boolean;
}) {
  const [zurueckweisenOffen, setZurueckweisenOffen] = useState(false);

  return (
    <>
      <div className={s.knopfzeile}>
        <form action={freigebenAction}>
          <input type="hidden" name="aufgabeId" value={aufgabe.id} />
          <Button
            type={primaer ? "primary" : undefined}
            htmlType="submit"
            data-testid={`freigeben-${aufgabe.id}`}
          >
            Freigeben
          </Button>
        </form>
        <Button
          onClick={() => setZurueckweisenOffen(true)}
          data-testid={`zurueckweisen-${aufgabe.id}`}
        >
          Zurückweisen
        </Button>
      </div>

      {zurueckweisenOffen ? (
        <ZurueckweisenModal aufgabe={aufgabe} onClose={() => setZurueckweisenOffen(false)} />
      ) : null}
    </>
  );
}

export interface FreigabeZoneProps {
  meine: FreigabeZeile[];
  vertretung: FreigabeZeile[];
  heute: string;
}

/*
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ══ DIE ZONE FOLGT SEIT DER ZWEITEN OBERFLAECHEN-RUNDE (2026-08-16) DEM ZEILENRASTER DES MODULS
 *    — UND SIE IST DIE ZWEITE FLAECHE, AUF DER ES SICH ANDERS AUSPRAEGT.
 *
 *    WAS HIER STAND: zwei fette `<h3>` („Meine" / „In Vertretung", 14/600 gerade), darunter eine
 *    Kartenliste aus verschachtelten Flex-Spalten mit Inline-`style`. Der Titel war ein roter
 *    Link, die Metazeile ein Fliesstext mit vier durch `·` getrennten Angaben, und darunter zwei
 *    dauerhaft sichtbare Knoepfe. Nichts fluchtete mit irgendetwas, und keine der vier anderen
 *    Flaechen sah so aus.
 *
 *    WARUM NICHT EINFACH `AufgabenListe` MIT `aktionen`: der Nachweis. Er ist mehrzeiliger Text
 *    (kuenftig ein Bild) und passt in keine Rasterzelle — der Kopfkommentar oben sagt dasselbe
 *    schon ueber die Tabellenzelle. Ein Absatz in der Meta-Spur zoege die Zeile auf und riss die
 *    Ausrichtung aller anderen Zeilen mit.
 *
 *    DIE AUSPRAEGUNG IST DESHALB „KOPFZEILE IM RASTER, NACHWEIS ALS BAND": die Kopfzeile (Titel ·
 *    Zustand · Prioritaet · Frist · Dauer · „Erledigt von X") steht in den drei Spuren von
 *    `.zeilenListe` und fluchtet mit jeder anderen Zeile des Moduls; Nachweis und Entscheidung
 *    stehen als volle Breite DARUNTER, eingerueckt an einer Haarlinie (`AufgabenZeile`s neue
 *    `band`-Prop, `.zeilenBand` im Stylesheet).
 *
 *    DIE LESERICHTUNG IST DAMIT DIE DER ENTSCHEIDUNG: WAS (Kopfzeile) → WOMIT BELEGT (Nachweis) →
 *    WAS TUE ICH (die zwei Knoepfe). Genau die Reihenfolge, die Spec §8.4 verlangt („wer freigibt,
 *    muss sehen, was er freigibt").
 *
 * ══ „FREIGEBEN"/„ZURUECKWEISEN" BLEIBEN ECHTE KNOEPFE UND STEHEN DAUERHAFT — SIE WANDERN
 *    AUSDRUECKLICH NICHT IN DIE HOVER-AKTIONSSPUR. Zwei Gruende, beide fachlich:
 *
 *      1. Sie sind der ZWECK dieser Seite, nicht eine Nebenhandlung an einer Zeile. Eine Aktion,
 *         die man erst durch Zuwendung findet, ist richtig fuer „anders zuweisen" in einer
 *         Uebersicht und falsch fuer die einzige Handlung, derentwegen die Seite aufgerufen wird.
 *      2. Bestaetigung skaliert mit dem Schaden (Spec §9.9): „Zurueckweisen" ist
 *         bestaetigungspflichtig UND verlangt eine Begruendung — es traegt deshalb weiterhin den
 *         `Modal`, den ein `Popconfirm` nicht ersetzen kann (kein Feld). Ein stiller Zeilenknopf
 *         waere fuer eine Aktion mit dieser Folge die falsche Lautstaerke.
 *
 *    SIE STEHEN IM BAND UND NICHT IN DER 150px-AKTIONSSPUR, weil sie dort nicht hineinpassen
 *    (zwei Knoepfe mit 44px Hoehe brauchen rund 250px) und weil sie erst NACH dem Nachweis gelesen
 *    werden sollen. Die Aktionsspur bleibt fuer diese Zeilen leer — die Spur selbst bleibt
 *    reserviert und haelt damit die Kopfzeilen aller Zeilen in Flucht.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export function FreigabeZone({ meine, vertretung, heute }: FreigabeZoneProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xl }}>
      <FreigabeAbschnitt
        titel="Meine"
        zeilen={meine}
        heute={heute}
        leerText="Keine Freigabe offen"
      />
      <FreigabeAbschnitt
        titel="In Vertretung"
        zeilen={vertretung}
        heute={heute}
        leerText="Keine Freigabe in Vertretung offen"
      />
    </div>
  );
}

/**
 * EIN ABSCHNITT DER ZONE — MIT ZURUECKGENOMMENEM VERSALIEN-KICKER STATT EINER FETTEN UEBERSCHRIFT
 * (Oberflaechen-Runde 2026-08-16, Befund 4, hier nachgezogen): „Meine" stand in 14/600 gerade ueber
 * Zeilen, deren Titel ebenfalls 14/600 tragen — die Gliederung war damit genauso laut wie ihr
 * Inhalt und von ihm nicht zu unterscheiden. `SCHRIFT.kicker` ist eine Rolle der Leiter (12/600
 * versal), keine erfundene Groesse; Farbe und Haarlinie kommen aus `.zonenKopf`, derselben Klasse
 * wie auf allen vier anderen Flaechen.
 *
 * DIE ZAHL STEHT IM KOPF, WIE BEI JEDER ZONE DES MODULS: sie ist die Antwort auf „wie viel liegt
 * hier" und stand auf dieser Seite bisher nur summiert in der Kontextzeile.
 *
 * `<h2>` STATT `<h3>`: der `SeitenKopf` traegt das einzige `<h1>`, und zwischen ihm und diesen
 * Abschnitten liegt keine Ebene — ein `<h3>` liesse eine Stufe der Gliederung aus.
 */
function FreigabeAbschnitt({
  titel,
  zeilen,
  heute,
  leerText,
}: {
  titel: string;
  zeilen: FreigabeZeile[];
  heute: string;
  leerText: string;
}) {
  return (
    <section>
      <h2 className={s.zonenKopf} style={{ ...SCHRIFT.kicker, margin: `0 0 ${SPACE.sm}px` }}>
        {titel} ({zeilen.length})
      </h2>
      {zeilen.length === 0 ? (
        <p>{leerText}</p>
      ) : (
        <ul className={s.zeilenListe}>
          {zeilen.map((zeile) => (
            <AufgabenZeile
              key={zeile.aufgabe.id}
              aufgabe={zeile.aufgabe}
              heute={heute}
              /*
               * GENAU EINE ZUSATZANGABE (§3.6) — UND ES IST DIE, DIE DIE ENTSCHEIDUNG BETRIFFT:
               * WER die Aufgabe erledigt hat. Der Ersteller und die Nachweispflicht standen
               * bisher in derselben Fliesstextzeile; sie stehen jetzt im Band, wo sie zum
               * Nachweis gehoeren. Die Dauer nennt `AufgabenZeile` ohnehin.
               */
              rollenZusatz={`Erledigt von ${zeile.zugewiesenName}`}
              band={<FreigabeBand zeile={zeile} />}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * DAS BAND UNTER DER KOPFZEILE — Herkunft, Nachweis, Entscheidung, in dieser Reihenfolge.
 *
 * DIE HERKUNFTSZEILE IST KUERZER ALS DER FRUEHERE FLIESSTEXT, WEIL DIE KOPFZEILE ZWEI IHRER VIER
 * ANGABEN SCHON TRAEGT: „Erledigt von X" ist der Rollenzusatz, die Dauer eine Metazelle. Uebrig
 * bleiben Ersteller und Nachweispflicht — und die gehoeren an den Nachweis, nicht an den Titel.
 */
function FreigabeBand({ zeile }: { zeile: FreigabeZeile }) {
  const { aufgabe } = zeile;
  return (
    <>
      <div>
        {/*
         * KEINE EIGENE UEBERSCHRIFT UEBER DIESER ZEILE — im Bildschirmabzug stand „Nachweis"
         * ZWEIMAL untereinander: einmal hier und einmal aus `NachweisBlock`, der seine eigene
         * fuehrt. Die Herkunftszeile ist kein Nachweis, sie ist der Rahmen darum; sie steht
         * deshalb ohne Kicker davor, und `NachweisBlock` behaelt seinen.
         */}
        <p style={{ ...SCHRIFT.neben, margin: `0 0 ${SPACE.sm}px` }}>
          Erstellt von {zeile.erstellerName} · Nachweispflicht:{" "}
          {aufgabe.nachweisPflicht ? `Ja (${NACHWEIS_ART_TEXT[aufgabe.nachweisArt]})` : "Nein"}
        </p>
        <NachweisBlock aufgabeId={aufgabe.id} nachweise={zeile.nachweise} />
      </div>
      <FreigabeAktionen aufgabe={aufgabe} />
    </>
  );
}

/**
 * `art === "bild"` HAENGT SEIT AUFGABE 19 AN `NachweisBild` (`./NachweisBild.tsx`) — derselben
 * Komponente wie `a/[id]/page.tsx`s Nachweisbereich, „keine zweite Fassung" der Bedingung „nur
 * sauber zeigt". Diese Funktion trifft selbst KEINE Entscheidung ueber Sichtbarkeit: `freigegeben`
 * kommt bereits fertig berechnet aus `_db/queries.ts`s `mitDatei`.
 */
function NachweisBlock({
  aufgabeId,
  nachweise,
}: {
  aufgabeId: string;
  nachweise: FreigabeZeile["nachweise"];
}) {
  return (
    <div>
      {/*
       * `.zeilenBandKopf` STATT DER DREI INLINE-WERTE (Oberflaechen-Runde 2026-08-16, zweite
       * Haelfte): dieselbe Groesse und dasselbe Gewicht wie vorher, aber gedaempft in `--auf-stahl`
       * und aus dem Stylesheet — der Kicker eines Bandes ist eine Rolle, die es jetzt mehr als
       * einmal geben kann, und ein Inline-Wert schluege jede Regel, die spaeter dazukommt.
       */}
      <p className={s.zeilenBandKopf} style={{ marginBlockEnd: SPACE.xs }}>
        Nachweis
      </p>
      {nachweise.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12 }}>Kein Nachweis hinterlegt.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          {nachweise.map(({ nachweis: n, datei, freigegeben }) => (
            <li key={n.id} style={{ display: "flex", alignItems: "flex-start", gap: SPACE.xs }}>
              {n.art === "text" ? (
                <>
                  <Ikone name="nachweis-text" />
                  <span style={{ fontSize: 12 }}>{n.text}</span>
                </>
              ) : (
                <NachweisBild
                  aufgabeId={aufgabeId}
                  nachweisId={n.id}
                  datei={datei}
                  freigegeben={freigegeben}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ZurueckweisenModal({
  aufgabe,
  onClose,
}: {
  aufgabe: FreigabeZeile["aufgabe"];
  onClose: () => void;
}) {
  const [state, formAction, isPending] = useActionState(zurueckweisenAction, FORM_START);
  const begruendungFehler = feldFehler(state, "begruendung");

  return (
    <Modal open onCancel={onClose} footer={null} title={`„${aufgabe.titel}“ zurückweisen`}>
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
        <input type="hidden" name="aufgabeId" value={feldWert(state, "aufgabeId", aufgabe.id)} />

        <div>
          <label htmlFor="fz-begruendung" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
            Begründung
          </label>
          <Input.TextArea
            id="fz-begruendung"
            name="begruendung"
            autoSize={{ minRows: 3, maxRows: 8 }}
            defaultValue={feldWert(state, "begruendung", "")}
            status={begruendungFehler ? "error" : undefined}
            aria-invalid={begruendungFehler ? true : undefined}
            aria-describedby={begruendungFehler ? "fz-begruendung-err" : undefined}
          />
          {begruendungFehler ? (
            <p id="fz-begruendung-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
              {begruendungFehler}
            </p>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: SPACE.sm }}>
          <Button
            danger
            htmlType="submit"
            loading={isPending}
            disabled={isPending}
            style={{ alignSelf: "flex-start" }}
          >
            Zurückweisen
          </Button>
          <Button
            onClick={onClose}
            disabled={isPending}
            style={{ alignSelf: "flex-start" }}
            data-testid="zurueckweisen-abbrechen"
          >
            Abbrechen
          </Button>
        </div>
      </form>
    </Modal>
  );
}

"use client";

/**
 * DER CHECKLISTEN-BOGEN — Bedienleiste am Bildschirm, Blaetter auf Papier.
 *
 * WARUM DAS BLATT IM CLIENT ENTSTEHT UND NICHT ALS RSC-KIND HEREINGEREICHT
 * WIRD: die beiden Schalter (Dichte, Blindzaehlung) veraendern das Blatt
 * SELBST, nicht nur seinen Rahmen. Fuer die Dichte reichte eine Klasse am
 * Umschlag — die Blindzaehlung aber darf die Sollmenge nicht bloss verdecken,
 * sondern muss sie ungerendert lassen (Begruendung im Kopf des `lb-cl-`-Blocks
 * in `druck.css`: `visibility: hidden` ist modulweit gesperrt, und ein bloss
 * verdecktes Soll stuende weiterhin im PDF-Textlayer). Damit muss die
 * Entscheidung dort fallen, wo die Zeile gebaut wird. Es ist genau das Muster,
 * das `EtikettenBogen.tsx` fuer denselben Fall — Druckflaeche mit
 * Bildschirmschaltern — bereits faehrt.
 *
 * DIE NUTZLAST IST DER PREIS, und er ist hier vertretbar: die Seite steht
 * hinter zwei Riegeln, sieht ausschliesslich angemeldete Lagerbuch-Verwalter
 * und traegt dieselben Daten, die `SollEditor` je Fahrzeug ohnehin schon in den
 * Client reicht. Der Grund, aus dem `helfer/check/page.tsx` das Gegenteil tut
 * (§7.9.1, Falle 15), gilt hier ausdruecklich NICHT: dort wandern die Listen
 * der GESAMTEN Organisation in eine Sitzung OHNE Konto auf ein privates
 * Telefon. Wer diese Seite aufruft, hat die Daten bereits.
 *
 * KEIN `size` AN EINEM KNOPF (Falle 4): `controlHeight` ist unter dem
 * `(druck)`-Ast das Suite-Mass und damit schon richtig; `size="large"` waere
 * 72px.
 *
 * ⚠️ JEDES ELEMENT DER BEDIENLEISTE HAENGT UNTER `lb-nichtDrucken`, und die
 * Leiste steht NICHT als Geschwister zwischen den Blaettern: der
 * Seitenumbruch im Druck haengt an `.lb-cl-blatt + .lb-cl-blatt`, und ein
 * eingeschobenes Element zwischen zwei Blaettern loeste den Geschwisterbezug
 * auf — die Fahrzeuge liefen dann ohne Umbruch ineinander. `display: none`
 * aendert daran nichts: ausgeblendete Elemente bleiben Geschwister.
 */
import { useState } from "react";
import Link from "next/link";
import { Button, Checkbox, Flex } from "antd";
import { SPACE } from "@/core/theme/tokens";
import type {
  ChecklisteBlatt,
  ChecklisteFach,
} from "../../../_lib/lesepfade/checkliste";
import { ZUSTAENDE } from "../../../_lib/konstanten";
import { Ikone } from "../../../_ui/ikonen";

/** Das gezeichnete Kaestchen. Nie ein Formularelement — es wird mit dem
 *  Kugelschreiber ausgefuellt, und ein echtes Kontrollkaestchen druckt je nach
 *  Browser als graue Flaeche oder gar nicht. */
function Kasten() {
  return <span className="lb-cl-box" aria-hidden="true" />;
}

function Linie() {
  return <span className="lb-cl-linie" aria-hidden="true" />;
}

function SignaturFeld({ beschriftung }: { beschriftung: string }) {
  return (
    <div className="lb-cl-signaturFeld">
      <span>{beschriftung}</span>
      <Linie />
    </div>
  );
}

function Fach({ fach, blind }: { fach: ChecklisteFach; blind: boolean }) {
  return (
    <>
      <h3 className="lb-cl-fach">
        {fach.label}{" "}
        <span className="lb-cl-fachZahl">
          ({fach.positionen.length}{" "}
          {fach.positionen.length === 1 ? "Position" : "Positionen"})
        </span>
      </h3>
      <table className="lb-cl-tabelle">
        <thead>
          <tr>
            <th className="lb-cl-sHaken" scope="col">
              <span aria-hidden="true">✓</span>
              <span className="lb-cl-nurLeser">geprüft</span>
            </th>
            <th scope="col">Artikel</th>
            <th className="lb-cl-sLager" scope="col">Handlager</th>
            {/* Bei Blindzaehlung traegt die Spalte nur noch die Einheit — die
                Ueberschrift sagt das, statt eine leere „Soll"-Spalte zu
                zeigen, die wie ein Druckfehler aussieht. */}
            <th className="lb-cl-sSoll" scope="col">{blind ? "Einheit" : "Soll"}</th>
            <th className="lb-cl-sIst" scope="col">Ist</th>
            <th className="lb-cl-sVerfall" scope="col">Verfall</th>
          </tr>
        </thead>
        <tbody>
          {fach.positionen.map((position) => (
            <tr key={`${position.artikelId}:${position.artikelName}`}>
              <td className="lb-cl-sHaken"><Kasten /></td>
              <td className="lb-cl-artikel">{position.artikelName}</td>
              <td className="lb-cl-sLager">{position.handlagerFach || "–"}</td>
              <td className="lb-cl-sSoll">
                {blind ? position.einheit : `${position.soll} ${position.einheit}`}
              </td>
              {/* LEER UND GETOENT — hier wird geschrieben. Der Wert steht
                  bewusst nirgends im Markup: die Zaehlung soll die Zahl
                  eintragen, nicht bestaetigen. */}
              <td className="lb-cl-sIst" />
              <td className="lb-cl-sVerfall">
                {position.verfallText === null ? (
                  ""
                ) : (
                  <span className={position.verfallAuffaellig ? "lb-cl-warnung" : undefined}>
                    {position.verfallAuffaellig ? "! " : ""}
                    {position.verfallText}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Blatt({
  blatt,
  blind,
  stand,
}: {
  blatt: ChecklisteBlatt;
  blind: boolean;
  stand: string;
}) {
  const leer =
    blatt.faecher.length === 0
    && blatt.geraete.length === 0
    && blatt.flaschen.length === 0;

  return (
    <section className="lb-cl-blatt" data-testid="lb-cl-blatt" data-fahrzeug={blatt.id}>
      <header className="lb-cl-kopf">
        <div>
          <h2 className="lb-cl-titel">{blatt.name}</h2>
          {blatt.kennung && <div className="lb-cl-kennung">{blatt.kennung}</div>}
        </div>
        <div className="lb-cl-meta">
          <div>Fahrzeug-Checkliste</div>
          <div>{blatt.vorlage ? `Vorlage: ${blatt.vorlage}` : "ohne Vorlage"}</div>
          {/*
            DER STAND-VERMERK IST KEINE DEKORATION. Ein Blatt ohne Datum ist
            nach zwei Wochen nicht mehr von einem aktuellen zu unterscheiden —
            und ein Soll aendert sich, sobald jemand die Vorlage anfasst. Wer
            nach einer alten Liste packt, packt ein altes Fahrzeug.
          */}
          <div>
            {blatt.positionen} {blatt.positionen === 1 ? "Position" : "Positionen"}
            {" · Stand "}
            {stand}
          </div>
        </div>
      </header>

      <div className="lb-cl-signatur">
        <SignaturFeld beschriftung="Geprüft von" />
        <SignaturFeld beschriftung="Datum" />
        <SignaturFeld beschriftung="Unterschrift" />
      </div>

      {leer && (
        <p className="lb-cl-leer">
          Für dieses Fahrzeug ist weder eine Soll-Bestückung noch ein Gerät oder
          eine Sauerstoffflasche hinterlegt. Es gibt nichts abzuhaken.
        </p>
      )}

      {blatt.faecher.length > 0 && (
        <>
          <h3 className="lb-cl-abschnitt">Bestückung</h3>
          {blatt.faecher.map((fach) => (
            <Fach key={fach.label} fach={fach} blind={blind} />
          ))}
        </>
      )}

      {blatt.geraete.length > 0 && (
        <>
          <h3 className="lb-cl-abschnitt">Geräte</h3>
          <table className="lb-cl-tabelle">
            <thead>
              <tr>
                <th className="lb-cl-sHaken" scope="col">
                  <span aria-hidden="true">✓</span>
                  <span className="lb-cl-nurLeser">vorhanden</span>
                </th>
                <th scope="col">Gerät</th>
                <th scope="col">Zustand</th>
                <th className="lb-cl-sBemerkung" scope="col">Bemerkung</th>
              </tr>
            </thead>
            <tbody>
              {blatt.geraete.map((geraet) => (
                <tr key={geraet.id}>
                  <td className="lb-cl-sHaken"><Kasten /></td>
                  <td>
                    <span className="lb-cl-artikel">{geraet.name}</span>
                    {geraet.fristText && (
                      <>
                        {" "}
                        <span
                          className={
                            geraet.fristAuffaellig ? "lb-cl-warnung" : "lb-cl-notiz"
                          }
                        >
                          {geraet.fristAuffaellig ? "! " : ""}
                          {geraet.fristText}
                        </span>
                      </>
                    )}
                  </td>
                  <td>
                    <span className="lb-cl-zustand">
                      {ZUSTAENDE.map((zustand) => (
                        <span className="lb-cl-zustandWahl" key={zustand}>
                          <Kasten /> {zustand}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="lb-cl-sBemerkung" />
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {blatt.flaschen.length > 0 && (
        <>
          <h3 className="lb-cl-abschnitt">Sauerstoff</h3>
          <table className="lb-cl-tabelle">
            <thead>
              <tr>
                <th className="lb-cl-sHaken" scope="col">
                  <span aria-hidden="true">✓</span>
                  <span className="lb-cl-nurLeser">geprüft</span>
                </th>
                <th scope="col">Flasche</th>
                <th className="lb-cl-sBar" scope="col">Nennfülldruck</th>
                <th className="lb-cl-sBar" scope="col">zuletzt</th>
                <th className="lb-cl-sIst" scope="col">gemessen (bar)</th>
              </tr>
            </thead>
            <tbody>
              {blatt.flaschen.map((flasche) => (
                <tr key={flasche.id}>
                  <td className="lb-cl-sHaken"><Kasten /></td>
                  <td className="lb-cl-artikel">{flasche.name}</td>
                  <td className="lb-cl-sBar">{flasche.nennfuelldruckBar} bar</td>
                  {/*
                    ⚠️ `null` IST „NIE GEMESSEN", NICHT 0 bar (§5.12). Ein
                    gedrucktes „0 bar" behauptete auf einem Nachweis eine leere
                    Flasche, die niemand gemessen hat — genau der Fehlalarm,
                    wegen dem der Typ ueberhaupt nullbar ist.
                  */}
                  <td className="lb-cl-sBar">
                    {flasche.letzterDruck === null ? (
                      <span className="lb-cl-notiz">nie gemessen</span>
                    ) : (
                      `${flasche.letzterDruck} bar`
                    )}
                  </td>
                  <td className="lb-cl-sIst" />
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/*
        ⚠️ HIER STAND EINE ANWEISUNG, WAS MIT DEM AUSGEFUELLTEN BLATT ZU TUN
        SEI („Ergebnis anschließend im Lagerbuch erfassen – Helfer-Zugang,
        ‚Check'"). Sie ist ERSATZLOS entfallen, und das ist eine fachliche
        Entscheidung, keine Aufraeumaktion: das gedruckte Blatt und der
        Bildschirm-Check unter `helfer/check` sind ZWEI Anwendungsfaelle, nicht
        zwei Schritte EINES Ablaufs. Wer das Blatt in die Hand nimmt, arbeitet
        genau damit — die Uebertragung in den Helfer-Zugang ist nicht
        vorausgesetzt, und ein Blatt, das sie verlangt, behauptet einen
        Arbeitsablauf, den es so nicht gibt. Wer den Bildschirmweg gehen will,
        findet ihn ohnehin, und zwar dort, wo er beginnt.

        Die Identitaetszeile BLEIBT: ein loses Blatt auf einem Stapel muss sein
        Fahrzeug und seinen Stand nennen koennen.
      */}
      <footer className="lb-cl-fuss">
        <span>
          {blatt.name}
          {blatt.kennung ? ` · ${blatt.kennung}` : ""} · Stand {stand}
        </span>
      </footer>
    </section>
  );
}

/**
 * Die Adresse des PDF-Handlers, mit GENAU der Lage, die gerade auf dem
 * Bildschirm steht.
 *
 * ⚠️ DIE ZWEI SCHALTER GEHEN MIT, UND DAS IST KEINE ZUGABE. Die Blindzaehlung
 * entscheidet, ob die Sollmenge ueberhaupt entsteht — ein PDF, das sie trotz
 * gesetztem Schalter mitdruckt, entwertet die Inventur, und zwar unbemerkt:
 * man sieht dem Knopf nicht an, dass die Datei etwas anderes enthaelt als das
 * Blatt darunter.
 *
 * ⚠️ `auswahl` STATT `blaetter.map(b => b.id)`. Beide ergaeben heute dieselbe
 * Liste, aber nicht dieselbe AUSSAGE: „keine Angabe" heisst „alle AKTIVEN
 * Fahrzeuge", eine ausdrueckliche Liste heisst „diese, auch stillgelegte".
 * Rekonstruiert man die Auswahl aus den gezeigten Blaettern, wird aus der
 * ersten Aussage still die zweite.
 *
 * Exportiert, damit die Zusammensetzung ohne einen Klick pruefbar ist.
 */
export function pdfAdresse(
  auswahl: string[],
  schalter: { blind: boolean; kompakt: boolean },
): string {
  const parameter = new URLSearchParams();
  for (const id of auswahl) parameter.append("fz", id);
  if (schalter.blind) parameter.set("blind", "1");
  if (schalter.kompakt) parameter.set("kompakt", "1");
  const anhang = parameter.toString();
  return `/verwaltung/checklisten/pdf${anhang ? `?${anhang}` : ""}`;
}

export function ChecklistenBogen({
  blaetter,
  stand,
  auswahl = [],
}: {
  blaetter: ChecklisteBlatt[];
  stand: string;
  /** Die `?fz=`-Angabe der Seite; leer = „alle aktiven Fahrzeuge". */
  auswahl?: string[];
}) {
  const [kompakt, setKompakt] = useState(false);
  const [blind, setBlind] = useState(false);

  return (
    <div className={kompakt ? "lb-cl-bogen lb-cl-kompakt" : "lb-cl-bogen"}>
      <div className="lb-nichtDrucken" data-testid="lb-cl-leiste">
        <Link href="/verwaltung/fahrzeuge">
          {/* 6 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32) — enger
              Abstand zwischen Zeichen und Text, kein Skalenwert ohne
              sichtbaren Sprung. Uebernommen aus `EtikettenChrome.tsx`. */}
          <Flex align="center" gap={6}>
            <Ikone name="pfeil-links" groesse={15} />
            Zurück zu den Fahrzeugen
          </Flex>
        </Link>

        <Flex
          align="center"
          justify="space-between"
          gap={SPACE.md}
          wrap
          style={{ marginBlock: SPACE.md }}
        >
          <div>
            <h1 style={{ margin: 0 }}>Checklisten</h1>
            <p style={{ margin: 0 }} data-testid="lb-cl-zahl">
              {blaetter.length === 1
                ? "1 Fahrzeug, ein Blatt"
                : `${blaetter.length} Fahrzeuge, je ein Blatt`}
            </p>
          </div>

          <Flex align="center" gap={SPACE.md} wrap>
            {/*
              DIE MARKE SITZT AM UMSCHLAG, NICHT AM `Checkbox`. antd reicht
              unbekannte Eigenschaften nicht bis an das `<input>` durch — ein
              `data-testid` direkt an der Komponente landet nirgends im DOM,
              und der Test findet still nichts. Gemessen, nicht vermutet.
            */}
            <span data-testid="lb-cl-kompakt">
              <Checkbox
                checked={kompakt}
                onChange={(ereignis) => setKompakt(ereignis.target.checked)}
              >
                Kompakt
              </Checkbox>
            </span>
            {/*
              BLINDZAEHLUNG. Wer die Sollmenge sieht, zaehlt gegen sie statt
              nachzuzaehlen — das ist der Grund, aus dem eine Inventur
              ueberhaupt blind gefuehrt wird. Die Zahl wird dabei NICHT
              verdeckt, sondern gar nicht erst gerendert (Begruendung im Kopf
              dieser Datei).
            */}
            <span data-testid="lb-cl-blind">
              <Checkbox
                checked={blind}
                onChange={(ereignis) => setBlind(ereignis.target.checked)}
              >
                Blindzählung
              </Checkbox>
            </span>
            {/*
              PDF NEBEN DRUCKEN, NICHT STATT DRUCKEN. Es sind zwei Wege mit
              zwei Anlaessen: „Drucken" ist der Griff zum Papier hier und
              jetzt, das PDF ist die Datei zum Ablegen und Weiterschicken —
              und auf dem Telefon der einzige Weg, der ueberhaupt etwas
              hervorbringt.

              ⚠️ `Button href`, NIEMALS `<Link><Button/></Link>`. Ein
              `<button>` in einem `<a>` ist verbotener Inhalt: der Knopf
              schluckt den Klick, der Anker navigiert nie — und am Bildschirm
              ist das von der richtigen Fassung nicht zu unterscheiden. Die
              volle Messung steht im Kopf von
              `verwaltung/(arbeit)/fahrzeuge/ChecklisteKnopf.tsx`; dort war es
              ein echter, im e2e-Lauf gefundener Fehler.

              ⚠️ KEIN `download`-Attribut. Der Handler setzt
              `Content-Disposition: attachment` samt Dateinamen; ein zweites,
              leeres `download` am Anker ueberschriebe den servergesetzten
              Namen in manchen Browsern mit dem letzten Pfadsegment — die
              Datei hiesse dann „pdf".
            */}
            <Button
              href={pdfAdresse(auswahl, { blind, kompakt })}
              icon={<Ikone name="herunterladen" groesse={16} />}
              data-testid="lb-cl-pdf"
              disabled={blaetter.length === 0}
            >
              PDF
            </Button>
            {/* Primaeraktion — zulaessig, weil der Knopf eine HANDLUNG ist und
                keine Datenflaeche. Rot traegt auf dieser Seite an keiner
                Stelle fachliche Bedeutung (Falle 3). */}
            <Button
              type="primary"
              onClick={() => window.print()}
              icon={<Ikone name="drucken" groesse={16} />}
              data-testid="lb-cl-drucken"
              disabled={blaetter.length === 0}
            >
              Drucken
            </Button>
          </Flex>
        </Flex>
      </div>

      {blaetter.map((blatt) => (
        <Blatt key={blatt.id} blatt={blatt} blind={blind} stand={stand} />
      ))}
    </div>
  );
}

import type { BildName } from "../../_lib/hilfe";
import { ZUSTAND_TEXT, ZYKLUS_KANTEN } from "../../_lib/hilfe";
import { BILD_SCHRIFT, Bildrahmen, Kantentext, Kasten, LINIE, Pfeil, STAHL, TINTE } from "./svg";
import s from "../aufgaben.module.css";

/*
 * DIE MECHANIKBILDER — je eines fuer eine Frage, die eine Layoutskizze nicht beantworten kann.
 *
 * OHNE ZAHL IM SATZ, UND DAS IST DIESELBE LEHRE WIE IN `docs/design/README.md` („eine Aufzaehlung
 * ohne Zahl kann nicht falsch zaehlen"): hier stand „die sechs", bis das Rollenbild dazukam. Die
 * verbindliche Menge ist `BILD_NAMEN` in `_lib/hilfe.ts` — sie zaehlt sich selbst.
 *
 * ══ DER MASSSTAB FUER „SINNVOLLES BILD": es zeigt eine BEZIEHUNG, die im Text nur als Aufzaehlung
 *    stuende. Das Lebenszyklusbild zeigt, dass „fertig melden" bei einer Selbstaufgabe woanders
 *    hinfuehrt als bei einer Fremdaufgabe; das Budgetbild zeigt, dass eine Woche im Rahmen liegen
 *    und ein einzelner Tag trotzdem ueberbucht sein kann. Beides sind Saetze, die man dreimal
 *    liest und einmal sieht. Ein Bild, das nur die Ueberschrift daneben wiederholt, ist hier
 *    keines — deshalb sind es eine Handvoll und nicht zwanzig, und zwei Kapitel haben gar keines
 *    (`personen`, `archiv`): dort gibt es nichts zu sehen, was nicht im Satz steht.
 *
 * ══ JEDES BILD IST DOPPELT LESBAR. Das Lebenszyklusbild traegt UNTER sich die vollstaendige
 *    Uebergangstabelle als echten Text — die Grafik ist der schnelle Weg, die Tabelle der
 *    genaue. Wer das Bild nicht sehen kann, verliert nichts.
 *
 * ══ DIE GEOMETRIE STEHT VON HAND DA, UND DAS IST EINE ENTSCHEIDUNG: ein Automatik-Layout fuer
 *    Graphen waere eine Bibliothek im Bundle und eine Anordnung, die niemand kontrolliert. Der
 *    Preis ist, dass verschobene Zahlen kollidieren koennen — dagegen steht `Bilder.test.tsx`,
 *    das jedes Bild rendert und prueft, dass kein Element (auch kein geschaetzter Textkasten)
 *    ueber den `viewBox` hinauslaeuft.
 */

export function Mechanikbild({ name }: { name: BildName }) {
  switch (name) {
    case "rollen":
      return <Rollen />;
    case "lebenszyklus":
      return <Lebenszyklus />;
    case "tagesbudget":
      return <Tagesbudget />;
    case "wochenachse":
      return <Wochenachse />;
    case "verteilweg":
      return <Verteilweg />;
    case "freigabe":
      return <Freigabe />;
    case "nachweisweg":
      return <Nachweisweg />;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * 0 · DIE STAFFELUEBERGABE ZWISCHEN DEN DREI ROLLEN
 *
 * DAS BILD, DAS AM ANFANG STEHT — und das einzige, das die Frage beantwortet, die vor allen
 * anderen kommt: „wer macht hier eigentlich was, und wann bin ich dran?". Es zeigt keinen
 * Zustand und keine Flaeche, sondern eine UEBERGABE: vier Stationen, drei Rollen, und der
 * Auftraggeber steht zweimal darin — einmal am Anfang, einmal als Pruefer. Genau diese Wiederkehr
 * ist das Vier-Augen-Prinzip, und sie laesst sich in einem Satz behaupten oder in einem Bild
 * zeigen.
 * ────────────────────────────────────────────────────────────────────────────────────────────── */
function Rollen() {
  const stationen = [
    { rolle: "Auftraggeber", tut: "stellt die Aufgabe ein", ton: "karte" as const },
    { rolle: "Koordinatorin", tut: "weist zu — nach Auslastung", ton: "karte" as const },
    { rolle: "Auftragnehmer", tut: "plant ein, erledigt, meldet fertig", ton: "karte" as const },
    { rolle: "Auftraggeber prüft", tut: "gibt frei — oder weist zurück", ton: "ok" as const },
  ];
  const uebergaenge = ["geht in den Posteingang", "landet in der Wochenplanung", "mit Nachweis, wenn gefordert"];
  return (
    <Bildrahmen
      titel="Die Staffelübergabe zwischen den drei Rollen"
      beschreibung={
        "Vier Stationen untereinander. Erstens: der Auftraggeber stellt die Aufgabe ein, sie geht " +
        "in den Posteingang. Zweitens: die Koordinatorin weist sie nach Auslastung zu, sie landet " +
        "in der Wochenplanung. Drittens: der Auftragnehmer plant sie ein, erledigt sie und meldet " +
        "fertig, mit Nachweis, wenn einer gefordert ist. Viertens: der Auftraggeber prüft und gibt " +
        "frei — oder weist mit Begründung zurück, dann geht die Aufgabe an Station drei zurück. " +
        "Ist sie freigegeben, ist sie abgeschlossen und steht im Archiv."
      }
      hoehe={330}
      unterschrift="Der Auftraggeber steht zweimal darin — am Anfang und als Prüfer. Diese Wiederkehr ist das Vier-Augen-Prinzip: wer eine Aufgabe stellt, nimmt sie auch ab, und wer sie erledigt, gibt sie nie selbst frei."
    >
      {stationen.map((station, i) => {
        const oben = 8 + i * 72;
        return (
          <g key={station.rolle}>
            <Kasten
              x={24}
              y={oben}
              breite={312}
              hoehe={46}
              zeilen={[station.rolle, station.tut]}
              ton={station.ton}
              fett
            />
            {i < uebergaenge.length ? (
              <>
                <Pfeil punkte={[[90, oben + 46], [90, oben + 72]]} />
                <Kantentext x={102} y={oben + 63} zeilen={[uebergaenge[i]]} gedaempft />
              </>
            ) : null}
          </g>
        );
      })}

      {/*
        * DER LETZTE PFEIL STEHT IN DERSELBEN SPUR WIE DIE DREI DARUEBER (x = 90). Er lief eine
        * Runde lang aussen rechts herum, mit der Beschriftung links davon — im Abzug gesehen: der
        * Pfeil und sein Text gehoerten sichtbar nicht mehr zusammen, und die Kette brach genau an
        * der Stelle ab, an der sie zu Ende erzaehlt.
        */}
      <Pfeil punkte={[[90, 270], [90, 294]]} />
      <Kantentext x={102} y={287} zeilen={["abgeschlossen"]} gedaempft />
      <Kasten x={24} y={294} breite={312} hoehe={30} zeilen={["Archiv"]} ton="ok" />

      {/* Der Rueckweg: zurueckgewiesen fuehrt an Station 3 zurueck. */}
      <Pfeil punkte={[[24, 246], [16, 246], [16, 175], [24, 175]]} farbe={STAHL} />
      <Kantentext x={5} y={180} zeilen={["zurückgewiesen"]} anker="end" gedaempft gedreht />
    </Bildrahmen>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * 1 · DER LEBENSZYKLUS EINER AUFGABE
 *
 * Die senkrechte Kette ist der Regelweg; alles, was von ihr abweicht, laeuft ueber eine Schiene
 * am Rand — links zurueck, rechts wieder hinein. Die Zahlen sind hier ausgeschrieben und nicht
 * gerechnet, weil sie eine ZEICHNUNG sind: eine „berechnete" Anordnung waere ein Layoutalgorithmus
 * mit einem einzigen Anwendungsfall.
 * ────────────────────────────────────────────────────────────────────────────────────────────── */
const KASTEN_B = 140;
const KASTEN_H = 28;
const SPALTE_X = 40;
const MITTE = SPALTE_X + KASTEN_B / 2;

function Lebenszyklus() {
  return (
    <Bildrahmen
      titel="Der Lebenszyklus einer Aufgabe"
      beschreibung={
        "Der Weg einer Aufgabe von oben nach unten: neu, eingegangen, verteilt, in Arbeit, " +
        "Freigabe offen, abgeschlossen. Eine Selbstaufgabe überspringt die Freigabe. Aus " +
        "„Freigabe offen“ führt „zurückweisen“ nach „zurückgewiesen“ und von dort zurück in " +
        "„in Arbeit“. Aus „eingegangen“ kann die Aufgabe zurückgezogen und damit gelöscht werden. " +
        "Die vollständige Liste aller Übergänge steht als Tabelle unter dem Bild."
      }
      hoehe={434}
      unterschrift={<Uebergangstabelle />}
      breiteUnterschrift
    >
      {/* Die Kette */}
      <Kasten x={SPALTE_X} y={4} breite={KASTEN_B} hoehe={KASTEN_H} zeilen={["neu"]} ton="papier" />
      <Kasten x={SPALTE_X} y={64} breite={KASTEN_B} hoehe={KASTEN_H} zeilen={["eingegangen"]} fett />
      <Kasten x={SPALTE_X} y={124} breite={KASTEN_B} hoehe={KASTEN_H} zeilen={["verteilt"]} fett />
      <Kasten x={SPALTE_X} y={184} breite={KASTEN_B} hoehe={KASTEN_H} zeilen={["in Arbeit"]} fett />
      <Kasten x={SPALTE_X} y={268} breite={KASTEN_B} hoehe={KASTEN_H} zeilen={["Freigabe offen"]} fett />
      <Kasten
        x={SPALTE_X}
        y={396}
        breite={KASTEN_B}
        hoehe={KASTEN_H}
        zeilen={["abgeschlossen"]}
        ton="ok"
        fett
      />

      {/* Die beiden Nebenzustaende */}
      <Kasten
        x={210}
        y={96}
        breite={120}
        hoehe={KASTEN_H}
        zeilen={["gelöscht"]}
        ton="grau"
        gestrichelt
      />
      <Kasten
        x={196}
        y={326}
        breite={150}
        hoehe={KASTEN_H}
        zeilen={["zurückgewiesen"]}
        ton="ocker"
        fett
      />

      {/* Kette: die Pfeile und ihre Beschriftung */}
      <Pfeil punkte={[[MITTE, 32], [MITTE, 64]]} />
      <Kantentext x={MITTE + 8} y={52} zeilen={["einstellen (für andere)"]} />

      <Pfeil punkte={[[MITTE, 92], [MITTE, 124]]} />
      {/*
        * ZWEIZEILIG UND NICHT „verteilen · Koordination" IN EINER ZEILE: einzeilig lief die
        * Beschriftung unter den Kasten „gelöscht" rechts daneben (im Abzug gesehen, nicht
        * vermutet). Der Ueberlauf-Riegel in `Bilder.test.tsx` faengt das NICHT — er misst die
        * Grenzen des `viewBox`, keine Ueberdeckung zweier Elemente darin.
        */}
      <Kantentext x={MITTE + 8} y={106} zeilen={["verteilen", "Koordinatorin"]} />

      <Pfeil punkte={[[MITTE, 152], [MITTE, 184]]} />
      <Kantentext x={MITTE + 8} y={172} zeilen={["starten · Auftragnehmer"]} />

      <Pfeil punkte={[[MITTE, 212], [MITTE, 268]]} />
      <Kantentext x={MITTE + 8} y={234} zeilen={["fertig melden", "(Fremdaufgabe)"]} />

      <Pfeil punkte={[[MITTE, 296], [MITTE, 396]]} />
      <Kantentext x={MITTE + 8} y={308} zeilen={["freigeben", "Prüfer · Koordin."]} />

      {/* Selbstaufgabe: am linken Rand an eingegangen vorbei */}
      <Pfeil punkte={[[SPALTE_X, 18], [22, 18], [22, 138], [SPALTE_X, 138]]} farbe={STAHL} />
      <Kantentext x={15} y={30} zeilen={["einstellen (für sich selbst)"]} anker="end" gedaempft gedreht />

      {/* Zurueckziehen */}
      <Pfeil punkte={[[180, 78], [193, 78], [193, 110], [210, 110]]} gestrichelt farbe={STAHL} />
      <Kantentext x={186} y={72} zeilen={["zurückziehen"]} gedaempft />

      {/* Die zwei Schleifen an „verteilt“ */}
      <Pfeil punkte={[[180, 129], [192, 129], [192, 137], [182, 137]]} farbe={STAHL} />
      <Kantentext x={198} y={132} zeilen={["einplanen · Auftragnehmer"]} gedaempft />
      <Pfeil punkte={[[180, 143], [192, 143], [192, 151], [182, 151]]} farbe={STAHL} />
      <Kantentext x={198} y={150} zeilen={["anders zuweisen · Koordin."]} gedaempft />

      {/* Die Schleife an „in Arbeit“ */}
      <Pfeil punkte={[[180, 189], [192, 189], [192, 197], [182, 197]]} farbe={STAHL} />
      <Kantentext x={198} y={196} zeilen={["umplanen · Auftragnehmer"]} gedaempft />

      {/* Zuruecksetzen: linke Schiene zurueck nach „verteilt“ */}
      <Pfeil punkte={[[SPALTE_X, 204], [30, 204], [30, 146], [SPALTE_X, 146]]} farbe={STAHL} />
      <Kantentext x={24} y={150} zeilen={["zurücksetzen"]} anker="end" gedaempft gedreht />

      {/* Selbstaufgabe: fertig melden fuehrt direkt auf abgeschlossen */}
      <Pfeil punkte={[[SPALTE_X, 208], [10, 208], [10, 410], [SPALTE_X, 410]]} farbe={STAHL} />
      <Kantentext
        x={8}
        y={214}
        zeilen={["fertig melden (Selbstaufgabe)"]}
        anker="end"
        gedaempft
        gedreht
      />

      {/* Zurueckweisen und wieder aufnehmen */}
      <Pfeil punkte={[[180, 282], [271, 282], [271, 326]]} farbe={STAHL} />
      <Kantentext x={186} y={276} zeilen={["zurückweisen"]} gedaempft />
      <Pfeil punkte={[[346, 340], [352, 340], [352, 206], [180, 206]]} farbe={STAHL} />
      <Kantentext x={342} y={330} zeilen={["wieder aufnehmen"]} gedaempft gedreht />
    </Bildrahmen>
  );
}

/**
 * DIE VOLLSTAENDIGE UEBERGANGSTABELLE UNTER DEM BILD — aus `ZYKLUS_KANTEN`, die ihrerseits gegen
 * `_lib/lebenszyklus.ts`s `UEBERGAENGE` geprueft wird (`hilfe.test.ts`). Eine HTML-`<table>` und
 * keine antd-`Table`: letztere ist eine Client-Komponente, und `columns[].render` aus einer Server
 * Component ist Falle 9.
 */
function Uebergangstabelle() {
  return (
    <table className={s.hilfeTabelle}>
      <caption>Alle Übergänge, vollständig</caption>
      <thead>
        <tr>
          <th scope="col">von</th>
          <th scope="col">Aktion</th>
          <th scope="col">nach</th>
          <th scope="col">wer</th>
        </tr>
      </thead>
      <tbody>
        {ZYKLUS_KANTEN.map((kante) => (
          <tr key={`${kante.von}-${kante.aktion}-${kante.nach}`}>
            <td>{ZUSTAND_TEXT[kante.von]}</td>
            <td>{kante.aktion}</td>
            <td>{ZUSTAND_TEXT[kante.nach]}</td>
            <td>{kante.wer}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * 2 · WIE EIN TAG VOLL WIRD
 *
 * Die Aussage, die kein Satz so schnell traegt: Routinen essen das Budget MIT, und die
 * Ueberbuchung ist eine Aussage ueber EINEN TAG, nicht ueber die Woche.
 * ────────────────────────────────────────────────────────────────────────────────────────────── */
const SOLL_MINUTEN = 468;
const SAEULE_H = 150;
const SAEULE_UNTEN = 190;
const SAEULE_OBEN = SAEULE_UNTEN - SAEULE_H;

interface Stueck {
  art: "routine" | "aufgabe";
  minuten: number;
  text: string;
}

function Tagesbudget() {
  /*
   * DIE ZAHLEN SIND SO GEWAEHLT, DASS MAN SIE SIEHT — und das ist keine Kosmetik: eine
   * 30-Minuten-Routine ergibt bei diesem Massstab 9,6 Einheiten Hoehe, und in einen 9,6 Einheiten
   * hohen Streifen passt keine Beschriftung mehr (`Saeule` laesst sie unter 13 weg). Im ersten
   * Abzug war die Routine damit ein namenloser Streifen — ausgerechnet in dem Bild, dessen ganze
   * Aussage „Routinen zaehlen mit" lautet. 60 Minuten sind ebenso plausibel und lesbar.
   */
  const montag: Stueck[] = [
    { art: "routine", minuten: 60, text: "Routine 60" },
    { art: "aufgabe", minuten: 90, text: "Aufgabe 90" },
    { art: "aufgabe", minuten: 120, text: "Aufgabe 120" },
  ];
  const dienstag: Stueck[] = [
    { art: "routine", minuten: 60, text: "Routine 60" },
    { art: "aufgabe", minuten: 180, text: "Aufgabe 180" },
    { art: "aufgabe", minuten: 300, text: "Aufgabe 300" },
  ];
  return (
    <Bildrahmen
      titel="Wie ein Tag voll wird"
      beschreibung={
        "Zwei Tagessäulen gegen dieselbe Marke „Tagessoll 7,8 Stunden“. Montag: eine Routine mit " +
        "60 Minuten und zwei Aufgaben mit 90 und 120 Minuten, zusammen 4,5 Stunden — der Tag liegt " +
        "im Rahmen. Dienstag: dieselbe Routine mit 60 Minuten und zwei Aufgaben mit 180 und 300 " +
        "Minuten, zusammen 9 Stunden — der obere Teil ragt über die Marke hinaus und der Tag " +
        "gilt als überbucht."
      }
      hoehe={232}
      unterschrift="Das Tagessoll kommt aus der Personenzeile (Minuten pro Arbeitstag). Routinen zählen mit, bevor die erste Aufgabe eingeplant ist. Überbucht heißt nicht gesperrt — das Modul hält niemanden auf, es sagt es nur."
    >
      {/* Die Soll-Marke, quer ueber beide Saeulen */}
      <line
        x1={12}
        y1={SAEULE_OBEN}
        x2={348}
        y2={SAEULE_OBEN}
        stroke={TINTE}
        strokeWidth={1}
        strokeDasharray="5 4"
      />
      {/*
        * DIE MARKE STEHT LINKS UEBER DER LINIE UND KURZ: im ersten Abzug lief die lange Fassung
        * („… (aus der Personenzeile)") in die rechte Saeule und unter deren Ueberbuchungsmarke.
        * Woher der Wert kommt, sagt die Bildunterschrift — der Platz IM Bild ist der knappste.
        */}
      <Kantentext x={12} y={SAEULE_OBEN - 6} zeilen={["Tagessoll 7,8 Std."]} />

      <Saeule x={20} stuecke={montag} kopf="Mo" summe="4,5 Std. verplant" />
      <Saeule x={200} stuecke={dienstag} kopf="Di" summe="9,0 Std. — überbucht" ueberbucht />
    </Bildrahmen>
  );
}

function Saeule({
  x,
  stuecke,
  kopf,
  summe,
  ueberbucht = false,
}: {
  x: number;
  stuecke: readonly Stueck[];
  kopf: string;
  summe: string;
  ueberbucht?: boolean;
}) {
  const breite = 140;
  const skala = SAEULE_H / SOLL_MINUTEN;
  /*
   * DIE OBERKANTE JE STUECK ALS REINE ABLEITUNG (dieselbe Ueberlegung wie in `Skizze.tsx`): eine
   * mitlaufende Variable, die die `map`-Rueckrufe fortschreiben, ist eine Zuweisung nach dem
   * Rendern und faellt im React-Compiler-Riegel von `pnpm lint`. Gestapelt wird von UNTEN, die
   * Oberkante des n-ten Stuecks ist also der Boden minus der Summe der ersten n Stuecke.
   */
  const oberkante = stuecke.map(
    (_, i) =>
      SAEULE_UNTEN - stuecke.slice(0, i + 1).reduce((summe, s) => summe + s.minuten * skala, 0),
  );
  const teile = stuecke.map((stueck, i) => {
    const hoehe = stueck.minuten * skala;
    const oben = oberkante[i];
    return (
      <g key={stueck.text}>
        <rect
          x={x}
          y={oben}
          width={breite}
          height={hoehe}
          fill={
            stueck.art === "routine" ? "var(--auf-stahl-flaeche)" : "var(--auf-grau-flaeche)"
          }
          stroke={LINIE}
        />
        {hoehe >= 13 ? (
          <text
            x={x + breite / 2}
            y={oben + hoehe / 2 + 3.5}
            textAnchor="middle"
            fontSize={BILD_SCHRIFT.kante}
            fill={
              stueck.art === "routine" ? "var(--auf-stahl-text)" : "var(--auf-grau-text)"
            }
          >
            {stueck.text}
          </text>
        ) : null}
      </g>
    );
  });
  const spitze = oberkante[oberkante.length - 1];
  return (
    <>
      {/* Der Rahmen des Tagessolls — die Saeule darf ihn ueberragen, und genau das ist die Aussage. */}
      <rect
        x={x}
        y={SAEULE_OBEN}
        width={breite}
        height={SAEULE_H}
        fill="none"
        stroke={LINIE}
        strokeDasharray="3 3"
      />
      {teile}
      {ueberbucht ? (
        <>
          <rect
            x={x}
            y={spitze}
            width={breite}
            height={SAEULE_OBEN - spitze}
            fill="var(--auf-achtung-flaeche)"
            stroke="var(--auf-achtung-text)"
          />
          <text
            x={x + breite / 2}
            y={spitze - 5}
            textAnchor="middle"
            fontSize={BILD_SCHRIFT.kante}
            fill="var(--auf-achtung-text)"
          >
            über dem Soll
          </text>
        </>
      ) : null}
      <text x={x + breite / 2} y={SAEULE_UNTEN + 14} textAnchor="middle" fontSize={11} fontWeight={600} fill={TINTE}>
        {kopf}
      </text>
      <text x={x + breite / 2} y={SAEULE_UNTEN + 28} textAnchor="middle" fontSize={BILD_SCHRIFT.kante} fill={STAHL}>
        {summe}
      </text>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * 3 · DIE WOCHENACHSE
 * ────────────────────────────────────────────────────────────────────────────────────────────── */
function Wochenachse() {
  const tage = [
    { kopf: "Mo", eintraege: ["routine", "aufgabe"] as const, budget: "2,0 / 7,8" },
    { kopf: "Di", eintraege: ["aufgabe", "aufgabe"] as const, budget: "5,5 / 7,8" },
    { kopf: "Mi", eintraege: ["routine"] as const, budget: "0,5 / 7,8" },
    { kopf: "Do", eintraege: ["aufgabe"] as const, budget: "1,5 / 7,8" },
    { kopf: "Fr", eintraege: [] as const, budget: "0,0 / 7,8" },
  ];
  const breite = 64;
  const abstand = 4;
  return (
    <Bildrahmen
      titel="Die Wochenachse"
      beschreibung={
        "Fünf Tagesspalten von Montag bis Freitag. Jede Spalte enthält Aufgaben und Routinen " +
        "untereinander in der selbst gewählten Reihenfolge und darunter das Tagesbudget. Ein Zug " +
        "von einer Spalte in eine andere plant die Aufgabe auf den anderen Tag um. Was in keine " +
        "Spalte passt — ohne Termin oder in einer anderen Woche —, steht in der Zeile unter der " +
        "Achse."
      }
      hoehe={246}
      unterschrift="Auf dem Telefon zeigt die Achse einen Tag statt fünf; die Tagesleiste darüber wechselt ihn. Routinen sind nicht ziehbar — sie hängen an ihren Wochentagen."
    >
      {tage.map((tag, i) => {
        const x = 12 + i * (breite + abstand);
        return (
          <g key={tag.kopf}>
            <rect x={x} y={18} width={breite} height={122} rx={5} fill="var(--auf-papier)" stroke={LINIE} />
            <text x={x + breite / 2} y={13} textAnchor="middle" fontSize={11} fontWeight={600} fill={TINTE}>
              {tag.kopf}
            </text>
            {tag.eintraege.map((art, j) => (
              <g key={`${tag.kopf}-${j}`}>
                <rect
                  x={x + 5}
                  y={26 + j * 34}
                  width={breite - 10}
                  height={28}
                  rx={4}
                  fill={art === "routine" ? "var(--auf-stahl-flaeche)" : "var(--auf-karte)"}
                  stroke={LINIE}
                />
                <text
                  x={x + breite / 2}
                  y={26 + j * 34 + 17}
                  textAnchor="middle"
                  fontSize={9}
                  fill={art === "routine" ? "var(--auf-stahl-text)" : TINTE}
                >
                  {art === "routine" ? "Routine" : "Aufgabe"}
                </text>
              </g>
            ))}
            {tag.eintraege.length === 0 ? (
              <text x={x + breite / 2} y={70} textAnchor="middle" fontSize={9} fill={STAHL}>
                frei
              </text>
            ) : null}
            <text x={x + breite / 2} y={132} textAnchor="middle" fontSize={9} fill={STAHL}>
              {tag.budget}
            </text>
          </g>
        );
      })}

      {/* Der Zug von Dienstag auf Donnerstag */}
      <Pfeil
        punkte={[
          [108, 146],
          [108, 166],
          [244, 166],
          [244, 146],
        ]}
        gestrichelt
      />
      <Kantentext x={116} y={180} zeilen={["ziehen = auf einen anderen Tag umplanen"]} />

      {/* Die Restmenge unter der Achse */}
      <Kasten
        x={12}
        y={196}
        breite={336}
        hoehe={40}
        zeilen={["2 Aufgaben liegen außerhalb dieser Woche:", "ohne Termin · nächste Woche"]}
        ton="papier"
      />
    </Bildrahmen>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * 4 · DER WEG EINER AUFGABE DURCH DIE VERTEILUNG
 * ────────────────────────────────────────────────────────────────────────────────────────────── */
function Verteilweg() {
  const personen = [
    { name: "Alina", anteil: 0.52, wert: "4,0 / 7,8" },
    { name: "Bo", anteil: 0.95, wert: "7,4 / 7,8" },
    { name: "Cem", anteil: 0.18, wert: "1,4 / 7,8" },
  ];
  return (
    <Bildrahmen
      titel="Der Weg durch die Verteilung"
      beschreibung={
        "Oben der Posteingang mit drei noch nicht zugewiesenen Aufgaben. Ein Pfeil führt nach " +
        "unten auf drei Personenspalten mit ihrer Wochenauslastung: Alina 4,0 von 7,8 Stunden, Bo " +
        "7,4 von 7,8, Cem 1,4 von 7,8. Der Klick auf einen Namen weist zu. Ein Zeitvorschlag kann " +
        "mitgegeben werden, verbindlich ist er nicht — der Auftragnehmer nimmt ihn an oder plant " +
        "anders ein."
      }
      hoehe={286}
      unterschrift="Die Auslastung steht schon vor der Entscheidung da — im Zuweisen-Feld noch einmal, aber dann hat man sich bereits entschieden."
    >
      <rect x={60} y={6} width={240} height={68} rx={6} fill="var(--auf-papier)" stroke={LINIE} />
      <text x={72} y={22} fontSize={11} fontWeight={600} fill={TINTE}>
        Posteingang (3)
      </text>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={72} y={28 + i * 14} width={216} height={11} rx={3} fill="var(--auf-karte)" stroke={LINIE} />
          <rect x={78} y={32 + i * 14} width={96 - i * 18} height={3.5} rx={1.75} fill={TINTE} opacity={0.5} />
        </g>
      ))}

      <Pfeil punkte={[[180, 74], [180, 100]]} />
      <Kantentext x={190} y={92} zeilen={["zuweisen: Klick auf den Namen"]} />

      {personen.map((person, i) => {
        const x = 12 + i * 116;
        return (
          <g key={person.name}>
            <rect x={x} y={106} width={108} height={76} rx={6} fill="var(--auf-karte)" stroke={LINIE} />
            <text x={x + 54} y={124} textAnchor="middle" fontSize={11} fontWeight={600} fill={TINTE}>
              {person.name}
            </text>
            <rect x={x + 10} y={134} width={88} height={10} rx={5} fill="var(--auf-grau-flaeche)" />
            <rect
              x={x + 10}
              y={134}
              width={88 * person.anteil}
              height={10}
              rx={5}
              fill={person.anteil > 0.9 ? "var(--auf-ocker-text)" : STAHL}
            />
            <text x={x + 54} y={160} textAnchor="middle" fontSize={9.5} fill={STAHL}>
              {person.wert}
            </text>
            <text x={x + 54} y={173} textAnchor="middle" fontSize={9} fill={STAHL}>
              Std./Woche
            </text>
          </g>
        );
      })}

      <Pfeil punkte={[[180, 182], [180, 206]]} gestrichelt farbe={STAHL} />
      <Kasten
        x={12}
        y={206}
        breite={336}
        hoehe={44}
        zeilen={["Zeitvorschlag (optional): „Do, 09:00“", "— angenommen oder anders eingeplant"]}
        ton="papier"
      />
      <text x={180} y={268} textAnchor="middle" fontSize={9.5} fill={STAHL}>
        Der Wochenplan gehört dem Auftragnehmer, nicht der Verteilung.
      </text>
    </Bildrahmen>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * 5 · WER FREIGIBT — UND WER NIE
 * ────────────────────────────────────────────────────────────────────────────────────────────── */
function Freigabe() {
  return (
    <Bildrahmen
      titel="Wer freigibt — und wer nie"
      beschreibung={
        "Drei Fälle untereinander. Fremdaufgabe: der Auftraggeber stellt ein, der Auftragnehmer " +
        "arbeitet und meldet fertig, der eingetragene Prüfer gibt frei — nie dieselbe " +
        "Person. Selbstaufgabe: wer sie sich selbst einstellt, schließt sie mit dem Fertigmelden " +
        "ab; es gibt keine Freigabestufe. Vertretung: ist der Prüfer nicht verfügbar, gibt die " +
        "Koordinatorin frei, und der Verlauf hält „in Vertretung für“ fest."
      }
      hoehe={280}
      unterschrift="Die Koordinatorin gibt ihre eigene Arbeit nicht frei — sonst fiele das Vier-Augen-Prinzip für genau den Fall aus, für den es da ist."
    >
      <Spur y={0} titel="Fremdaufgabe" />
      <Kasten x={8} y={16} breite={104} hoehe={38} zeilen={["Auftraggeber", "stellt ein"]} />
      <Pfeil punkte={[[112, 35], [128, 35]]} />
      <Kasten x={128} y={16} breite={104} hoehe={38} zeilen={["Auftragnehmer", "meldet fertig"]} />
      <Pfeil punkte={[[232, 35], [248, 35]]} />
      <Kasten x={248} y={16} breite={104} hoehe={38} zeilen={["Prüfer", "gibt frei"]} ton="ok" />
      <line x1={180} y1={62} x2={300} y2={62} stroke={STAHL} strokeDasharray="3 3" />
      <text x={240} y={74} textAnchor="middle" fontSize={9.5} fill={STAHL}>
        nie dieselbe Person
      </text>

      <Spur y={94} titel="Selbstaufgabe" />
      <Kasten x={8} y={110} breite={104} hoehe={38} zeilen={["stellt sich selbst", "eine Aufgabe"]} />
      <Pfeil punkte={[[112, 129], [128, 129]]} />
      <Kasten x={128} y={110} breite={104} hoehe={38} zeilen={["arbeitet und", "meldet fertig"]} />
      <Pfeil punkte={[[232, 129], [248, 129]]} />
      <Kasten x={248} y={110} breite={104} hoehe={38} zeilen={["abgeschlossen"]} ton="ok" />
      <text x={300} y={162} textAnchor="middle" fontSize={9.5} fill={STAHL}>
        keine Freigabestufe
      </text>

      <Spur y={188} titel="Vertretung" />
      <Kasten x={8} y={204} breite={104} hoehe={38} zeilen={["Prüfer", "nicht verfügbar"]} ton="grau" />
      <Pfeil punkte={[[112, 223], [128, 223]]} />
      <Kasten x={128} y={204} breite={104} hoehe={38} zeilen={["Koordinatorin", "gibt frei"]} ton="ok" />
      <Pfeil punkte={[[232, 223], [248, 223]]} />
      <Kasten x={248} y={204} breite={104} hoehe={38} zeilen={["Verlauf:", "„in Vertretung für“"]} ton="papier" />
    </Bildrahmen>
  );
}

/** Die Kickerzeile einer Spur — versal, wie die Zonenkoepfe der Flaeche. */
function Spur({ y, titel }: { y: number; titel: string }) {
  return (
    <>
      <text x={8} y={y + 10} fontSize={9.5} fontWeight={600} fill={STAHL} letterSpacing="0.09em">
        {titel.toUpperCase()}
      </text>
      <line x1={8} y1={y + 13} x2={352} y2={y + 13} stroke={LINIE} />
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * 6 · DER WEG EINES NACHWEISES
 * ────────────────────────────────────────────────────────────────────────────────────────────── */
function Nachweisweg() {
  return (
    <Bildrahmen
      titel="Der Weg eines Nachweises"
      beschreibung={
        "Beim Fertigmelden entsteht der Nachweis, als Text oder als Bild. Ein Textnachweis ist " +
        "sofort sichtbar. Ein Bild geht erst durch die Virenprüfung: ist es sauber, wird es " +
        "ausgeliefert; bei einem Befund bleibt es gesperrt und das Fertigmelden wird verweigert. " +
        "Danach steht die Aufgabe auf „Freigabe offen“, und der Prüfer sieht den Nachweis."
      }
      hoehe={266}
      unterschrift="Nachweise sehen nur Koordinatorin, Auftraggeber, Auftragnehmer und der eingetragene Prüfer — Leistungsnachweise sind kein Aushang."
    >
      <Kasten x={90} y={6} breite={180} hoehe={28} zeilen={["„Fertig melden“"]} fett />

      <Pfeil punkte={[[180, 34], [180, 44], [92, 44], [92, 54]]} />
      <Pfeil punkte={[[180, 34], [180, 44], [268, 44], [268, 54]]} />
      <Kasten x={14} y={54} breite={156} hoehe={38} zeilen={["Textnachweis", "sofort sichtbar"]} />
      <Kasten x={190} y={54} breite={156} hoehe={38} zeilen={["Bildnachweis", "wird hochgeladen"]} />

      <Pfeil punkte={[[268, 92], [268, 108]]} />
      <Kasten x={190} y={108} breite={156} hoehe={28} zeilen={["Virenprüfung"]} ton="ocker" />

      <Pfeil punkte={[[230, 136], [230, 146], [92, 146], [92, 158]]} farbe={STAHL} />
      <Pfeil punkte={[[306, 136], [306, 158]]} farbe={STAHL} />
      <Kantentext x={200} y={154} zeilen={["sauber"]} gedaempft />
      <Kantentext x={312} y={154} zeilen={["Befund"]} gedaempft />
      <Kasten x={14} y={158} breite={156} hoehe={40} zeilen={["wird ausgeliefert"]} ton="ok" />
      <Kasten
        x={190}
        y={158}
        breite={156}
        hoehe={40}
        zeilen={["bleibt gesperrt,", "Fertigmelden verweigert"]}
        ton="achtung"
      />

      <Pfeil punkte={[[92, 198], [92, 212], [180, 212], [180, 224]]} />
      <Kasten
        x={40}
        y={224}
        breite={280}
        hoehe={34}
        zeilen={["Freigabe offen — der Prüfer sieht den Nachweis"]}
        ton="papier"
      />
    </Bildrahmen>
  );
}

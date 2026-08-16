import type { SkizzenBlock } from "../../_lib/hilfe";
import { BILD_SCHRIFT, Bildrahmen, LINIE, STAHL, TINTE } from "./svg";
import s from "../aufgaben.module.css";

/*
 * DIE LAYOUTSKIZZE EINER SICHT — „wo steht was, und wofuer ist es da".
 *
 * ══ WARUM DIESES BILD DAS WICHTIGSTE DER ANLEITUNG IST: die haeufigste Frage vor einer fremden
 *    Flaeche ist nicht „wie geht X", sondern „wo bin ich hier". Ein Fliesztext beantwortet das
 *    schlecht, weil er die ANORDNUNG in Reihenfolge uebersetzen muss; die Anordnung IST aber die
 *    Auskunft. Die Skizze zeigt sie in derselben Reihenfolge von oben nach unten, in der die
 *    Sicht sie zeigt.
 *
 * ══ DIE SKIZZE ZEICHNET KEINE ECHTEN DATEN. Sie zeigt Bereiche, nicht Inhalte — graue Balken, wo
 *    Zeilen stehen. Eine „realistische" Skizze mit erfundenen Aufgabennamen waere ein
 *    Bildschirmabzug mit den Nachteilen beider Formen: sie altert wie ein Abzug und erklaert wie
 *    eine Skizze.
 *
 * ══ NUMMER UND ERKLAERUNG KOMMEN AUS DEMSELBEN OBJEKT (`SkizzenBlock`), und die Legende steht als
 *    ECHTER TEXT unter dem Bild, nicht im SVG. Zwei Gruende: der Text bricht um (SVG nicht, s.
 *    `svg.tsx`), und er ist auffindbar, kopierbar und vorlesbar. Die Nummern der Legende sind die
 *    Listennummern des `<ol>` — es gibt keine zweite Zaehlung, die von der ersten abweichen kann.
 */

/** Die Hoehe eines Blocks je Ausprägung — die einzige Stelle, an der diese Zahlen stehen. */
const HOEHE: Record<SkizzenBlock["form"], number> = {
  kopf: 44,
  karte: 58,
  spalten: 78,
  liste: 60,
  formular: 72,
  band: 26,
  fuss: 26,
};

const RAND = 8;
/** Der Kasten selbst — links davon die Nummernscheibe, rechts der Seitenrand. */
const BLOCK_X = 26;
const BLOCK_B = 324;
/** Der Textrand innerhalb eines Blocks. */
const INNEN = BLOCK_X + 12;

export function Skizze({
  titel,
  bloecke,
}: {
  /** Der Titel der Sicht — er steht in der Bildbeschreibung, damit sie fuer sich allein steht. */
  titel: string;
  bloecke: readonly SkizzenBlock[];
}) {
  /*
   * DIE OBERKANTEN ALS REINE ABLEITUNG, NICHT ALS MITLAUFENDE SUMME: ein `let y`, das die
   * `map`-Rueckrufe fortschreiben, ist eine Zuweisung nach dem Rendern — der React-Compiler lehnt
   * genau das ab (`react-hooks/immutability`, `pnpm lint` bricht damit die CI). Bei sieben
   * Bloecken kostet die quadratische Summe nichts und sagt dafuer klar, dass die Position eines
   * Blocks NUR von den Bloecken darueber abhaengt.
   */
  const oberkante = bloecke.map((_, i) =>
    bloecke.slice(0, i).reduce((summe, vorher) => summe + HOEHE[vorher.form] + RAND, 0),
  );
  const gesamthoehe = bloecke.reduce((summe, block) => summe + HOEHE[block.form] + RAND, 0) - RAND;

  const gezeichnet = bloecke.map((block, i) => {
    const hoehe = HOEHE[block.form];
    const oben = oberkante[i];
    return (
      <g key={block.titel}>
        <circle cx={11} cy={oben + 14} r={8.5} fill="var(--auf-grau-flaeche)" stroke={LINIE} />
        <text
          x={11}
          y={oben + 17.6}
          textAnchor="middle"
          fontSize={9.5}
          fontWeight={600}
          fill="var(--auf-grau-text)"
        >
          {i + 1}
        </text>
        <BlockZeichnung block={block} y={oben} hoehe={hoehe} />
      </g>
    );
  });

  return (
    <Bildrahmen
      titel={`Aufbau der Sicht „${titel}“`}
      beschreibung={`Aufbau der Sicht „${titel}“ von oben nach unten: ${bloecke
        .map((b, i) => `${i + 1}. ${b.titel}`)
        .join("; ")}.`}
      hoehe={Math.max(gesamthoehe, 1)}
      unterschrift={
        <ol className={s.hilfeLegende}>
          {bloecke.map((block) => (
            <li key={block.titel}>
              <strong>{block.titel}</strong> — {block.erklaerung}
            </li>
          ))}
        </ol>
      }
    >
      {gezeichnet}
    </Bildrahmen>
  );
}

function BlockZeichnung({
  block,
  y,
  hoehe,
}: {
  block: SkizzenBlock;
  y: number;
  hoehe: number;
}) {
  const flaeche =
    block.form === "karte"
      ? "var(--auf-fuehrung)"
      : block.form === "liste" || block.form === "formular"
        ? "var(--auf-karte)"
        : "var(--auf-papier)";

  return (
    <>
      {block.form === "fuss" ? null : (
        <rect
          x={BLOCK_X}
          y={y}
          width={BLOCK_B}
          height={hoehe}
          rx={6}
          fill={flaeche}
          stroke={LINIE}
        />
      )}

      {block.form === "kopf" ? (
        <>
          <rect x={INNEN} y={y + 8} width={52} height={3.5} rx={1.75} fill={STAHL} opacity={0.5} />
          <Titelzeile x={INNEN} y={y + 26} text={block.titel} />
          <rect x={INNEN} y={y + 32} width={150} height={3.5} rx={1.75} fill={STAHL} opacity={0.35} />
        </>
      ) : null}

      {block.form === "karte" ? (
        <>
          <Titelzeile x={INNEN} y={y + 21} text={block.titel} />
          <rect x={INNEN} y={y + 30} width={96} height={17} rx={8.5} fill={TINTE} />
          <text
            x={INNEN + 48}
            y={y + 41.5}
            textAnchor="middle"
            fontSize={9}
            fill="var(--auf-karte)"
          >
            Aktion
          </text>
          <rect x={INNEN + 108} y={y + 37} width={96} height={3.5} rx={1.75} fill={STAHL} opacity={0.35} />
        </>
      ) : null}

      {block.form === "spalten" ? (
        <>
          <Titelzeile x={INNEN} y={y + 19} text={block.titel} />
          <Spalten kopfzeilen={block.spalten ?? []} y={y + 26} />
        </>
      ) : null}

      {block.form === "liste" ? (
        <>
          <Titelzeile x={INNEN} y={y + 19} text={block.titel} />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect
                x={INNEN}
                y={y + 30 + i * 11}
                width={150 - i * 18}
                height={4}
                rx={2}
                fill={TINTE}
                opacity={0.5}
              />
              <rect
                x={BLOCK_X + BLOCK_B - 58}
                y={y + 28 + i * 11}
                width={46}
                height={8}
                rx={4}
                fill="var(--auf-grau-flaeche)"
              />
            </g>
          ))}
        </>
      ) : null}

      {block.form === "formular" ? (
        <>
          <Titelzeile x={INNEN} y={y + 19} text={block.titel} />
          {[0, 1].map((i) => (
            <g key={i}>
              <rect x={INNEN} y={y + 27 + i * 23} width={54} height={3.5} rx={1.75} fill={STAHL} opacity={0.5} />
              <rect
                x={INNEN}
                y={y + 33 + i * 23}
                width={220}
                height={13}
                rx={3}
                fill="var(--auf-papier)"
                stroke={LINIE}
              />
            </g>
          ))}
        </>
      ) : null}

      {block.form === "band" ? <Titelzeile x={INNEN} y={y + 17} text={block.titel} /> : null}

      {block.form === "fuss" ? (
        <text x={INNEN} y={y + 16} fontSize={BILD_SCHRIFT.kasten} fill={STAHL}>
          {block.titel}
        </text>
      ) : null}
    </>
  );
}

function Titelzeile({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text x={x} y={y} fontSize={BILD_SCHRIFT.kasten} fontWeight={600} fill={TINTE}>
      {text}
    </text>
  );
}

/**
 * DIE SPALTEN EINER TAGES- ODER PERSONENACHSE. Die Breite kommt aus der ANZAHL, nicht aus einer
 * festen Zahl: fuenf Wochentage und drei Personen sind dieselbe Zeichnung mit anderer Teilung —
 * eine feste Spaltenbreite waere hier derselbe Fehler wie ein `repeat(5, …)` im Wochengitter.
 */
function Spalten({ kopfzeilen, y }: { kopfzeilen: readonly string[]; y: number }) {
  const anzahl = Math.max(kopfzeilen.length, 1);
  const gesamt = BLOCK_B - 24;
  const abstand = 6;
  const breite = (gesamt - abstand * (anzahl - 1)) / anzahl;
  return (
    <>
      {kopfzeilen.map((kopf, i) => {
        const x = INNEN + i * (breite + abstand);
        return (
          <g key={kopf}>
            <rect x={x} y={y} width={breite} height={42} rx={4} fill="var(--auf-karte)" stroke={LINIE} />
            <text
              x={x + breite / 2}
              y={y + 12}
              textAnchor="middle"
              fontSize={9}
              fontWeight={600}
              fill={STAHL}
            >
              {kopf}
            </text>
            <rect x={x + 5} y={y + 18} width={breite - 10} height={9} rx={2} fill="var(--auf-grau-flaeche)" />
            <rect x={x + 5} y={y + 30} width={breite - 10} height={7} rx={2} fill={STAHL} opacity={0.25} />
          </g>
        );
      })}
    </>
  );
}

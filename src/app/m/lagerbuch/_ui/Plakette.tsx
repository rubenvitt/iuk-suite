import type { Ampel } from "../_lib/domain/verfall";
import { ampelTon, fmtVerfall } from "../_lib/format";
import { ampelVar } from "../_lib/ampel";

/**
 * SVG-Attribute muessen auf Server und Client bytegleich serialisieren.
 * Trigonometrische Funktionen duerfen zwischen JavaScript-Laufzeiten in den
 * letzten Bits abweichen; drei Nachkommastellen sind fuer 40 CSS-Pixel weit
 * unterhalb der sichtbaren Aufloesung und entfernen diese Hydrationsfalle.
 */
function svgKoordinate(wert: number): number {
  return Number(wert.toFixed(3));
}

/**
 * DIE VERFALLS-PLAKETTE — ein 40x40-Zifferblatt mit zwoelf Monatsstrichen, bei
 * dem der Verfallsmonat als laengerer, dickerer Strich hervortritt. Ein
 * antd-Gegenstueck gibt es nicht.
 *
 * KEIN "use client": sie steht auf der Verfallsliste (RSC) und in der
 * Artikeltabelle (Insel).
 *
 * DREI KORREKTUREN gegenueber `lagerbuch/src/components/Plakette.tsx`, alle
 * heute schon faellig (§6.4.8):
 *
 * 1. DAS aria-label NENNT DEN STATUS. Heute lautet es
 *    `Verfall ${fmtVerfall(verfall)}` — es nennt das DATUM, nie den Zustand;
 *    die Farbe traegt ihn allein. Dass die Bildschirme „Bedeutung nie allein
 *    ueber Farbe" trotzdem erfuellen, liegt am UMFELD: an allen vier Stellen
 *    steht ein Textchip daneben. Der Verstosz liegt im Zusicherungsvertrag der
 *    Komponente — als role="img" mit unvollstaendigem Label ist sie
 *    alleinstehend unbrauchbar.
 *
 * 2. DIE DREI FESTEN FARBWERTE FALLEN. `fill="#fff"`, `var(--tinte)` fuer die
 *    Ziffern und `#C7CDD1` fuer die inaktiven Striche — im Dunkelmodus bliebe
 *    sie sonst eine WEISZE SCHEIBE. Sie beziehen ihre Werte jetzt aus den
 *    `--lb-*`-Modulvariablen, die beide Modi fuehren.
 *
 * 3. DIE AMPELFARBEN KOMMEN AUS `_lib/ampel.ts` und sind damit
 *    luminanz-monoton. Das ist der Punkt, an dem Entscheidung 30, Option (d)
 *    („nur die hellen Chip-Hintergruende neu ordnen") scheitert: die Plakette
 *    fuehrt GAR KEINEN Text und traegt die Bedeutung ausschlieszlich in Ring
 *    und Strich.
 *
 * DIE FARBE KOMMT ALS `var(--lb-ampel-*)`, NICHT AUS `AMPEL_HELL`. Ein
 * `stroke={AMPEL_HELL.rot.text}` waere im Dunkelmodus falsch, und die
 * Komponente kann den Modus nicht kennen — er ist reines CSS.
 *
 * `statusText` IST EIN PROP UND WIRD HIER NICHT GERECHNET. Was an einer Uhr
 * haengt, entsteht auf dem Server (§6.2.1, Regel 1): rechnete der Browser es,
 * entschieden Server und Client an der Tagesgrenze verschieden — und gegen die
 * Zone des Endgeraets sogar systematisch. Der Aufrufer uebergibt
 * `chargeText(status, verfall)` aus `_lib/format.ts`.
 */
export function Plakette({
  verfall,
  ampel,
  statusText,
}: {
  verfall: string;
  ampel: Ampel;
  statusText: string;
}) {
  // `gruen` -> `ok`: ein direkt interpoliertes `--lb-ampel-${ampel}-text`
  // ergaebe `--lb-ampel-gruen-text`. Das ist nirgends deklariert, faellt auf
  // `transparent` zurueck und ist GUELTIGES CSS — der Ring verschwaende
  // einfach. `ampelTon` ist die eine Stelle, die diese Abbildung kennt.
  const farbe = `var(${ampelVar(ampelTon(ampel), "text")})`;
  const monat = Number(verfall.split("-")[1]);

  const striche = [];
  for (let i = 0; i < 12; i++) {
    const winkel = ((i * 30 - 90) * Math.PI) / 180;
    const aktiv = i === monat - 1;
    const r1 = aktiv ? 13.5 : 15.2;
    const r2 = 18.6;
    striche.push(
      <line
        key={i}
        x1={svgKoordinate(20 + r1 * Math.cos(winkel))}
        y1={svgKoordinate(20 + r1 * Math.sin(winkel))}
        x2={svgKoordinate(20 + r2 * Math.cos(winkel))}
        y2={svgKoordinate(20 + r2 * Math.sin(winkel))}
        stroke={aktiv ? farbe : "var(--lb-linie)"}
        strokeWidth={aktiv ? 3.4 : 1.7}
        strokeLinecap="round"
      />,
    );
  }

  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      role="img"
      aria-label={`Verfall ${fmtVerfall(verfall)} — ${statusText}`}
      style={{ flex: "none" }}
    >
      <circle cx="20" cy="20" r="19" fill="var(--lb-karte)" stroke={farbe} strokeWidth="1.6" />
      {striche}
      <text
        x="20"
        y="23.4"
        textAnchor="middle"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "8.6px",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          fill: "var(--lb-tinte)",
        }}
      >
        {fmtVerfall(verfall)}
      </text>
    </svg>
  );
}

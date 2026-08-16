import type { ReactNode } from "react";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import s from "../aufgaben.module.css";

/*
 * DIE ZEICHENBAUSTEINE DER ANLEITUNGSBILDER — Inline-SVG, kein Bildformat, keine Bibliothek.
 *
 * ══ WARUM INLINE-SVG UND KEINE BILDSCHIRMABZUEGE: ein Abzug ist am Tag nach dem naechsten
 *    Oberflaechenumbau falsch und sagt es niemandem. Er kennt ausserdem nur EINEN Modus — die
 *    Suite hat hell UND dunkel (`<html data-theme>`), und ein helles PNG auf dunklem Grund ist
 *    der Fremdkoerper, den man sofort sieht. Diese Bilder ziehen ihre Farben aus denselben
 *    `--auf-*`-Variablen wie die Flaechen, die sie erklaeren, und wechseln deshalb mit.
 *
 * ══ WARUM 360 EINHEITEN BREIT, IMMER: die Bilder skalieren mit `width: 100%`, und die Schrift
 *    IM Bild skaliert mit. Ein 900 Einheiten breites Bild auf einem 360px-Telefon macht aus 10
 *    Einheiten Schrift 4 Pixel — lesbar ist das nicht mehr. Bei 360 Einheiten liegt der Faktor
 *    zwischen 0,9 (schmales Telefon) und 1,2 (die gedeckelte Bildbreite), die Schrift bleibt
 *    also in ihrer Groessenordnung. DIE FOLGE IST EINE ENTWURFSREGEL, KEINE ZAHL: jedes Bild
 *    dieses Moduls flieszt SENKRECHT. Waagerechte Ablaufketten gibt es hier nicht.
 *
 * ══ KEINE `<marker>`-PFEILSPITZEN: `marker-end` verlangt eine `id`, und `id` ist im ganzen
 *    Dokument eindeutig — mehrere Bilder auf einer Seite (die Kapitel haben zwei bis drei)
 *    teilten sich dann eine Definition, und ein spaeteres Bild ueberschriebe still die Spitze des
 *    frueheren. Die Spitze ist deshalb ein gezeichnetes Dreieck ohne jede `id`.
 *
 * ══ KEIN `@ant-design/icons` (Falle 7), KEIN `Typography` (Falle 1), KEIN "use client"
 *    (Falle 6): diese Datei ist eine Server Component und rendert nur natives SVG.
 */

/** Die Toene, die ein Kasten tragen kann — je ein Paar aus Flaeche und Schrift aus `aufgaben.module.css`. */
export type Ton = "papier" | "karte" | "fuehrung" | "ok" | "ocker" | "achtung" | "stahl" | "grau";

const FLAECHE: Record<Ton, string> = {
  papier: "var(--auf-papier)",
  karte: "var(--auf-karte)",
  fuehrung: "var(--auf-fuehrung)",
  ok: "var(--auf-ok-flaeche)",
  ocker: "var(--auf-ocker-flaeche)",
  achtung: "var(--auf-achtung-flaeche)",
  stahl: "var(--auf-stahl-flaeche)",
  grau: "var(--auf-grau-flaeche)",
};

const SCHRIFTFARBE: Record<Ton, string> = {
  papier: "var(--auf-tinte)",
  karte: "var(--auf-tinte)",
  fuehrung: "var(--auf-tinte)",
  ok: "var(--auf-ok-text)",
  ocker: "var(--auf-ocker-text)",
  achtung: "var(--auf-achtung-text)",
  stahl: "var(--auf-stahl-text)",
  grau: "var(--auf-grau-text)",
};

export const LINIE = "var(--auf-linie)";
export const TINTE = "var(--auf-tinte)";
export const STAHL = "var(--auf-stahl)";

/** Schriftgroeszen IM Bild. Zwei, nicht fuenf — ein Bild ist keine Seite. */
export const BILD_SCHRIFT = { kasten: 11, kante: 9.5 } as const;

/**
 * EIN BESCHRIFTETER KASTEN. `zeilen` ist eine LISTE, weil SVG nicht umbricht: was in einer Zeile
 * stehen soll, entscheidet der Aufrufer, nicht der Textfluss. Ein `<text>` mit zu langem Inhalt
 * laeuft in SVG stillschweigend ueber den Rand hinaus — es gibt keinen Umbruch, den man vergessen
 * koennte, nur einen, den man selbst setzen muss.
 */
export function Kasten({
  x,
  y,
  breite,
  hoehe,
  zeilen,
  ton = "karte",
  gestrichelt = false,
  fett = false,
}: {
  x: number;
  y: number;
  breite: number;
  hoehe: number;
  zeilen: readonly string[];
  ton?: Ton;
  gestrichelt?: boolean;
  fett?: boolean;
}) {
  const mitte = x + breite / 2;
  const zeilenhoehe = BILD_SCHRIFT.kasten + 2.5;
  const start = y + hoehe / 2 - ((zeilen.length - 1) * zeilenhoehe) / 2 + BILD_SCHRIFT.kasten * 0.36;
  return (
    <>
      <rect
        x={x}
        y={y}
        width={breite}
        height={hoehe}
        rx={6}
        fill={FLAECHE[ton]}
        stroke={LINIE}
        strokeWidth={1}
        strokeDasharray={gestrichelt ? "4 3" : undefined}
      />
      {zeilen.map((zeile, i) => (
        <text
          key={zeile}
          x={mitte}
          y={start + i * zeilenhoehe}
          textAnchor="middle"
          fontSize={BILD_SCHRIFT.kasten}
          fontWeight={fett ? 600 : 400}
          fill={SCHRIFTFARBE[ton]}
        >
          {zeile}
        </text>
      ))}
    </>
  );
}

/**
 * EIN PFEIL ENTLANG EINER PUNKTFOLGE, mit gezeichneter Spitze am letzten Punkt.
 *
 * Die Richtung der Spitze kommt aus dem LETZTEN Segment, nicht aus einem Argument: eine von Hand
 * gesetzte Richtung ist die Angabe, die beim naechsten Verschieben eines Punktes nicht mitwandert.
 */
export function Pfeil({
  punkte,
  gestrichelt = false,
  farbe = TINTE,
}: {
  punkte: readonly (readonly [number, number])[];
  gestrichelt?: boolean;
  farbe?: string;
}) {
  const [zx, zy] = punkte[punkte.length - 1];
  const [vx, vy] = punkte[punkte.length - 2];
  const laenge = Math.hypot(zx - vx, zy - vy) || 1;
  const ex = (zx - vx) / laenge;
  const ey = (zy - vy) / laenge;
  // Das Dreieck: Spitze am Zielpunkt, Basis 5 Einheiten davor, 3 Einheiten nach beiden Seiten.
  const bx = zx - ex * 5;
  const by = zy - ey * 5;
  const spitze = `${zx},${zy} ${bx - ey * 3},${by + ex * 3} ${bx + ey * 3},${by - ex * 3}`;
  return (
    <>
      <polyline
        points={punkte.map(([px, py]) => `${px},${py}`).join(" ")}
        fill="none"
        stroke={farbe}
        strokeWidth={1.2}
        strokeDasharray={gestrichelt ? "4 3" : undefined}
      />
      <polygon points={spitze} fill={farbe} />
    </>
  );
}

/** Eine Kantenbeschriftung — mehrzeilig, weil SVG nicht umbricht (s. `Kasten`). */
export function Kantentext({
  x,
  y,
  zeilen,
  anker = "start",
  gedaempft = false,
  gedreht = false,
}: {
  x: number;
  y: number;
  zeilen: readonly string[];
  anker?: "start" | "middle" | "end";
  gedaempft?: boolean;
  gedreht?: boolean;
}) {
  const inhalt = zeilen.map((zeile, i) => (
    <text
      key={zeile}
      x={x}
      y={y + i * (BILD_SCHRIFT.kante + 2)}
      textAnchor={anker}
      fontSize={BILD_SCHRIFT.kante}
      fill={gedaempft ? STAHL : TINTE}
    >
      {zeile}
    </text>
  ));
  return gedreht ? <g transform={`rotate(-90 ${x} ${y})`}>{inhalt}</g> : <>{inhalt}</>;
}

/**
 * DER RAHMEN JEDES BILDES — `<figure>` mit Bildunterschrift.
 *
 * `role="img"` PLUS `aria-label` UND EIN `<title>` IM SVG: ohne die Rolle liest ein Screenreader
 * die einzelnen `<text>`-Knoten als zusammenhanglose Wortfolge vor („verteilt starten in Arbeit
 * fertig melden …") — das ist schlechter als gar nichts. Mit der Rolle ist das Bild EIN Objekt
 * mit EINER Beschreibung. Die Bilder tragen ihre Aussage zusaetzlich als Text daneben (die
 * Legende bzw. die Uebergangstabelle), sie sind also nie der einzige Traeger einer Information.
 */
export function Bildrahmen({
  titel,
  beschreibung,
  hoehe,
  breite = 360,
  unterschrift,
  breiteUnterschrift = false,
  children,
}: {
  titel: string;
  /** Was das Bild sagt — fuer Screenreader die vollstaendige Auskunft, nicht eine Andeutung. */
  beschreibung: string;
  hoehe: number;
  breite?: number;
  unterschrift?: ReactNode;
  /**
   * DIE UNTERSCHRIFT DARF BREITER SEIN ALS DAS BILD — gebraucht fuer die vierspaltige
   * Uebergangstabelle unter dem Lebenszyklusbild. Gemessen im Abzug: auf 420px brach sie
   * „zurückgewiesen" mitten im Wort um (`table-layout: fixed` teilt vier Spalten zu je 105px auf).
   * Das BILD bleibt trotzdem bei 420 — es skaliert mit seinem Rahmen, und ein 640 breites
   * Schaubild haette 17px-Schrift neben 14px-Text.
   */
  breiteUnterschrift?: boolean;
  children: ReactNode;
}) {
  return (
    /*
     * `maxWidth` INLINE UND NICHT IN `aufgaben.module.css`: dort ist genau EIN `max-width`-Wert
     * zugelassen (der Suite-Breakpoint), damit ein Scan jeden zweiten, selbst erfundenen
     * Breakpoint findet — die Begruendung steht bei `.hilfeBild`. Die Zahl ist die Gegenseite zu
     * den 360 Einheiten des `viewBox`: ohne Deckel skalierte ein Bild auf 1000px mit, und die 11
     * Einheiten Schrift darin waeren dort 30px gross — ein Bild, das schreit, waehrend der Text
     * daneben 14px hat.
     */
    <figure className={s.hilfeBild} style={{ maxWidth: breiteUnterschrift ? 640 : 420 }}>
      <svg
        viewBox={`0 0 ${breite} ${hoehe}`}
        role="img"
        aria-label={beschreibung}
        style={{ width: "100%", maxWidth: 420, height: "auto", display: "block" }}
      >
        <title>{titel}</title>
        {children}
      </svg>
      {unterschrift ? (
        <figcaption style={{ ...SCHRIFT.neben, marginBlockStart: SPACE.sm, color: "var(--auf-stahl)" }}>
          {unterschrift}
        </figcaption>
      ) : null}
    </figure>
  );
}

"use client";

/**
 * EINE SEITE, EIN SCROLLER — der Rahmen um Werkzeugleiste und Tabelle
 * (DRK-334).
 *
 * ⚠️ DAS PROBLEM ENTSTEHT ERST DURCH DIE VIRTUALISIERUNG, und es sieht nach
 * einem Rundungsfehler aus. Eine virtuelle Tabelle verlangt eine feste
 * Körperhöhe (`scroll.y`), und eine feste Höhe ist ein eigener
 * Scrollcontainer. Auf einer Modulseite gibt es aber schon einen: das DOKUMENT.
 * Auf dem Telefon standen damit zwei senkrechte Scroller ineinander — und weil
 * der äußere nur wenige Dutzend Pixel Weg hatte (die Höhe des Tabellenkopfes,
 * siehe `vollhoehe.ts`), reagierte mal der eine, mal der andere.
 *
 * Die Antwort ist nicht, die Virtualisierung abzuschalten — dann stünden bei
 * 800 Artikeln alle Zeilen im DOM, ausgerechnet auf dem schwächsten Gerät.
 * Stattdessen hört die SEITE auf zu scrollen: der Rahmen ist genau so hoch wie
 * der sichtbare Bereich, die Werkzeugleiste bleibt oben stehen, und der
 * Tabellenkörper bekommt den Rest.
 *
 * ⚠️ WARUM EIN RENDER-PROP UND KEIN GEWÖHNLICHES `children`: die Zahl, die hier
 * gemessen wird, ist genau die, die die Tabelle als `virtuell` braucht. Ein
 * Kontext dafür wäre eine Fernwirkung für einen einzigen Wert, ein zweiter
 * Hook im Aufrufer eine zweite Messung derselben Sache — und zwei Messungen
 * driften auseinander, sobald eine von beiden vergessen wird.
 *
 * Nicht mit `flyinBreite` (Falle 13) verwechseln: dort reicht ein CSS-`min()`,
 * weil nur die Fensterbreite zählt. Hier hängt die Zahl an der Oberkante der
 * Tabelle, und die kennt CSS nicht.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SPACE } from "../theme/tokens";
import { vollhoehe } from "./vollhoehe";
import schmal from "./schmalkarten.module.css";
import stil from "./vollhoehe.module.css";

/**
 * ⚠️ DER STARTWERT IST EINE ZAHL, KEIN `false`. Käme vor der ersten Messung
 * `false` zurück, rendert die Tabelle einen Atemzug lang gewöhnlich und springt
 * dann in den virtuellen Modus — dabei wechselt rc-table auf
 * `table-layout: fixed` und alle Spaltenbreiten verschieben sich sichtbar. Ein
 * plausibler Startwert kostet dagegen nur eine leicht falsche erste Höhe, die
 * die erste Messung sofort korrigiert.
 */
const STARTWERT = 560;

/**
 * Der Scrollcontainer einer virtuellen Tabelle. Der Klassenname ist hier
 * unvermeidlich: rc-virtual-list vergibt kein eigenes Merkmal, an das man
 * greifen könnte — dieselbe Kopplung, die `vollhoehe.module.css` schon eingeht.
 *
 * ⚠️ ER IST ZUGLEICH DIE PROBE, OB ÜBERHAUPT VIRTUALISIERT WIRD. Unterhalb von
 * `VIRTUELL_AB_ZEILEN` bleibt die Tabelle gewöhnlich und hat gar keinen eigenen
 * Scroller; ein Rahmen mit `overflow: hidden` schnitte ihre unteren Zeilen dann
 * ersatzlos ab. Statt die Schwelle hier ein zweites Mal nachzurechnen (und beim
 * nächsten Mal anders), fragt der Rahmen das Ergebnis: kein Körper, keine
 * Deckelung.
 */
const KOERPER = ".ant-table-tbody-virtual-holder";

/**
 * Die Kartenliste, die unter 768px an die Stelle der Tabelle tritt (DRK-451).
 *
 * ⚠️ IHRE ANWESENHEIT HEBT DIE DECKELUNG AUF, UND OHNE DIESE ZEILE WÄRE SIE
 * ABGESCHNITTEN. Die Deckelung gilt ausschließlich unter 768px, und sie
 * existiert für genau einen Zweck: der virtuelle Tabellenkörper ist dort ein
 * zweiter Scroller neben dem Dokument (Falle 16). Ersetzt eine Kartenliste die
 * Tabelle, gibt es diesen zweiten Scroller gar nicht — die Liste scrollt mit
 * dem Dokument. Ein Rahmen mit `overflow: hidden` schnitte sie dann bei der
 * Fensterhöhe ab, und alles darunter wäre unerreichbar.
 *
 * ⚠️ DER TABELLENKÖRPER BLEIBT DABEI MESSBAR, UND GENAU DAS IST DIE FALLE.
 * `display: none` nimmt die Tabelle aus dem Bild, nicht aus dem DOM:
 * `querySelector` findet ihren virtuellen Körper weiterhin, nur liefert
 * `getBoundingClientRect()` dann Nullen. `deckeln` bliebe also wahr, und die
 * gerechnete Höhe käme aus lauter Nullen — die Seite stünde unter 768px auf
 * einer sinnlosen Zahl mit `overflow: hidden`.
 *
 * ⚠️ ERKANNT WIRD ES AM DOM, NICHT AN EINER PROP. Eine Prop müsste jeder
 * Aufrufer setzen, der eine `Kartentabelle` hineinstellt — fünfzigmal, und wer
 * sie vergisst, bekommt eine abgeschnittene Liste, die kein Tor findet.
 * Gemessen wird in derselben Runde wie der Tabellenkörper.
 *
 * ⚠️ ÜBER DIE KLASSE, NICHT ÜBER `data-rolle` — UND DAS IST EINE MESSUNG, KEIN
 * GESCHMACK. Der erste Anlauf suchte `[data-rolle="schmalkarten"],
 * [data-rolle="schmalkarten-leer"]`; diese Suche läuft nach JEDEM Render über
 * den ganzen Tabellenteilbaum, und eine Attributselektor-LISTE zwingt jsdoms
 * nwsapi dazu, jedes Element einzeln zu prüfen. Gemessen an
 * `InventurForm.renderkosten.test.tsx` (120 Zeilen, unterhalb der
 * Virtualisierungsschwelle, also 120 echte Zeilen im Baum): der Fall lief in
 * sein 5-Sekunden-Budget, vorher brauchte er rund eine. Ein Klassenselektor
 * geht über einen Index und kostet nichts. ⚠️ Kein Tor hätte das als
 * LEISTUNGSproblem gemeldet — es kam als Zeitüberschreitung in einem Test, der
 * Renderkosten zählt und mit dieser Datei nichts zu tun hat.
 *
 * ⚠️ NUR DIE GEFÜLLTE LISTE, nicht der Leertext. Eine leere Kartenliste hat
 * nichts, was eine Deckelung abschneiden könnte — und ist die Liste leer, ist
 * es die Tabelle auch, dann gibt es ohnehin keinen virtuellen Körper und keine
 * Deckelung.
 */
const KARTEN = `.${schmal.karten}`;

export type TabellenVollhoeheProps = {
  /** Werkzeugleiste, Hinweise, alles über der Tabelle. */
  kopf?: ReactNode;
  /** Die Tabelle, mit der gemessenen Körperhöhe für `virtuell`. */
  children: (koerperHoehe: number) => ReactNode;
  /** Unter dieser Körperhöhe wird die Deckelung aufgegeben. */
  mindestens?: number;
  /** Luft unter dem Rahmen; Vorgabe ist der Innenabstand von `SuiteRahmen`. */
  rand?: number;
};

type Mass = { rahmenHoehe: number; koerperHoehe: number; deckeln: boolean };

export function TabellenVollhoehe({
  kopf,
  children,
  mindestens = 320,
  rand = SPACE.lg,
}: TabellenVollhoeheProps) {
  const rahmenRef = useRef<HTMLDivElement>(null);
  const tabellenRef = useRef<HTMLDivElement>(null);
  const [mass, setMass] = useState<Mass>({
    rahmenHoehe: 0,
    koerperHoehe: STARTWERT,
    deckeln: false,
  });

  const messen = useCallback(() => {
    const rahmen = rahmenRef.current;
    const tabelle = tabellenRef.current;
    if (!rahmen || !tabelle) return;

    const koerper = tabelle.querySelector<HTMLElement>(KOERPER);
    const karten = tabelle.querySelector<HTMLElement>(KARTEN);
    const tabelleOben = tabelle.getBoundingClientRect().top;
    const ergebnis = vollhoehe({
      fensterHoehe: window.innerHeight,
      rahmenOben: rahmen.getBoundingClientRect().top,
      tabelleOben,
      // Alles, was über dem Körper liegt — Spaltenkopf, Rahmenlinien, was
      // rc-table sonst noch dazwischenschiebt. Gemessen statt aufgezählt: eine
      // Aufzählung wäre beim nächsten antd-Minor still unvollständig.
      tabellenkopfHoehe: koerper ? koerper.getBoundingClientRect().top - tabelleOben : 0,
      rand,
      mindestens,
    });

    // `setState` mit gleichen Werten rendert nicht neu — wichtig, weil der
    // ResizeObserver unten auch auf Änderungen feuert, die wir selbst auslösen.
    setMass((vorher) => {
      const neu: Mass = {
        rahmenHoehe: ergebnis.rahmenHoehe,
        koerperHoehe: ergebnis.koerperHoehe,
        // `karten !== null` heißt: unter 768px steht hier gar keine Tabelle,
        // also auch kein zweiter Scroller — Begründung bei `KARTEN`.
        deckeln: koerper !== null && karten === null && !ergebnis.gedeckelt,
      };
      return vorher.rahmenHoehe === neu.rahmenHoehe
        && vorher.koerperHoehe === neu.koerperHoehe
        && vorher.deckeln === neu.deckeln
        ? vorher
        : neu;
    });
  }, [mindestens, rand]);

  /**
   * ⚠️ NACH JEDEM RENDER NEU MESSEN — OHNE ABHAENGIGKEITSFELD, UND DAS IST DER
   * TEIL, DEN DIE BEOBACHTER NICHT LEISTEN KOENNEN.
   *
   * Die Deckelung haengt daran, ob es einen virtuellen Koerper GIBT. Den gibt
   * es aber nur oberhalb von `VIRTUELL_AB_ZEILEN`: filtert jemand die Liste
   * darunter — eine Suche, eine ausgeblendete Kategorie —, schaltet
   * `Datentabelle` die Virtualisierung ab, der Koerper verschwindet, und die
   * Tabelle ist wieder eine gewoehnliche mit voller Hoehe.
   *
   * Beide `ResizeObserver` sind fuer genau diesen Moment BLIND, und zwar
   * systematisch: unterhalb von 768px steht die Rahmenhoehe fest (`block-size:
   * var(--tab-vollhoehe)`) und die Tabellenhoehe ergibt sich aus dem Flexraum
   * daneben — keiner der beiden Kaesten aendert seine Groesse, wenn sich der
   * INHALT aendert. Es feuert also nichts, `deckeln` bliebe stehen, und ein
   * Rahmen mit `overflow: hidden` schnitte die unteren Zeilen einer Tabelle ab,
   * die gar keinen eigenen Scroller mehr hat. Am Schreibtisch faellt das nicht
   * auf: dort ist der Rahmen inhaltshoch, und der Beobachter feuert.
   *
   * Ein Render ist dagegen genau das Signal, das dabei immer kommt — die Liste
   * aendert sich nur, weil der Aufrufer neu rendert. Der Preis ist ein
   * Layout-Lesen je Render; `setMass` bricht bei gleichen Werten ab, es gibt
   * also keine zweite Runde.
   *
   * ⚠️ `useEffect`, NICHT `useLayoutEffect`: die Komponente wird
   * servergerendert, und `useLayoutEffect` warnt dort. Der Preis ist ein
   * einzelnes Bild mit dem alten Zustand — unsichtbar, weil es um das
   * Ein- und Ausschalten einer Deckelung geht, nicht um einen Sprung.
   */
  useEffect(messen);

  useEffect(() => {
    messen();
    window.addEventListener("resize", messen);
    /**
     * ⚠️ EINE EINMAL GEMESSENE ZAHL WÄRE BEIM ÖFFNEN RICHTIG UND DANACH STILL
     * FALSCH. Die Tabelle rutscht auch ohne Größenänderung des Fensters: eine
     * eingeblendete Sammelleiste, ein Hinweis, eine umbrechende
     * Werkzeugleiste — alles verschiebt ihre Oberkante. Dieselbe Klasse wie
     * Falle 13, wo eine feste Schubladenbreite auf einem niedrigen Schirm
     * nicht zu schmal für das Fenster ist, sondern für den Inhalt.
     */
    const beobachter = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(messen)
      : null;
    if (beobachter && rahmenRef.current) beobachter.observe(rahmenRef.current);
    if (beobachter && tabellenRef.current) beobachter.observe(tabellenRef.current);
    return () => {
      window.removeEventListener("resize", messen);
      beobachter?.disconnect();
    };
  }, [messen]);

  return (
    <div
      ref={rahmenRef}
      // DER GRIFF FUER PLAYWRIGHT. Ohne ihn muesste ein Test den Rahmen ueber
      // einen antd-internen Klassennamen oder ueber die Zeichenkette im
      // `style`-Attribut suchen — beides bricht still, sobald sich an antd oder
      // an der Schreibweise etwas aendert.
      data-rolle="tabellenrahmen"
      // ⚠️ DIE VARIABLE WIRD IMMER GESETZT; OB SIE GILT, ENTSCHEIDET DIE MEDIA
      // QUERY im CSS-Modul. Ein JS-Breakpoint zeigte beim ersten Render die
      // falsche Variante — dieselbe Begründung wie am App-Umschalter in
      // `shell.module.css`, und `Grid.useBreakpoint` ist in dieser Suite
      // ohnehin verboten.
      className={mass.deckeln ? stil.vollhoehe : undefined}
      style={{ "--tab-vollhoehe": `${mass.rahmenHoehe}px` } as CSSProperties}
    >
      {kopf}
      <div ref={tabellenRef} className={stil.tabelle}>
        {children(mass.koerperHoehe)}
      </div>
    </div>
  );
}

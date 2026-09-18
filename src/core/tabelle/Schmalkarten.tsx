"use client";

/**
 * EINE TABELLE, DIE AUF DEM TELEFON EINE LISTE IST (DRK-421).
 *
 * ⚠️ WAS SIE LÖST, UND WARUM DIE BISHERIGE ANTWORT NICHT REICHT.
 * `docs/design/README.md` sagt: „antd-`Table` scrollt auf schmalen Geräten, sie
 * bricht nicht um" — eine umgebrochene Tabellenzeile ist unlesbarer als eine
 * gescrollte. Das stimmt für eine Tabelle, die man LIEST. Es hört auf zu
 * stimmen, sobald in einer Zeile etwas zu BEDIENEN ist: bei der Inventur steht
 * der Zähl-Stepper in der achten von acht Spalten, und wer ihn auf 390px vor
 * sich hat, sieht den Artikelnamen nicht mehr, zu dem er zählt. Waagerechtes
 * Scrollen macht aus einer Zeile zwei Blicke.
 *
 * ⚠️ DIE UMSCHALTUNG IST CSS, NIE JAVASCRIPT. `Grid.useBreakpoint` ist in
 * dieser Suite verboten, und ein JS-Breakpoint zeigte beim ersten Render die
 * falsche Variante. Beide Darstellungen liegen im HTML, die Media Query blendet
 * eine aus — dasselbe Vorgehen wie `feedback/_ui/Verlauf.tsx`, das diese Lösung
 * seit Langem trägt.
 *
 * ⚠️ UND DAMIT IST EINE ZWEITE FRAGE GESTELLT, DIE MAN LEICHT ÜBERSIEHT: beide
 * Darstellungen im HTML heißt bei 600 Zeilen 600 Karten AM SCHREIBTISCH, wo sie
 * niemand sieht. Beim Feedback-Verlauf spielt das keine Rolle (dort stehen
 * Dutzende Abende), bei einer Artikelliste sehr wohl.
 *
 * DIE KOSTEN SIND GEMESSEN STATT GESCHÄTZT — echter Chromium, 1280×720, 612
 * Artikel, drei Läufe, bis ein Knopf DER TABELLE bedienbar ist:
 *
 * ```
 *                 DOM-Knoten     bis bedienbar
 * mit Karten          21 041     60 / 85 / 93 ms
 * ohne Karten            833     39 / 58 / 53 ms
 * ```
 *
 * Also rund 30 ms und 20 000 Knoten für eine Darstellung, die am Schreibtisch
 * niemand sieht. Das ist der Preis, und er ist bewusst bezahlt: die Alternative
 * wäre, die Liste in JavaScript zu fenstern — also eine zweite Stelle, an der
 * über Sichtbarkeit entschieden wird, neben der Media Query. Solange die Zahl
 * so aussieht, ist das der schlechtere Tausch. Wächst sie (eine Liste mit
 * Tausenden Zeilen, eine viel schwerere Karte), ist sie hier nachzumessen,
 * bevor jemand etwas anderes annimmt.
 *
 * Was den Preis klein hält, steht in `schmalkarten.module.css`:
 * `content-visibility: auto` nimmt dem Browser Layout, Stil und Anstrich für
 * alles ab, was nicht im Bild ist. Was es NICHT abnimmt, ist das Rendern durch
 * React — dafür ist der Aufrufer zuständig, und bei der Inventur tut das
 * `zaehlspeicher.ts`.
 *
 * ⚠️ WAS SIE BEWUSST NICHT TUT: sie sortiert und filtert nicht. Die schmale
 * Darstellung hat keine Spaltenköpfe, also auch keinen Ort für einen Trichter;
 * sie zeigt, was der Aufrufer ihr gibt. Wer auf dem Telefon filtern können
 * muss, braucht dafür ein eigenes Bedienelement über der Liste — und das
 * schreibt in DENSELBEN Zustand, aus dem auch die Spaltenköpfe gespeist werden,
 * sonst zeigen die beiden Darstellungen verschiedene Mengen (Vorbild:
 * `inventur/Schmalfilter.tsx`).
 */

import type { Key, ReactNode } from "react";
import stil from "./schmalkarten.module.css";

export type SchmalkartenProps<T> = {
  /** Die Zeilen in der Reihenfolge, in der sie auf dem Telefon stehen sollen. */
  zeilen: readonly T[];
  /** Der stabile Schlüssel je Zeile — wie `rowKey` an der Tabelle. */
  schluessel: (zeile: T) => Key;
  /** Der Inhalt EINER Karte. Der Aufrufer entscheidet, was auf 390px zählt. */
  karte: (zeile: T) => ReactNode;
  /** Steht anstelle der Liste, wenn `zeilen` leer ist. Nennt den nächsten Schritt. */
  leertext: ReactNode;
  /**
   * Der Name der Liste für Hilfstechnik — derselbe wie an der Tabelle daneben.
   *
   * ⚠️ ER STEHT AN BEIDEN DARSTELLUNGEN, UND DAS IST KEIN DOPPELTER NAME:
   * immer nur eine von beiden ist gerendert (`display: none` nimmt die andere
   * aus dem Zugänglichkeitsbaum). Fehlte er hier, hätte die schmale Darstellung
   * gar keinen.
   */
  "aria-label": string;
  /**
   * Geschätzte Höhe einer Karte in Pixeln, als Platzhalter für die noch nicht
   * gemessenen. ⚠️ EINE SCHÄTZUNG GENÜGT, ABER KEINE FEHLT: ohne sie meldet
   * eine übersprungene Karte Höhe 0, und die Bildlaufleiste springt beim
   * Scrollen. Begründung in `schmalkarten.module.css`.
   */
  kartenHoehe?: number;
  /** Die breite Darstellung — in aller Regel die `Datentabelle`. */
  children: ReactNode;
};

/**
 * „Nur unterhalb von 768px" — für Bedienelemente, die zur schmalen Darstellung
 * gehören, aber nicht in der Kartenliste stehen.
 *
 * ⚠️ ES GIBT SIE, DAMIT ES KEINE ZWEITE MEDIA QUERY GIBT. Die Inventur braucht
 * auf dem Telefon eine Filterleiste (ohne Spaltenköpfe gibt es dort sonst gar
 * keinen Filter); schriebe sie ihre eigene Abfrage, wäre das ein zweiter Ort
 * für den Breakpoint der Suite — genau das, was `docs/design/README.md` mit
 * „ein Breakpoint" ausschließt.
 *
 * ⚠️ EIN EIGENES ELEMENT UND KEINE KLASSE ZUM WEITERREICHEN — UND ZWAR WEIL DER
 * ERSTE ANLAUF GENAU DARAN GESCHEITERT IST, GEMESSEN. Hier stand eine
 * exportierte Klasse, und der Schmalfilter der Inventur hängte sie an eine
 * antd-`Flex`. `.nurSchmal { display: none }` und `.ant-flex { display: flex }`
 * sind BEIDE einklassig; bei Gleichstand entscheidet die Reihenfolge im
 * Stylesheet, und antd spritzt seins zur Laufzeit ein — also danach. Ergebnis
 * im echten Browser bei 1280px: die Leiste stand da, obwohl die Regel richtig
 * dastand (Falle 5, erste Ausprägung). Ein nacktes `div` hat keinen Gegner, und
 * ein Bauteil statt einer Klasse macht den Fehler nicht wiederholbar.
 *
 * ⚠️ UND KEIN GATE HÄTTE ES GEFUNDEN: `typecheck` kennt Klassennamen nicht,
 * `build` serialisiert klaglos, der Quelltext-Scan in `schmalkarten.test.ts`
 * sieht die Regel und nicht die Kaskade, und jsdom wertet Media Queries gar
 * nicht aus. Nur der echte Browser bei 1280px.
 */
export function NurSchmal({ children, ...rest }: {
  children: ReactNode;
} & { "data-rolle"?: string }) {
  return <div className={stil.nurSchmal} {...rest}>{children}</div>;
}

export function Schmalkarten<T>({
  zeilen,
  schluessel,
  karte,
  leertext,
  "aria-label": beschriftung,
  kartenHoehe = 160,
  children,
}: SchmalkartenProps<T>) {
  return (
    <>
      {zeilen.length === 0 ? (
        <p className={stil.nurSchmal} data-rolle="schmalkarten-leer">{leertext}</p>
      ) : (
        <ul
          className={`${stil.nurSchmal} ${stil.karten}`}
          data-rolle="schmalkarten"
          aria-label={beschriftung}
          style={{ "--tab-kartenhoehe": `${kartenHoehe}px` } as React.CSSProperties}
        >
          {zeilen.map((zeile) => (
            <li key={schluessel(zeile)} className={stil.karte} data-row-key={schluessel(zeile)}>
              {karte(zeile)}
            </li>
          ))}
        </ul>
      )}
      {/*
        ⚠️ DIE TABELLE BRAUCHT IHREN EIGENEN KASTEN, sie kann die Klasse nicht
        selbst tragen: `Datentabelle` reicht `className` an antds `Table`
        weiter, und dort landet sie an einem inneren Knoten, während der äußere
        Rahmen sichtbar bliebe. Ein eigener `div` ist die Stelle, an der
        `display: none` wirklich alles ausblendet.
      */}
      <div className={stil.breit} data-rolle="breitansicht">{children}</div>
    </>
  );
}

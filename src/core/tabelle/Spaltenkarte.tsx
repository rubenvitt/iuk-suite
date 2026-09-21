"use client";

/**
 * EINE TABELLENZEILE ALS KARTE — gebaut aus den Spalten (DRK-451).
 *
 * Was hier steht, hat `kartenaufbau.ts` entschieden; diese Datei rendert es nur
 * noch. Die Aufteilung ist dieselbe wie zwischen `masse.ts` und
 * `Datentabelle.tsx`: die Entscheidung ist prüfbar, ohne etwas zu rendern.
 *
 * ⚠️ DIE KARTE FÜGT KEIN EIGENES BEDIENELEMENT HINZU — WEDER ALS FLÄCHE NOCH
 * AM TITEL. Beides war im ersten Anlauf da, und beides war falsch:
 *
 * Eine ganze Fläche mit `role="button"` zu versehen ist der naheliegende Weg
 * und der schlechtere: die Karte enthält eigene Knöpfe und Links, und ein
 * bedienbares Element im bedienbaren Element ist für eine Vorleseanwendung
 * nicht mehr aufzulösen.
 *
 * ⚠️ DEN TITEL ZUM KNOPF ZU MACHEN IST DIESELBE FALLE IN LEISER — UND SIE HAT
 * ZUGESCHLAGEN. Genau das stand hier, mit der Begründung „ein Ziel, ein Name,
 * eine Tab-Station". Nur rendert die Titelspalte in dieser Suite regelmäßig
 * selbst schon ein Bedienelement: die Artikelliste einen antd-`Button`, der
 * die Schublade öffnet. Daraus wurde `<button><button>`, und das ist nicht
 * bloß unschön, sondern **ungültiges HTML**: der Browser bricht die
 * Verschachtelung beim Parsen auf, das Server-HTML und der Client-Baum gehen
 * auseinander, und React verwirft den GANZEN Teilbaum („Hydration failed …").
 * Gemessen in CI-Lauf 35657983189: 25 Hydrationsfehler auf der Artikelseite,
 * und in deren Folge riss der Export — die Suche erreichte ihn nicht mehr, er
 * lieferte alle 217 Zeilen statt der einen gesuchten. **Der Fehler meldet sich
 * also an einer Stelle, die mit Karten nichts zu tun hat.**
 *
 * ⚠️ WAS DIE TASTATUR STATTDESSEN HAT, und warum das genügt: dieselbe
 * Titelspalte. Wo eine Zeile anklickbar ist, führt in dieser Suite ohnehin ein
 * Link oder Knopf IN der Zeile zum selben Ziel (`onRow`-Klick ist der Komfort,
 * nicht der einzige Weg) — heute belegbar an der einzigen umgestellten
 * Tabelle mit Zeilenklick. Ein zweites Ziel danebenzusetzen verdoppelt nur die
 * Tab-Stationen. Die Fläche nimmt den Tipp weiterhin entgegen, weil das auf
 * dem Telefon erwartet wird.
 *
 * ⚠️ UND DESHALB BLEIBT DIE WEICHE IN `aufFlaeche`. Ein Klick auf einen Knopf
 * INNEN blubbert bis zur Karte; ohne Probe öffnete jedes „Löschen" zusätzlich
 * die Detailansicht. Geprüft wird auf das nächste bedienbare Element — nicht
 * auf einen Klassennamen, der bei einem antd-Sprung still anders heißt.
 */

import type { Key, ReactNode } from "react";
import { Checkbox } from "antd";
import { SCHRIFT } from "../theme/schrift";
import { traegtInhalt, zellenInhalt, type Kartenaufbau } from "./kartenaufbau";
import stil from "./spaltenkarte.module.css";

/** Die bedienbaren Elemente, deren Klick NICHT die Karte meint. */
const BEDIENBAR = "a, button, input, select, textarea, label, [role=\"button\"]";

export type SpaltenkarteProps<T> = {
  aufbau: Kartenaufbau<T>;
  zeile: T;
  /** Die Position in der angezeigten Liste — `render` bekommt sie als dritten Wert. */
  index: number;
  /** Der Name dieser Zeile für Hilfstechnik — heute das Kreuzchen der Auswahl. */
  name: string;
  /** Gesetzt, wenn ein Tipp auf die Karte etwas auslöst. */
  onKlick?: (ereignis: React.MouseEvent<HTMLElement>) => void;
  /** Gesetzt, wenn die Tabelle daneben `rowSelection` trägt. */
  auswahl?: { gewaehlt: boolean; onWechsel: (gewaehlt: boolean) => void };
};

export function Spaltenkarte<T>({
  aufbau,
  zeile,
  index,
  name,
  onKlick,
  auswahl,
}: SpaltenkarteProps<T>) {
  const titel = aufbau.titel ? zellenInhalt(aufbau.titel.spalte, zeile, index) : null;

  function aufFlaeche(ereignis: React.MouseEvent<HTMLElement>): void {
    if (!onKlick) return;
    // Alles Bedienbare behält seinen eigenen Klick; die Fläche daneben ist der
    // Komfortweg. (Hier stand eine Ausnahme für einen Titelknopf — den gibt es
    // nicht mehr, Begründung im Kopf.)
    if ((ereignis.target as HTMLElement).closest(BEDIENBAR)) return;
    onKlick(ereignis);
  }

  return (
    <article className={stil.karte} onClick={onKlick ? aufFlaeche : undefined}>
      <div className={stil.kopf}>
        {auswahl ? (
          <Checkbox
            checked={auswahl.gewaehlt}
            onChange={(ereignis) => auswahl.onWechsel(ereignis.target.checked)}
            aria-label={`${name} auswählen`}
          />
        ) : null}
        {/*
          ⚠️ IMMER EIN NACKTER TEXT, NIE EIN KNOPF. Was die Titelspalte selbst
          rendert — ein Link, ein `Button` —, kommt hier unverändert durch und
          bleibt bedienbar; ein Knopf DARUM ergäbe `<button><button>` und damit
          ungültiges HTML (Begründung im Kopf).
        */}
        <span className={stil.titel}>{titel}</span>
        {aufbau.kennzeichen.length > 0 ? (
          <span className={stil.kennzeichen}>
            {aufbau.kennzeichen.map((fach) => (
              <span key={fach.schluessel}>{zellenInhalt(fach.spalte, zeile, index)}</span>
            ))}
          </span>
        ) : null}
      </div>

      {/*
        ⚠️ EINE BESCHREIBUNGSLISTE UND KEIN RASTER AUS `div`s. `dt`/`dd` ist
        genau das Paar aus Beschriftung und Wert, das hier steht; eine
        Vorleseanwendung liest sie zusammen vor, ein `div` überlässt dem Hörer
        das Zuordnen. In der Tabelle leistet das der Spaltenkopf — die Karte
        hat keinen, also muss die Auszeichnung es tun.
      */}
      <Merkmale aufbau={aufbau} zeile={zeile} index={index} />

      {aufbau.aktionen ? (
        <div className={stil.aktionen}>
          {zellenInhalt(aufbau.aktionen.spalte, zeile, index)}
        </div>
      ) : null}
    </article>
  );
}

function Merkmale<T>({ aufbau, zeile, index }: {
  aufbau: Kartenaufbau<T>;
  zeile: T;
  index: number;
}) {
  const paare: { schluessel: string; beschriftung: string; wert: ReactNode }[] = [];
  for (const fach of aufbau.merkmale) {
    const wert = zellenInhalt(fach.spalte, zeile, index);
    // Leergelassene Felder stapeln sich sonst als Nichtigkeiten untereinander;
    // die Begründung und ihre Grenze stehen bei `traegtInhalt`.
    if (!traegtInhalt(wert)) continue;
    paare.push({ schluessel: fach.schluessel, beschriftung: fach.beschriftung, wert });
  }
  if (paare.length === 0) return null;

  /*
   * ⚠️ EINE SPALTE OHNE TITEL BEKOMMT KEIN LEERES `<dt>`. Es gibt sie (ein
   * Symbol neben einer Zahl, eine Knopfzeile) — und ein leeres `<dt>` wäre
   * gleich dreimal falsch: eine Vorleseanwendung kündigt einen Begriff an und
   * liest nichts, das Raster hielte eine leere Spalte frei, und `dl` verlangt
   * zu jedem `dt` überhaupt einen Begriff. Solche Werte stehen deshalb über die
   * volle Breite VOR der Liste, nicht darin.
   */
  const mitNamen = paare.filter((paar) => paar.beschriftung !== "");
  const ohneNamen = paare.filter((paar) => paar.beschriftung === "");

  return (
    <>
      {ohneNamen.map((paar) => (
        <div key={paar.schluessel} className={stil.wert}>{paar.wert}</div>
      ))}
      {mitNamen.length > 0 ? (
        <dl className={stil.merkmale}>
          {mitNamen.map((paar) => (
            <div key={paar.schluessel} className={stil.fach}>
              <dt className={stil.beschriftung} style={SCHRIFT.kicker}>{paar.beschriftung}</dt>
              <dd className={stil.wert}>{paar.wert}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </>
  );
}

/**
 * Der Name einer Zeile für Hilfstechnik — aus der Titelspalte, wenn sie einen
 * Text liefert, sonst aus dem Zeilenschlüssel.
 *
 * ⚠️ WARUM NICHT EINFACH `zellenInhalt` NEHMEN: der Titel ist oft ein Element
 * (ein Link, ein `Tag`), und ein Element ist kein `aria-label`. Ein
 * `[object Object]` am Kreuzchen wäre schlimmer als der Schlüssel — der ist
 * wenigstens eindeutig.
 */
export function kartenName<T>(
  aufbau: Kartenaufbau<T>,
  zeile: T,
  index: number,
  schluessel: Key,
): string {
  const titel = aufbau.titel ? zellenInhalt(aufbau.titel.spalte, zeile, index) : null;
  if (typeof titel === "string" && titel.trim().length > 0) return titel;
  if (typeof titel === "number") return String(titel);
  return String(schluessel);
}

"use client";

// src/app/m/radio/_ui/Nachladen.tsx
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Alert, Button, Spin } from "antd";
import type { NachladeAntwort } from "../_lib/nachladen";
import s from "./verwaltung.module.css";

/**
 * NACHLADEN BEIM SCROLLEN (DRK-335) — der Zustand und der Fuss der zwei Verwaltungslisten
 * (`geraete/GeraeteTabelle.tsx`, `ausleihen/AusleihenTabelle.tsx`). Vorbild ist
 * `lagerbuch/verwaltung/(arbeit)/journal/JournalTable.tsx` (DRK-331); dort steht dieselbe
 * Logik einmal, hier fuer zwei Tabellen, deshalb als Hook.
 *
 * ⛔ WAS HIER NICHT ENTSTEHT: clientseitige Sortierer und Spaltenfilter. Beide wirkten nur auf
 * die GELADENEN Zeilen; ein Spaltenfilter, der wenige Zeilen stehen laesst, liesse ausserdem
 * die Wache im Bild und zoege den ganzen Bestand in Portionen nach
 * (`src/core/tabelle/sortierer.ts`). Sortiert und gefiltert wird ueber die Adresszeile.
 *
 * ⚠️ DIE WACHE STEHT UNTER DER TABELLE, und das traegt nur, solange die Seite scrollt und
 * nicht die Tabelle: `Datentabelle` virtualisiert erst, wenn ein Aufrufer `virtuell` setzt —
 * beide Listen tun es nicht. Wer es einschaltet, macht die Tabelle zum eigenen Scroller
 * (Falle 16), und die Wache darunter kommt nie mehr in Sicht.
 */

type Stand<Z, C> = {
  schluessel: string;
  zeilen: Z[];
  cursor: C | null;
  gesamt: number;
  fehler: string | null;
  laedt: boolean;
};

export type Nachladen<Z> = {
  zeilen: Z[];
  gesamt: number;
  mehrVorhanden: boolean;
  fehler: string | null;
  laedt: boolean;
  mehrLaden: () => Promise<void>;
  wache: RefObject<HTMLDivElement | null>;
};

export function useNachladen<Z extends { id: string }, C>({
  ersteZeilen,
  ersterCursor,
  gesamt,
  parameter,
  aktion,
  fehlerText,
}: {
  ersteZeilen: Z[];
  ersterCursor: C | null;
  gesamt: number;
  /** Die Suchparameter in Adresszeilen-Form — dieselben, aus denen die Seite gelesen hat. */
  parameter: Record<string, string>;
  /** Die Server Action, DIREKT importiert und nie als Prop durchgereicht (Falle 9). */
  aktion: (anfrage: { parameter: Record<string, string>; cursor: C }) => Promise<
    NachladeAntwort<Z, C>
  >;
  /** Fuer den Fall, dass die Action gar nicht antwortet (abgerissenes Netz). */
  fehlerText: string;
}): Nachladen<Z> {
  /**
   * ⛔ DER RUECKSETZ-SCHLUESSEL TRAEGT DEN FILTER MIT, nicht nur die erste Zeile. Ein
   * Filterwechsel, der die erste Portion zufaellig unveraendert laesst, ergaebe sonst denselben
   * Schluessel, und die zuvor nachgeladenen Zeilen blieben stehen, obwohl sie den neuen Filter
   * verletzen (DRK-331, Reviewbefund). `JSON.stringify` statt `join`: die Parameter sind
   * Freitext und duerfen jedes Trennzeichen enthalten.
   */
  const parameterText = JSON.stringify(parameter);
  const schluessel = JSON.stringify([ersteZeilen[0]?.id ?? null, ersterCursor, parameterText]);

  const [stand, setStand] = useState<Stand<Z, C>>(() => ({
    schluessel,
    zeilen: ersteZeilen,
    cursor: ersterCursor,
    gesamt,
    fehler: null,
    laedt: false,
  }));
  /*
   * ⛔ DER RIEGEL GEGEN DOPPELTE ABRUFE MERKT SICH DIE GENERATION, nicht nur „laeuft etwas".
   * Ein blosses Ja/Nein sperrte nach einem Filterwechsel den ersten Nachschlag der NEUEN
   * Generation, solange der alte noch unterwegs ist — und weil der Beobachter nur beim
   * Wechsel der Sichtbarkeit meldet, bliebe die Liste danach stehen, bis jemand scrollt.
   */
  const unterwegs = useRef<string | null>(null);
  const wache = useRef<HTMLDivElement>(null);

  /*
   * ⛔ DER ABGLEICH LAEUFT IN DER RENDERPHASE, NICHT IN EINEM EFFEKT — dieselbe Begruendung wie
   * in `JournalTable.tsx`: ein Effekt zeigte einen Frame lang die Zeilen des vorigen Filters,
   * und `react-hooks/set-state-in-effect` meldet ihn als Fehler.
   */
  if (stand.schluessel !== schluessel) {
    setStand({
      schluessel,
      zeilen: ersteZeilen,
      cursor: ersterCursor,
      gesamt,
      fehler: null,
      laedt: false,
    });
  }

  const { cursor, fehler } = stand;

  const mehrLaden = useCallback(async () => {
    if (!cursor || unterwegs.current === schluessel) return;
    /*
     * ⛔ JEDE ZUSTANDSAENDERUNG PRUEFT DIE GENERATION, UNTER DER SIE LOSGESCHICKT WURDE.
     * Wechselt der Filter, waehrend ein Nachschlag unterwegs ist, haengte die Antwort sonst
     * die Zeilen des ALTEN Filters an den neuen Stand (DRK-331, Reviewbefund).
     */
    const generation = schluessel;
    const passt = (vorher: Stand<Z, C>) => vorher.schluessel === generation;
    unterwegs.current = generation;
    setStand((vorher) => (passt(vorher) ? { ...vorher, fehler: null, laedt: true } : vorher));
    try {
      const antwort = await aktion({ parameter: JSON.parse(parameterText), cursor });
      setStand((vorher) => {
        if (!passt(vorher)) return vorher;
        if (!antwort.ok) return { ...vorher, fehler: antwort.fehler, laedt: false };
        // Anhaengen, nicht ersetzen — und doppelte Kennungen abfangen: ein doppelter
        // `rowKey` waere in React ein stiller Renderfehler.
        const bekannt = new Set(vorher.zeilen.map((z) => z.id));
        const neue = antwort.zeilen.filter((z) => !bekannt.has(z.id));
        return {
          ...vorher,
          zeilen: neue.length > 0 ? [...vorher.zeilen, ...neue] : vorher.zeilen,
          cursor: antwort.cursor,
          gesamt: antwort.gesamt,
          laedt: false,
        };
      });
    } catch {
      setStand((vorher) =>
        passt(vorher) ? { ...vorher, fehler: fehlerText, laedt: false } : vorher,
      );
    } finally {
      if (unterwegs.current === generation) unterwegs.current = null;
    }
  }, [cursor, schluessel, parameterText, aktion, fehlerText]);

  /*
   * Der Beobachter an der Wache — kein Scroll-Zuhoerer, der je Pixel feuerte. ⛔ NACH EINEM
   * FEHLER LAEDT ER NICHT VON SELBST WEITER; sonst liefe bei abgerissenem Netz eine stille
   * Schleife gegen den Server. Dann steht ein Knopf da.
   */
  useEffect(() => {
    const knoten = wache.current;
    if (!knoten || !cursor || fehler) return;
    if (typeof IntersectionObserver === "undefined") return;
    const beobachter = new IntersectionObserver(
      (eintraege) => {
        if (eintraege.some((e) => e.isIntersecting)) void mehrLaden();
      },
      { rootMargin: "200px" },
    );
    beobachter.observe(knoten);
    return () => beobachter.disconnect();
  }, [cursor, fehler, mehrLaden]);

  return {
    zeilen: stand.zeilen,
    gesamt: stand.gesamt,
    mehrVorhanden: cursor !== null,
    fehler,
    laedt: stand.laedt,
    mehrLaden,
    wache,
  };
}

/**
 * Der Fuss unter der Liste: Stand, Wache, Fehler mit Wiederholknopf, Ladezeichen.
 *
 * ⛔ ER STEHT UNTER BEIDEN ZWEIGEN (Tabelle und mobile Karten), nicht in einem davon — Vitest
 * rendert den mobilen Zweig, der Browser auf dem Schreibtisch die Tabelle.
 */
export function NachladeFuss<Z>({
  nachladen,
  woerter,
}: {
  nachladen: Nachladen<Z>;
  /** „1 Gerät", „12 Geräte", „20 von 312 Geräten" — der Dativ ist kein Schmuck. */
  woerter: { einzahl: string; mehrzahl: string; dativ: string };
}) {
  const { zeilen, gesamt, mehrVorhanden, fehler, laedt, mehrLaden, wache } = nachladen;
  return (
    <div data-rolle="radio-nachladen">
      {/*
        Die Wache: ein eigener Block ueber die volle Breite und ein Pixel hoch — als Glied der
        Flexzeile darunter haette sie keine Breite und damit keine Flaeche, die in Sicht kommt.
      */}
      <div ref={wache} data-rolle="radio-nachladen-wache" style={{ minHeight: 1 }} />
      <div className={s.nachladen}>
      {fehler ? (
        <div className={s.nachladenFehler}>
          {/* `warning`, nicht `error`: Rot ist hier die Primaerfarbe (Falle 3). */}
          <Alert type="warning" showIcon={false} title={fehler} />
          <Button data-rolle="radio-nachladen-erneut" onClick={() => void mehrLaden()}>
            Erneut versuchen
          </Button>
        </div>
      ) : null}
      {/* Ohne `size` — Falle 4, und der Scan in `_ui/AusleihRahmen.test.tsx` haelt das. */}
      {laedt ? <Spin /> : null}
      {zeilen.length > 0 ? (
        <span className={s.nachladenStand} data-rolle="radio-nachladen-stand">
          {mehrVorhanden
            ? `${zeilen.length} von ${gesamt} ${woerter.dativ} geladen – weitere beim Scrollen`
            : `${gesamt} ${gesamt === 1 ? woerter.einzahl : woerter.mehrzahl}`}
        </span>
      ) : null}
      </div>
    </div>
  );
}

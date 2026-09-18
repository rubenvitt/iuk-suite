"use client";

/**
 * DRK-421 — DER ZAEHLSTAND ALS SPEICHER NEBEN REACT, NICHT ALS `useState` IM
 * FORMULAR.
 *
 * ⚠️ WARUM DAS NOETIG WURDE, UND ZWAR GEMESSEN. Der Zaehlstand lag als
 * `useState` in `InventurForm`. Jede Aenderung rendert damit das ganze Formular
 * neu — und weil `columns` als Literal im Rumpf steht und jede `render`-Funktion
 * ueber den Stand abschliesst, rendert antd daraufhin JEDE Zeile neu. Gemessen
 * am Formular mit synthetischen Artikeln (jsdom, deshalb absolute Zahlen nur
 * untereinander vergleichbar; die LINEARITAET ist der Befund):
 *
 * ```
 * Artikel   DOM-Knoten   ein Klick auf „+"   ein Zeichen im KOMMENTARFELD
 *      50        2.133             281 ms                        211 ms
 *     200        7.933             579 ms                        442 ms
 *     600       23.400           1.328 ms                      1.135 ms
 * ```
 *
 * ⚠️ DIE LETZTE SPALTE IST DER EIGENTLICHE BEFUND: das Kommentarfeld hat mit
 * der Tabelle NICHTS zu tun, und ein Tastendruck darin kostete fast so viel wie
 * ein vollstaendiger Aufbau der Seite. Das ist keine langsame Tabelle, das ist
 * eine Tabelle, die auf einen Zustand hoert, der sie nichts angeht. Dieselbe
 * Fehlerklasse, gegen die `core/tabelle/useEntprellt.ts` antritt — dort wurde
 * sie entprellt, hier wird sie aufgetrennt.
 *
 * DIE AUFTRENNUNG: eine Aenderung an Artikel X weckt nur, wer auf X horcht
 * (seine „Ist"- und „Abweichung"-Zelle, seine aufgeklappte Chargenliste) und
 * wer auf den GESAMTSTAND horcht (die Zaehlleiste oben, die Abschlussleiste
 * unten — beides kleine Flaechen). Das Formular selbst horcht auf nichts:
 * `columns` bleibt damit referenzgleich, und antds `Cell` (selbst `React.memo`)
 * traegt seine Zelle unveraendert weiter.
 *
 * ⚠️ WARUM `useSyncExternalStore` UND KEIN CONTEXT. Ein Context mit dem Stand
 * darin weckt JEDEN Verbraucher bei jeder Aenderung — genau das, was hier weg
 * soll; die Zellen der 599 nicht angefassten Artikel wuerden mitrendern. Ein
 * Context traegt hier deshalb allenfalls den SPEICHER (der sich nie aendert),
 * nie den Stand. Heute reicht eine Prop.
 *
 * ⚠️ DIE REINEN UMBAUFUNKTIONEN BLEIBEN, WO SIE SIND (`inventurZustand.ts`).
 * Dieser Speicher haelt eine Referenz und verteilt Nachrichten; er kennt weder
 * Chargen noch die Regel „nur Angefasstes wird gesendet". Wer sie hierher
 * zoege, haette sie in einem Modul mit `"use client"` — und damit ausserhalb
 * dessen, was eine Server Component lesen kann (Falle 6).
 *
 * `"use client"` steht hier wegen der beiden Haken unten. Kein Wert aus dieser
 * Datei wird in einer Server Component gebraucht; `page.tsx` reicht nur Daten
 * an die Insel.
 */

import { useCallback, useSyncExternalStore } from "react";
import type { ZaehlStand, Zaehlung } from "./inventurZustand";

type Horcher = () => void;

export type Zaehlspeicher = {
  /**
   * Der aktuelle Stand. ⚠️ Die Referenz ist die Zusage: solange nichts
   * geaendert wurde, kommt DASSELBE Objekt zurueck — `useSyncExternalStore`
   * verlangt das, sonst rendert es endlos.
   */
  lies(): ZaehlStand;
  /** Denselben Umbau wie bisher `setStand`, nur ohne React dazwischen. */
  aendere(umbau: (stand: ZaehlStand) => ZaehlStand): void;
  /** Alles verwerfen — nach dem Abschluss und beim ausdruecklichen Verwerfen. */
  leeren(): void;
  horcheGesamt(horcher: Horcher): () => void;
  horcheArtikel(artikelId: string, horcher: Horcher): () => void;
};

export function erzeugeZaehlspeicher(): Zaehlspeicher {
  let stand: ZaehlStand = {};
  const gesamt = new Set<Horcher>();
  const jeArtikel = new Map<string, Set<Horcher>>();

  function verteile(vorher: ZaehlStand, nachher: ZaehlStand): void {
    // Referenzgleich heisst: die reine Umbaufunktion hat nichts getan (etwa
    // `artikelSetzen` auf einer Zeile, die im Chargenmodus steht). Dann gibt es
    // auch nichts zu melden — sonst renderte die Abschlussleiste bei jedem
    // wirkungslosen Klick mit.
    if (vorher === nachher) return;
    // ⚠️ ERST SETZEN, DANN WECKEN. Ein Horcher liest im selben Zug `lies()`;
    // stuende dort noch der alte Stand, zeigte die Oberflaeche einen Schritt
    // hinterher.
    stand = nachher;
    /*
     * ⚠️ DIE VEREINIGUNG BEIDER SCHLUESSELMENGEN, NICHT NUR DIE NEUE. Eine
     * ENTFERNTE Zaehlung (`chargenzaehlungVerwerfen`, `neueChargeEntfernen` auf
     * der letzten Ergaenzung) steht danach in `nachher` gar nicht mehr — ihre
     * Zelle bekaeme nie Bescheid und zeigte den verworfenen Wert weiter.
     */
    for (const id of new Set([...Object.keys(vorher), ...Object.keys(nachher)])) {
      if (vorher[id] === nachher[id]) continue;
      // Eine KOPIE: ein Horcher darf sich beim Wecken abmelden (React tut das
      // beim Aushaengen), und das aenderte die Menge waehrend der Schleife.
      for (const horcher of [...(jeArtikel.get(id) ?? [])]) horcher();
    }
    for (const horcher of [...gesamt]) horcher();
  }

  return {
    lies: () => stand,
    aendere(umbau) {
      verteile(stand, umbau(stand));
    },
    leeren() {
      verteile(stand, {});
    },
    horcheGesamt(horcher) {
      gesamt.add(horcher);
      return () => { gesamt.delete(horcher); };
    },
    horcheArtikel(artikelId, horcher) {
      let menge = jeArtikel.get(artikelId);
      if (!menge) {
        menge = new Set();
        jeArtikel.set(artikelId, menge);
      }
      menge.add(horcher);
      return () => {
        menge.delete(horcher);
        // Ohne das waechst die Karte bei einer langen Zaehlung um jeden je
        // eingehaengten Artikel und wird nie wieder kleiner.
        if (menge.size === 0) jeArtikel.delete(artikelId);
      };
    },
  };
}

/**
 * Die Zaehlung EINES Artikels. Nur diese Zelle wacht auf, wenn sich dieser
 * Artikel aendert — und keine der anderen.
 */
export function useZaehlung(speicher: Zaehlspeicher, artikelId: string): Zaehlung | undefined {
  const horche = useCallback(
    (horcher: Horcher) => speicher.horcheArtikel(artikelId, horcher),
    [speicher, artikelId],
  );
  // ⚠️ REFERENZSTABIL, WEIL DIE UMBAUFUNKTIONEN NUR DEN ANGEFASSTEN EINTRAG
  // ERSETZEN (`{ ...stand, [id]: … }`). Ein `useMemo` oder eine abgeleitete
  // Rechnung an dieser Stelle waere bei jedem Aufruf ein neues Objekt und damit
  // eine Endlosschleife in `useSyncExternalStore`.
  const lies = useCallback(() => speicher.lies()[artikelId], [speicher, artikelId]);
  return useSyncExternalStore(horche, lies, lies);
}

/**
 * Der GESAMTE Stand — fuer die beiden kleinen Flaechen, die Summen zeigen
 * (gezaehlte Positionen, Abweichungen, ausgeblendet Gezaehltes). Sie rendern
 * bei jeder Aenderung mit; das ist gewollt und kostet ein Dutzend Knoten, nicht
 * sechshundert Zeilen.
 */
export function useZaehlstand(speicher: Zaehlspeicher): ZaehlStand {
  const horche = useCallback((horcher: Horcher) => speicher.horcheGesamt(horcher), [speicher]);
  const lies = useCallback(() => speicher.lies(), [speicher]);
  return useSyncExternalStore(horche, lies, lies);
}

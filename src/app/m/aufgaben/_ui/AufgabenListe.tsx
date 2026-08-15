import Link from "next/link";
import type { ReactNode } from "react";
import { fmtDauer, istUeberfaellig, vorschlagOffen } from "../_lib/anzeige";
import { fmtTagKurz } from "../_lib/datum";
import type { AufgabeRow } from "../_db/schema";
import { SPACE } from "@/core/theme/tokens";
import { Ikone } from "./ikonen";
import { PrioritaetChip, StatusChip } from "./Chip";

/*
 * AUFGABEN ALS ZEILENLISTE — der Posteingang-Streifen (§8.1), die eigenen
 * Auftraege (§8.3) und das Archiv teilen sich diese eine Zeilenform. KEIN
 * "use client", kein Compound-Zugriff, kein Icon-Import ausser `./ikonen`.
 *
 * `zeilen: { aufgabe, aktionen }[]`, NICHT `aufgaben: AufgabeRow[]` PLUS EINE
 * GEMEINSAME `aktionen`-PROP: die Aktionszeile unterscheidet sich je Zustand
 * und Rolle ("Bearbeitung starten" hier, "Freigeben" dort), und WER WAS DARF
 * entscheiden die Praedikate aus `_lib/zugang.ts` an der aufrufenden Seite —
 * diese Komponente entscheidet es ausdruecklich NICHT selbst (Brief). Eine
 * einzelne `aktionen: ReactNode`-Prop fuer die ganze Liste koennte das gar
 * nicht ausdruecken (dieselben Knoepfe fuer jede Zeile waeren falsch); ein
 * Callback `(a: AufgabeRow) => ReactNode`, den diese Komponente AUFRUFT, waere
 * wieder ein Stueck Entscheidung, das hier nicht hingehoert, weil der Aufrufer
 * dann implizit "diese Liste ruft mein Prädikat pro Zeile" versprechen
 * muesste. Das Paar `{ aufgabe, aktionen }` legt die Entscheidung vollstaendig
 * VOR dem Aufruf hin: fertig gerenderte Knoepfe, oder gar keine.
 *
 * `istUeberfaellig`/`vorschlagOffen` KOMMEN AUS `_lib/anzeige.ts` UND WERDEN
 * NICHT NEU GERECHNET — dieselbe Ableitung steht auch in der KPI-Kachel
 * (Aufgabe 13+). Zwei Fassungen derselben Bedingung laufen auseinander, und
 * der Fehler ist nicht sichtbar kaputt, sondern nur falsch: die Kachel zaehlt
 * drei, die Liste zeigt zwei.
 */

export interface AufgabenListeZeile {
  aufgabe: AufgabeRow;
  /** Fertig gerenderte Aktionen dieser Zeile — die Komponente entscheidet nicht, wer was darf. */
  aktionen?: ReactNode;
}

export function AufgabenListe({
  zeilen,
  heute,
  leerText,
}: {
  zeilen: AufgabenListeZeile[];
  /** ISO-Tagesstring — fuer `istUeberfaellig`. Kommt als Argument, nie aus `new Date()` hier. */
  heute: string;
  /**
   * PFLICHT, KEIN `?`: Spec §9.8 verlangt fuer jede Liste einen AUSGESCHRIEBENEN
   * eigenen Satz — eine leere Flaeche ohne Text sieht aus wie ein Ladefehler.
   * Der Satz kommt von aussen, damit Posteingang, Freigabe-Warteschlange und
   * Ueberfaelligkeitsliste je ihren eigenen tragen, statt einen dritten
   * generischen zu erfinden.
   */
  leerText: string;
}) {
  if (zeilen.length === 0) {
    return <p>{leerText}</p>;
  }

  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: SPACE.sm,
      }}
    >
      {zeilen.map(({ aufgabe, aktionen }) => {
        const ueberfaellig = istUeberfaellig(aufgabe, heute);
        const vorschlag = vorschlagOffen(aufgabe);
        return (
          <li
            key={aufgabe.id}
            style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: SPACE.sm }}
          >
            <Link href={`/a/${aufgabe.id}`}>{aufgabe.titel}</Link>
            <StatusChip status={aufgabe.status} />
            <PrioritaetChip prioritaet={aufgabe.prioritaet} />
            <span>Frist: {fmtTagKurz(aufgabe.faelligAm)}</span>
            <span>{fmtDauer(aufgabe.dauerMinuten)}</span>
            {ueberfaellig ? (
              <span>
                <Ikone name="warnung" /> Überfällig
              </span>
            ) : null}
            {vorschlag ? (
              <span>
                <Ikone name="uhr" /> Zeitvorschlag offen
              </span>
            ) : null}
            {aktionen}
          </li>
        );
      })}
    </ul>
  );
}

"use client";

import Link from "next/link";
import type { TableProps } from "antd";
import { Kartentabelle, nachText, nachZahl, zustandsFilter } from "@/core/tabelle";
import { Altbestandsfussnote, Notenfunke, Notenpille } from "./Noten";
import { T } from "./typo";

/**
 * DER GRUPPENVERGLEICH ALS TABELLE (Entwurf §3.4).
 *
 * DAS BALKENDIAGRAMM ENTFÄLLT, und das ist keine Geschmacksfrage: `core/charts`
 * färbt mit `token.colorPrimary` — in diesem Projekt Suite-Rot (§4.9) — und ein
 * Balken „länger = schlechter" auf einer invertierten Skala ist genau der
 * Sachfehler, den diese Spec verbietet. Die Pillenspalte ist vertikal gelesen
 * selbst der Vergleich.
 *
 * DIE ORDNUNG KOMMT WEITERHIN FERTIG AUS DER SEITE — aufsteigend nach Ø, bester
 * zuerst (§3.4). Hier stand „BEWUSST KEIN antd-`sorter`: der gäbe die Ordnung an
 * antd ab, und die Zusage wäre nur noch eine Vorgabe im Spaltenkopf." Der
 * Einwand traf einen `sorter` OHNE `defaultSortOrder`; mit ihm ist die Zusage
 * der ANFANGSZUSTAND der Tabelle, und zwar derselbe, den die Seite berechnet:
 * `nachZahl` ordnet aufsteigend und stellt Gruppen ohne Ø ans Ende — Zeile für
 * Zeile dieselbe Ordnung wie der `.sort()` in `vergleich/page.tsx`. Der Kopf
 * sagt die Richtung weiterhin mit („1 = beste"), sonst liest sich die bessere
 * Gruppe wie die schlechtere.
 *
 * WARUM CLIENT (§4.13, Falle 9): `columns[].render` sind Funktionen, die eine
 * Server Component nicht übergeben kann.
 */

export type VergleichZeile = {
  groupId: number;
  name: string;
  /** Anzahl der Dienstabende mit Umfrage. */
  abende: number;
  /** Rücklauf-Ø in Prozent über die Abende MIT Teilnehmerzahl — sonst `null` (§2.3). */
  ruecklauf: number | null;
  /** Gewichteter Schulnoten-Ø der Gruppe (§4.12), nie `overallAvg`. */
  note: number | null;
  /** Die Noten der jüngsten Abende, ÄLTESTE ZUERST — die Richtung des Funkens. */
  noten: number[];
  /** Summe der Rückmeldungen; unter fünf ist die Gruppe nicht vergleichbar (§3.4). */
  rueckmeldungen: number;
  hasLegacyScale: boolean;
};

/** Unter fünf Rückmeldungen ist ein Gruppen-Ø eine Meinung, kein Vergleich (§3.4). */
const VERGLEICHBAR_AB = 5;

/**
 * Die Spaltenköpfe tragen ihre Rolle über `columns[].title` — den Kicker setzt
 * `Datentabelle` selbst, der `<span style={T.kicker}>` je Spalte ist damit weg
 * (`docs/design/README.md`). Die Versalien kommen weiterhin aus dem
 * `textTransform` der Rolle, nicht aus dem geschriebenen Text.
 *
 * ⚠️ SORTIERT WIRD ÜBER DIE ZAHL, NIE ÜBER DEN ANZEIGETEXT. „82 %" und die
 * Notenpille sind gerendertes Markup; verglichen werden `ruecklauf` und `note`,
 * beide schon als Zahl in der Zeile. Bei der Note ist die fachliche Ordnung
 * aufsteigend — 1 ist die beste Note, nicht die kleinste Auszeichnung.
 *
 * Die Spaltenliste hängt an keiner Prop und steht deshalb auf Modulebene: eine
 * bei jedem Rendern neu gebaute Liste zwänge die Tabelle zur Neuberechnung.
 */
const SPALTEN: TableProps<VergleichZeile>["columns"] = [
  {
    title: "Gruppe",
    key: "name",
    sorter: nachText<VergleichZeile>((z) => z.name),
    /*
     * „Nicht vergleichbar" ist kein Feld, sondern ein Prädikat über der Zeile —
     * und genau dafür gibt es `zustandsFilter`. Dieselbe Schwelle wie im
     * `render` darunter, aus derselben Konstante: zwei Zahlen wären zwei
     * Wahrheiten.
     */
    ...zustandsFilter<VergleichZeile>([
      {
        wert: "vergleichbar",
        text: "Vergleichbar",
        trifft: (z) => z.rueckmeldungen >= VERGLEICHBAR_AB,
      },
      {
        wert: "zu-wenig",
        text: "Nicht vergleichbar",
        trifft: (z) => z.rueckmeldungen < VERGLEICHBAR_AB,
      },
    ]),
    render: (_, z) => (
      <span
        style={{
          ...T.body,
          // Kursiv plus Halbsatz: die Zeile bleibt lesbar, sagt aber, dass
          // ihr Ø nicht trägt (§3.4). Kein Ausgrauen — das läse sich wie
          // „gesperrt".
          fontStyle: z.rueckmeldungen < VERGLEICHBAR_AB ? "italic" : undefined,
        }}
      >
        <Link href={`/m/feedback/groups/${z.groupId}`}>{z.name}</Link>
        {z.rueckmeldungen < VERGLEICHBAR_AB && (
          <span style={{ ...T.meta, marginLeft: 8 }}>nicht vergleichbar</span>
        )}
      </span>
    ),
  },
  {
    title: "Abende",
    key: "abende",
    sorter: nachZahl<VergleichZeile>((z) => z.abende),
    render: (_, z) => <span style={T.body}>{z.abende}</span>,
  },
  {
    title: "Rücklauf Ø",
    key: "ruecklauf",
    sorter: nachZahl<VergleichZeile>((z) => z.ruecklauf),
    // Kein erfundener Nenner (§2.3): ohne Teilnehmerzahl steht „—".
    render: (_, z) => (
      <span style={T.body}>{z.ruecklauf === null ? "—" : `${z.ruecklauf} %`}</span>
    ),
  },
  {
    title: "Ø Note (1 = beste)",
    key: "note",
    sorter: nachZahl<VergleichZeile>((z) => z.note),
    /*
     * DIE ZUSAGE DES ENTWURFS ALS ANFANGSZUSTAND (§3.4, „bester zuerst"), nicht
     * als bloße Möglichkeit im Kopf. Aufsteigend, weil 1 die beste Note ist;
     * Gruppen ohne Ø stehen damit hinten — ein `null` vorn wäre die beste Note.
     */
    defaultSortOrder: "ascend",
    render: (_, z) => (
      <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Notenpille note={z.note} />
        {z.hasLegacyScale && <Altbestandsfussnote />}
      </span>
    ),
  },
  {
    // Kein `sorter`: die Spalte zeigt einen Verlauf, keinen Wert — wonach sie
    // ordnen sollte, wäre eine erfundene Kennzahl.
    title: "Verlauf",
    key: "funke",
    render: (_, z) => (z.noten.length > 0 ? <Notenfunke noten={z.noten} /> : null),
  },
];

export function VergleichTabelle({ zeilen }: { zeilen: VergleichZeile[] }) {
  return (
    <Kartentabelle<VergleichZeile>
      rowKey="groupId"
      aria-label="Gruppenvergleich"
      dataSource={zeilen}
      size="small"
      /*
       * KEIN EIGENES `scroll` MEHR — `{ x: "max-content" }` ist die Vorgabe von
       * `Datentabelle`, und genau die braucht diese Tabelle. Sie ist die einzige
       * des Moduls ohne Schmalvariante (`Verlauf.tsx` hat eine, §2.5); gemessen
       * bei 390px war sie 545px breit in einem 358px-Kasten und die Spalte
       * VERLAUF unerreichbar. `max-content` und keine Zahl, weil KEINE Spalte
       * ein `width` traegt — der Notenfunke hat mit 132px einen harten Boden.
       * ⚠️ Das gilt nur, solange keine Spalte ein `ellipsis` bekommt: das kippte
       * rc-table auf `table-layout: fixed` und damit das ganze Desktop-Bild.
       * `tabellen.test.ts` haelt beides fest.
       */
      /*
       * §4.3, Punkt 5: der Leertext nennt den nächsten Schritt statt nur den
       * Zustand — die einzige Stelle, an der er entsteht, ist der Einstieg
       * (`+ Neue Gruppe`), den nur ein Admin sieht, also derselbe Kreis, der
       * diese Seite überhaupt erreicht.
       */
      leer={{ nichts: 'Keine Gruppen — leg eine unter „Deine Gruppen" an.' }}
      onRow={() => ({ "data-testid": "vergleich-row" }) as React.HTMLAttributes<HTMLElement>}
      columns={SPALTEN}
    />
  );
}

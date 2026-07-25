"use client";

import Link from "next/link";
import { Table } from "antd";
import { Altbestandsfussnote, Notenfunke, Notenpille } from "./Noten";
import { T } from "./typo";

/**
 * DER GRUPPENVERGLEICH ALS TABELLE (Entwurf §3.4).
 *
 * DAS BALKENDIAGRAMM ENTFÄLLT, und das ist keine Geschmacksfrage: `core/charts`
 * färbt mit `token.colorPrimary` — in diesem Projekt DRK-Rot (§4.9) — und ein
 * Balken „länger = schlechter" auf einer invertierten Skala ist genau der
 * Sachfehler, den diese Spec verbietet. Die Pillenspalte ist vertikal gelesen
 * selbst der Vergleich.
 *
 * DIE ORDNUNG KOMMT FERTIG AUS DER SEITE — aufsteigend nach Ø, bester zuerst
 * (§3.4). BEWUSST KEIN antd-`sorter`: der gäbe die Ordnung an antd ab, und die
 * Zusage „bester zuerst" wäre nur noch eine Vorgabe im Spaltenkopf. Der Kopf sagt
 * die Richtung mit („1 = beste"), sonst liest sich die bessere Gruppe wie die
 * schlechtere.
 *
 * WARUM CLIENT (§4.13, Falle 2): `columns[].render` sind Funktionen, die eine
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

export function VergleichTabelle({ zeilen }: { zeilen: VergleichZeile[] }) {
  return (
    <Table<VergleichZeile>
      rowKey="groupId"
      dataSource={zeilen}
      pagination={false}
      size="small"
      locale={{ emptyText: "Keine Gruppen" }}
      onRow={() => ({ "data-testid": "vergleich-row" }) as React.HTMLAttributes<HTMLElement>}
      columns={[
        {
          title: <span style={T.kicker}>GRUPPE</span>,
          key: "name",
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
          title: <span style={T.kicker}>ABENDE</span>,
          key: "abende",
          render: (_, z) => <span style={T.body}>{z.abende}</span>,
        },
        {
          title: <span style={T.kicker}>RÜCKLAUF Ø</span>,
          key: "ruecklauf",
          // Kein erfundener Nenner (§2.3): ohne Teilnehmerzahl steht „—".
          render: (_, z) => (
            <span style={T.body}>{z.ruecklauf === null ? "—" : `${z.ruecklauf} %`}</span>
          ),
        },
        {
          title: <span style={T.kicker}>Ø NOTE (1 = BESTE)</span>,
          key: "note",
          render: (_, z) => (
            <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Notenpille note={z.note} />
              {z.hasLegacyScale && <Altbestandsfussnote />}
            </span>
          ),
        },
        {
          title: <span style={T.kicker}>VERLAUF</span>,
          key: "funke",
          render: (_, z) => (z.noten.length > 0 ? <Notenfunke noten={z.noten} /> : null),
        },
      ]}
    />
  );
}

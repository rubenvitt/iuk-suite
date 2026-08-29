"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Progress, Table, Tag } from "antd";
import { datumKurz, datumZeit } from "../../_lib/datum";
import type { ParticipantProgressDTO } from "../../_lib/typen";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * Eine Übersichtszeile plus den fertigen Magic-Link-String (Fix-Runde 1,
 * Parität mit `uav-praxis/src/admin/ParticipantsPage.tsx:133-146`, das
 * Login-Code UND Link-Kopieren je Zeile zeigt). Der Link wird IMMER
 * serverseitig gebaut (`_lib/magicLink.ts`, Aufgabe 16) — `(admin)/admin/
 * page.tsx` reicht ihn fertig herein, diese Client-Komponente ruft `magicLink()`
 * selbst nie auf.
 */
export interface TeilnehmerZeile extends ParticipantProgressDTO {
  magicLink: string;
}

/*
 * DIE TEILNEHMER-ÜBERSICHT ALS TABELLE (Aufgabe 15). Eigene `"use client"`-
 * Komponente mit nur serialisierbaren Daten als Prop (Falle 9 — `<Table
 * columns={[{render}]}>` geht nicht direkt aus einer Server Component),
 * Vorbild `aufgaben/_ui/PersonenTabelle.tsx`.
 *
 * `Progress` OHNE `status="exception"` und `Tag` OHNE `color="red"` — CLAUDE.md
 * Falle 3: Suite-Rot ist fachlich reserviert, „inaktiv" ist hier keine
 * Fehlermeldung.
 *
 * DER NAME IST EIN `next/link` MIT GEERBTER FARBE, UND BEIDES AUS EINEM EIGENEN
 * GRUND. Vorher stand dort ein nacktes `<a href>`:
 *
 * 1. Ein `<a>` warf die ganze Anwendung weg und lud sie neu, obwohl das Ziel im
 *    selben Modul liegt — dieselbe Begründung, aus der `core/shell/SuiteNav.tsx`
 *    und `core/shell/Seitenkopf.tsx` `next/link` benutzen.
 * 2. Ein unbehandelter Anker trägt antds `colorLink`, und das ist in dieser Suite
 *    Suite-Rot: `colorError === colorPrimary === #c8000f` (Falle 3). Zwei
 *    Teilnehmernamen leuchteten rot in einer Tabelle, in der nichts fehlerhaft war
 *    — Rot gehört auf Chrome, nie auf eine Datenfläche. `color: "inherit"` plus
 *    Unterstreichung: die Bedeutung „das ist ein Weg" trägt damit die Form, nicht
 *    die Farbe (`docs/design/README.md`, „Bedeutung nie allein über Farbe").
 *
 * `minHeight: 44` AM ZEILENLINK (WCAG 2.5.5, `ARBEITSDICHTE`): der Link ist rohes
 * Markup außerhalb jeder antd-Steuerung und erbt die 44px nicht — dieselbe Lage und
 * dieselbe Antwort wie am Rückweg in `core/shell/Seitenkopf.tsx`.
 *
 * DIE SPALTENKÖPFE TRAGEN IHRE ROLLE IN `columns[].title` UND NICHT IN CSS
 * (`docs/design/README.md`, „Spaltenköpfe einer antd-`Table`"): antd bietet für den
 * Kopf allein keine Typo-Token an — `cellFontSize` & Co. treffen Kopf UND Rumpf —,
 * und eine Regel gegen `.ant-table-thead th` koppelte an einen antd-internen
 * Klassennamen, den ein Major still bricht. Ohne diesen Griff unterscheidet sich der
 * Kopf vom Zelleninhalt allein durch das Schriftgewicht.
 */
export function TeilnehmerTabelle({ zeilen }: { zeilen: TeilnehmerZeile[] }) {
  const [kopiert, setKopiert] = useState<string | null>(null);

  function kopieren(text: string, markierung: string): void {
    navigator.clipboard?.writeText(text).then(
      () => {
        setKopiert(markierung);
        window.setTimeout(() => setKopiert((m) => (m === markierung ? null : m)), 1800);
      },
      () => {
        /* Zwischenablage ohne Berechtigung — Text bleibt in der Zeile sichtbar. */
      },
    );
  }

  return (
    <Table<TeilnehmerZeile>
      rowKey={(zeile) => zeile.participant.id}
      dataSource={zeilen}
      pagination={false}
      scroll={{ x: "max-content" }}
      locale={{ emptyText: "Noch keine Teilnehmer angelegt." }}
      columns={[
        {
          title: <span style={SCHRIFT.kicker}>Name</span>,
          key: "name",
          render: (_: unknown, zeile: TeilnehmerZeile) => (
            <Link
              href={`/admin/teilnehmer/${zeile.participant.id}`}
              style={{
                color: "inherit",
                textDecoration: "underline",
                display: "inline-flex",
                alignItems: "center",
                minHeight: 44,
              }}
            >
              {zeile.participant.name}
            </Link>
          ),
        },
        {
          title: <span style={SCHRIFT.kicker}>Code</span>,
          key: "code",
          render: (_: unknown, zeile: TeilnehmerZeile) => <span style={SCHRIFT.mono}>{zeile.participant.loginCode}</span>,
        },
        {
          title: <span style={SCHRIFT.kicker}>Magic-Link</span>,
          key: "magicLink",
          render: (_: unknown, zeile: TeilnehmerZeile) => (
            <Button onClick={() => kopieren(zeile.magicLink, `link-${zeile.participant.id}`)}>
              {kopiert === `link-${zeile.participant.id}` ? "Kopiert" : "Link kopieren"}
            </Button>
          ),
        },
        {
          title: <span style={SCHRIFT.kicker}>Beginn</span>,
          key: "beginn",
          render: (_: unknown, zeile: TeilnehmerZeile) => datumKurz(zeile.participant.beginn) || "—",
        },
        {
          title: <span style={SCHRIFT.kicker}>Fortschritt</span>,
          key: "fortschritt",
          render: (_: unknown, zeile: TeilnehmerZeile) => (
            <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm, minWidth: 160 }}>
              <Progress percent={Math.round(zeile.quote * 100)} style={{ flex: 1 }} />
              <span>{zeile.erledigt}/{zeile.gesamt}</span>
            </div>
          ),
        },
        {
          title: <span style={SCHRIFT.kicker}>Letzte Aktivität</span>,
          key: "letzteAktivitaet",
          render: (_: unknown, zeile: TeilnehmerZeile) => datumZeit(zeile.participant.lastSeen) || "—",
        },
        {
          title: <span style={SCHRIFT.kicker}>Status</span>,
          key: "status",
          render: (_: unknown, zeile: TeilnehmerZeile) => (
            <Tag color={zeile.participant.aktiv ? "green" : "default"}>
              {zeile.participant.aktiv ? "aktiv" : "inaktiv"}
            </Tag>
          ),
        },
        {
          title: <span style={SCHRIFT.kicker}>Aktionen</span>,
          key: "aktionen",
          /*
           * Der Farbeinwand von oben trifft diesen Weg NICHT: ein `Button` traegt
           * antds Knopffarben, nicht `colorLink`. Er steht neben dem Namenslink und
           * ist keine Doppelung ohne Zweck — auf dem Telefon ist die Zeile
           * waagerecht gescrollt, und wer am rechten Ende der Zeile steht, kaeme
           * sonst nur ueber ein Zurueckscrollen zum Ziel.
           */
          render: (_: unknown, zeile: TeilnehmerZeile) => (
            <Button href={`/admin/teilnehmer/${zeile.participant.id}`}>Details</Button>
          ),
        },
      ]}
    />
  );
}

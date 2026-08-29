"use client";

import { useState } from "react";
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
          title: "Name",
          key: "name",
          render: (_: unknown, zeile: TeilnehmerZeile) => (
            <a href={`/admin/teilnehmer/${zeile.participant.id}`}>{zeile.participant.name}</a>
          ),
        },
        {
          title: "Code",
          key: "code",
          render: (_: unknown, zeile: TeilnehmerZeile) => <span style={SCHRIFT.mono}>{zeile.participant.loginCode}</span>,
        },
        {
          title: "Magic-Link",
          key: "magicLink",
          render: (_: unknown, zeile: TeilnehmerZeile) => (
            <Button onClick={() => kopieren(zeile.magicLink, `link-${zeile.participant.id}`)}>
              {kopiert === `link-${zeile.participant.id}` ? "Kopiert" : "Link kopieren"}
            </Button>
          ),
        },
        {
          title: "Beginn",
          key: "beginn",
          render: (_: unknown, zeile: TeilnehmerZeile) => datumKurz(zeile.participant.beginn) || "—",
        },
        {
          title: "Fortschritt",
          key: "fortschritt",
          render: (_: unknown, zeile: TeilnehmerZeile) => (
            <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm, minWidth: 160 }}>
              <Progress percent={Math.round(zeile.quote * 100)} style={{ flex: 1 }} />
              <span>{zeile.erledigt}/{zeile.gesamt}</span>
            </div>
          ),
        },
        {
          title: "Letzte Aktivität",
          key: "letzteAktivitaet",
          render: (_: unknown, zeile: TeilnehmerZeile) => datumZeit(zeile.participant.lastSeen) || "—",
        },
        {
          title: "Status",
          key: "status",
          render: (_: unknown, zeile: TeilnehmerZeile) => (
            <Tag color={zeile.participant.aktiv ? "green" : "default"}>
              {zeile.participant.aktiv ? "aktiv" : "inaktiv"}
            </Tag>
          ),
        },
        {
          title: "Aktionen",
          key: "aktionen",
          render: (_: unknown, zeile: TeilnehmerZeile) => (
            <Button href={`/admin/teilnehmer/${zeile.participant.id}`}>Details</Button>
          ),
        },
      ]}
    />
  );
}

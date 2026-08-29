"use client";

import { Button, Progress, Table, Tag } from "antd";
import type { ParticipantProgressDTO } from "../../_lib/typen";

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
export function TeilnehmerTabelle({ zeilen }: { zeilen: ParticipantProgressDTO[] }) {
  return (
    <Table<ParticipantProgressDTO>
      rowKey={(zeile) => zeile.participant.id}
      dataSource={zeilen}
      pagination={false}
      scroll={{ x: "max-content" }}
      locale={{ emptyText: "Noch keine Teilnehmer angelegt." }}
      columns={[
        {
          title: "Name",
          key: "name",
          render: (_: unknown, zeile: ParticipantProgressDTO) => (
            <a href={`/admin/teilnehmer/${zeile.participant.id}`}>{zeile.participant.name}</a>
          ),
        },
        {
          title: "Beginn",
          key: "beginn",
          render: (_: unknown, zeile: ParticipantProgressDTO) => zeile.participant.beginn ?? "—",
        },
        {
          title: "Fortschritt",
          key: "fortschritt",
          render: (_: unknown, zeile: ParticipantProgressDTO) => (
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 160 }}>
              <Progress percent={Math.round(zeile.quote * 100)} style={{ flex: 1 }} />
              <span>{zeile.erledigt}/{zeile.gesamt}</span>
            </div>
          ),
        },
        {
          title: "Letzte Aktivität",
          key: "letzteAktivitaet",
          render: (_: unknown, zeile: ParticipantProgressDTO) => zeile.participant.lastSeen ?? "—",
        },
        {
          title: "Status",
          key: "status",
          render: (_: unknown, zeile: ParticipantProgressDTO) => (
            <Tag color={zeile.participant.aktiv ? "green" : "default"}>
              {zeile.participant.aktiv ? "aktiv" : "inaktiv"}
            </Tag>
          ),
        },
        {
          title: "Aktionen",
          key: "aktionen",
          render: (_: unknown, zeile: ParticipantProgressDTO) => (
            <Button href={`/admin/teilnehmer/${zeile.participant.id}`}>Details</Button>
          ),
        },
      ]}
    />
  );
}

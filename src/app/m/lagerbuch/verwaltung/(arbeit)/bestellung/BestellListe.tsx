"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Flex, Table, Tooltip, type TableProps } from "antd";
import { markiereBestellt } from "../../../_actions/bestellung";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import s from "../../../_ui/verwaltung.module.css";

/**
 * Serialisierbarer Vertrag der Client-Insel. Der Datenbankzeitpunkt wird auf
 * der RSC-Seite formatiert; insbesondere gelangt kein `Date` ueber die
 * Server/Client-Grenze.
 */
export type BestellAnzeigeZeile = {
  id: string;
  name: string;
  einheit: string;
  fach: string;
  bestand: number;
  mindestbestand: number;
  vorschlag: number;
  bestellt: boolean;
  bestelltSeitText: string | null;
  wareOffenbarDa: boolean;
};

export function statusChip(
  z: BestellAnzeigeZeile,
): { ton: "rot" | "gelb" | "ok"; text: string } {
  // „Offenbar" ist absichtlich vorsichtig: belegt ist nur eine weiterhin
  // stehende Markierung bei inzwischen gedecktem Bestand, nicht die Ursache.
  if (z.wareOffenbarDa) {
    return { ton: "gelb", text: "Ware offenbar eingetroffen" };
  }
  if (z.bestellt) {
    return z.bestelltSeitText
      ? { ton: "ok", text: `bestellt seit ${z.bestelltSeitText}` }
      : { ton: "ok", text: "bestellt" };
  }
  return { ton: "rot", text: "offen" };
}

const SPERRGRUND =
  "CSV-Download und Zwischenablage kommen mit Teil 6 (§9.2/§9.3).";

export function BestellListe({ zeilen }: { zeilen: BestellAnzeigeZeile[] }) {
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);

  function markierungAendern(z: BestellAnzeigeZeile): void {
    start(async () => {
      setFehler(null);
      try {
        const ergebnis = await markiereBestellt({
          artikelId: z.id,
          bestellt: !z.bestellt,
        });
        if (!ergebnis.ok) setFehler(ergebnis.fehler);
      } catch {
        setFehler("Bestellmarkierung konnte nicht gespeichert werden.");
      }
    });
  }

  const spalten: TableProps<BestellAnzeigeZeile>["columns"] = [
    {
      title: "",
      dataIndex: "bestellt",
      key: "markierung",
      width: 48,
      render: (_bestellt: boolean, z) => (
        <Button
          shape="circle"
          disabled={laeuft}
          aria-label={
            z.bestellt ? "Bestellung zurücknehmen" : "Als bestellt markieren"
          }
          icon={z.bestellt ? <Ikone name="haken" groesse={15} /> : undefined}
          onClick={() => markierungAendern(z)}
        />
      ),
    },
    {
      title: "Artikel",
      dataIndex: "name",
      key: "name",
      render: (name: string, z) => (
        <span
          style={
            z.bestellt
              ? { textDecoration: "line-through", ...SCHRIFT.neben }
              : { fontWeight: 600 }
          }
        >
          {name}
        </span>
      ),
    },
    {
      title: "Fach",
      dataIndex: "fach",
      key: "fach",
      render: (fach: string) => <span className={s.fach}>{fach}</span>,
    },
    {
      title: "Bestand / Min.",
      dataIndex: "bestand",
      key: "bestand",
      render: (bestand: number, z) => (
        <span style={SCHRIFT.neben}>
          {bestand} / min. {z.mindestbestand}
        </span>
      ),
    },
    {
      title: "Status",
      dataIndex: "bestellt",
      key: "status",
      render: (_bestellt: boolean, z) => {
        const status = statusChip(z);
        return <Chip ton={status.ton}>{status.text}</Chip>;
      },
    },
    {
      title: "Vorschlag",
      dataIndex: "vorschlag",
      key: "vorschlag",
      align: "right",
      render: (vorschlag: number, z) => (
        <span style={SCHRIFT.zahl}>
          {vorschlag}
          <span style={{ ...SCHRIFT.neben, marginInlineStart: 4 }}>
            {z.einheit}
          </span>
        </span>
      ),
    },
  ];

  return (
    <>
      {fehler ? (
        <Alert
          type="warning"
          showIcon={false}
          title={fehler}
          style={{ marginBlockEnd: 12 }}
        />
      ) : null}

      <Flex gap={12} wrap align="center" style={{ marginBlockEnd: 12 }}>
        {/* Disabled antd-Buttons empfangen kein Hover. Tooltip und nativer
            title liegen deshalb am umschliessenden span. */}
        <Tooltip title={SPERRGRUND}>
          <span data-rolle="clipboard" title={SPERRGRUND}>
            <Button disabled icon={<Ikone name="kopieren" groesse={16} />}>
              Liste kopieren
            </Button>
          </span>
        </Tooltip>
        <Tooltip title={SPERRGRUND}>
          <span data-rolle="csv" title={SPERRGRUND}>
            <Button disabled icon={<Ikone name="herunterladen" groesse={16} />}>
              CSV
            </Button>
          </span>
        </Tooltip>
      </Flex>

      <Table<BestellAnzeigeZeile>
        rowKey="id"
        pagination={false}
        scroll={{ x: "max-content" }}
        aria-label="Bestellvorschlag"
        dataSource={zeilen}
        locale={{ emptyText: "Kein Unterbestand und keine offene Bestellmarkierung." }}
        columns={spalten}
      />
    </>
  );
}

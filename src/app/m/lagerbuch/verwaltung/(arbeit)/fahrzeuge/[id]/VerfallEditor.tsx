"use client";

import { useState, useTransition } from "react";
import { Alert, DatePicker, Table, type TableProps } from "antd";
import dayjs from "dayjs";
import { verfallSetzen } from "../../../../_actions/lagerortVerfall";
import type { AmpelTon } from "../../../../_lib/format";
import { Chip } from "../../../../_ui/Chip";
import { monatAusPicker } from "../../../../_ui/monat";

const VERFALL_FEHLER = "Verfall konnte nicht gespeichert werden.";

export type VerfallAnzeigeZeile = {
  artikelId: string;
  artikelName: string;
  fachText: string;
  verfall: string | null;
  statusTon: AmpelTon | null;
  statusText: string | null;
};

export function VerfallEditor({
  lagerortId,
  eintraege,
}: {
  lagerortId: string;
  eintraege: VerfallAnzeigeZeile[];
}) {
  const [spiegel, setSpiegel] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(eintraege.map((eintrag) => [eintrag.artikelId, eintrag.verfall])));
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, startTransition] = useTransition();

  function monatFuer(eintrag: VerfallAnzeigeZeile): string | null {
    return Object.prototype.hasOwnProperty.call(spiegel, eintrag.artikelId)
      ? spiegel[eintrag.artikelId]
      : eintrag.verfall;
  }

  function monatSetzen(eintrag: VerfallAnzeigeZeile, wert: Parameters<typeof monatAusPicker>[0]) {
    const monat = monatAusPicker(wert) ?? "";
    setSpiegel((vorher) => ({
      ...vorher,
      [eintrag.artikelId]: monat || null,
    }));
    startTransition(async () => {
      try {
        const ergebnis = await verfallSetzen({
          lagerortId,
          artikelId: eintrag.artikelId,
          verfall: monat,
        });
        setFehler(ergebnis.ok ? null : VERFALL_FEHLER);
      } catch {
        setFehler(VERFALL_FEHLER);
      }
    });
  }

  const spalten: TableProps<VerfallAnzeigeZeile>["columns"] = [
    {
      title: "Artikel",
      dataIndex: "artikelName",
      key: "artikel",
      render: (name: string) => <strong>{name}</strong>,
    },
    { title: "Fach", dataIndex: "fachText", key: "fach" },
    {
      title: "Verfall",
      dataIndex: "verfall",
      key: "verfall",
      render: (_verfall: string | null, eintrag) => {
        const monat = monatFuer(eintrag);
        return (
          <DatePicker
            picker="month"
            format="YYYY-MM"
            allowClear
            size="small"
            disabled={laeuft}
            value={monat ? dayjs(`${monat}-01`) : null}
            onChange={(wert) => monatSetzen(eintrag, wert)}
            aria-label={`Verfall ${eintrag.artikelName}`}
          />
        );
      },
    },
    {
      title: "Status",
      dataIndex: "statusText",
      key: "status",
      render: (statusText: string | null, eintrag) => statusText && eintrag.statusTon ? (
        <Chip ton={eintrag.statusTon}>{statusText}</Chip>
      ) : (
        <Chip ton="grau">nicht erfasst</Chip>
      ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
      <Table<VerfallAnzeigeZeile>
        rowKey="artikelId"
        pagination={false}
        scroll={{ x: "max-content" }}
        aria-label="Verfall im Fahrzeug"
        dataSource={eintraege}
        locale={{
          emptyText: "Keine aktive Soll-Position. Verfall wird je Soll-Artikel gepflegt.",
        }}
        columns={spalten}
      />
    </div>
  );
}

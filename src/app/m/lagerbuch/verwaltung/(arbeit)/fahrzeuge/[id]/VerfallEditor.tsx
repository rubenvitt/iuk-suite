"use client";

import { useState, useTransition } from "react";
import { Alert, DatePicker, Table, type TableProps } from "antd";
import dayjs from "dayjs";
import { SPACE } from "@/core/theme/tokens";
import { verfallSetzen } from "../../../../_actions/lagerortVerfall";
import type { AmpelTon } from "../../../../_lib/format";
import { SCHRIFT } from "../../../../_lib/schrift";
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
      // DER GEWAEHLTE MONAT BLEIBT AUCH IM FEHLERFALL STEHEN — absichtlich, und
      // `VerfallEditor.test.tsx` haelt es fest. Die Eingabe einer Person zu
      // verwerfen, weil das Speichern scheiterte, ist schlimmer als die
      // Statusspalte, die bis zum naechsten Laden den alten Stand nennt. Den
      // Widerspruch aufloest der Fehlersatz, nicht das Zuruecksetzen.
      try {
        const ergebnis = await verfallSetzen({
          lagerortId,
          artikelId: eintrag.artikelId,
          verfall: monat,
        });
        // Der Satz aus der Action statt der Modulkonstante: nur er
        // unterscheidet „Artikel steht an diesem Lagerort nicht im Soll." von
        // einem Schreibfehler. Im `catch` bleibt die Konstante — dort ist
        // `e.message` in Produktion Framework-Englisch.
        setFehler(ergebnis.ok ? null : ergebnis.fehler);
      } catch {
        setFehler(VERFALL_FEHLER);
      }
    });
  }

  const spalten: TableProps<VerfallAnzeigeZeile>["columns"] = [
    {
      title: <span style={SCHRIFT.feldname}>Artikel</span>,
      dataIndex: "artikelName",
      key: "artikel",
      render: (name: string) => <strong>{name}</strong>,
    },
    { title: <span style={SCHRIFT.feldname}>Fach</span>, dataIndex: "fachText", key: "fach" },
    {
      title: <span style={SCHRIFT.feldname}>Verfall</span>,
      dataIndex: "verfall",
      key: "verfall",
      render: (_verfall: string | null, eintrag) => {
        const monat = monatFuer(eintrag);
        return (
          // KEIN size="small": die alte Zeilenaktions-Ausnahme (Falle 4,
          // docs/design/README.md) ist mit der Arbeitsdichte gefallen -- 44px
          // ist hier bereits die volle wie die halbe Bediendichte, "small"
          // unterbietet die Mindesttapflaeche (WCAG 2.5.5).
          <DatePicker
            picker="month"
            format="YYYY-MM"
            allowClear
            disabled={laeuft}
            value={monat ? dayjs(`${monat}-01`) : null}
            onChange={(wert) => monatSetzen(eintrag, wert)}
            aria-label={`Verfall ${eintrag.artikelName}`}
          />
        );
      },
    },
    {
      title: <span style={SCHRIFT.feldname}>Status</span>,
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
    <div style={{ display: "grid", gap: SPACE.md }}>
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

"use client";

import { Button, Drawer, type TableProps } from "antd";
import { flyinBreite } from "@/core/theme/flyin";
import { Kartentabelle, Zellentext } from "@/core/tabelle";
import type { ImportLesung, ImportZeile } from "../../_lib/bibliothek/csv";
import type { BibEinheit } from "../../_lib/bibliothek/typen";
import { importVorschau, STATUS_TEXT, type VorschauZeile } from "../../_lib/bibliothek/vorschau";

const SPALTEN: NonNullable<TableProps<VorschauZeile>["columns"]> = [
  { key: "zeile", title: "Zeile", dataIndex: "zeile" },
  { key: "typ", title: "Typ", dataIndex: "typ" },
  { key: "rufname", title: "Rufname", dataIndex: "rufname" },
  { key: "notiz", title: "Notiz", render: (_: unknown, z: VorschauZeile) => <Zellentext text={z.notiz ?? "—"} /> },
  { key: "status", title: "Status", render: (_: unknown, z: VorschauZeile) => <span className={`kp-chip${z.status === "neu" ? "" : " kp-chip-hinweis"}`}>{STATUS_TEXT[z.status]}</span> },
];

/**
 * VORSCHAU VOR DER ÜBERNAHME (Entscheidung 12): je Zeile der Status; mit Fehlern ist „übernehmen" gesperrt —
 * nichts wird still gekürzt. Übernommen werden nur die neuen Zeilen.
 */
export function ImportVorschau({ lesung, vorhanden, laeuft, onUebernehmen, onSchliessen }: {
  lesung: ImportLesung | null; vorhanden: readonly BibEinheit[]; laeuft: boolean;
  onUebernehmen: (neu: ImportZeile[]) => void; onSchliessen: () => void;
}) {
  const v = lesung ? importVorschau(lesung.zeilen, vorhanden) : null;
  const gesperrt = !lesung || lesung.fehler.length > 0 || v!.neu.length === 0 || laeuft;
  return (
    <Drawer open={lesung !== null} onClose={onSchliessen} title="Einheiten importieren" size={flyinBreite(640)} destroyOnHidden rootClassName="kp-flyin">
      {lesung && v ? (
        <div className="kp-formular">
          {lesung.fehler.length > 0 ? (
            <ul className="kp-feldfehler" role="status">{lesung.fehler.map((f) => <li key={f}>{f}</li>)}</ul>
          ) : <p className="kp-hilfe">{`${v.neu.length} neu, ${v.zeilen.length - v.neu.length} übersprungen.`}</p>}
          <Kartentabelle<VorschauZeile> aria-label="Vorschau" rowKey="zeile" dataSource={v.zeilen} columns={SPALTEN} leer={{ nichts: "Die Liste enthält keine Einheit." }} karte={{ titel: "rufname", kennzeichen: ["status"] }} />
          <div className="kp-formular-knoepfe">
            <Button type="primary" disabled={gesperrt} loading={laeuft} onClick={() => onUebernehmen(v.neu)}>{`${v.neu.length} übernehmen`}</Button>
            <Button onClick={onSchliessen}>Abbrechen</Button>
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}

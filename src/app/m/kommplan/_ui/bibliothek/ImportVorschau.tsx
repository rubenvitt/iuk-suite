"use client";

import { Alert, Button, Drawer, type TableProps } from "antd";
import { flyinBreite } from "@/core/theme/flyin";
import { Kartentabelle, Zellentext } from "@/core/tabelle";
import type { ImportLesung, ImportZeile } from "../../_lib/bibliothek/csv";
import type { BibEinheit } from "../../_lib/bibliothek/typen";
import { importVorschau, STATUS_TEXT, type VorschauZeile } from "../../_lib/bibliothek/vorschau";

const SPALTEN: NonNullable<TableProps<VorschauZeile>["columns"]> = [
  { key: "zeile", title: "Zeile", dataIndex: "zeile" },
  { key: "typ", title: "Typ", dataIndex: "typ" },
  // Zellentext: ein langer Rufname bricht um, statt Status und „Abbrechen“ aus dem Flyin zu schieben (Review Phase 4).
  { key: "rufname", title: "Rufname", render: (_: unknown, z: VorschauZeile) => <Zellentext text={z.rufname} /> },
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
          {/* Fehler deutlich (Warnstil, nie Rot — Falle 3): die fehlerhafte Zeile steht nicht in der Tabelle, der Grund
              für den gesperrten Knopf nur hier (Review Phase 4). */}
          {lesung.fehler.length > 0 ? (
            <Alert type="warning" showIcon role="status" title="Nichts übernommen — die Liste hat Fehler:"
              description={<ul className="kp-fehlerliste">{lesung.fehler.map((f) => <li key={f}>{f}</li>)}</ul>} />
          ) : <p className="kp-hilfe">{`${v.neu.length} neu, ${v.zeilen.length - v.neu.length} übersprungen.`}</p>}
          <Kartentabelle<VorschauZeile> aria-label="Vorschau" rowKey="zeile" dataSource={v.zeilen} columns={SPALTEN} leer={{ nichts: "Die Liste enthält keine Einheit." }} karte={{ titel: "rufname", kennzeichen: ["status"] }} />
          <div className="kp-formular-knoepfe">
            <Button type="primary" disabled={gesperrt} loading={laeuft} onClick={() => onUebernehmen(v.neu)}>{`${v.neu.length} übernehmen`}</Button>
            <Button onClick={onSchliessen}>Abbrechen</Button>
          </div>
          {lesung.fehler.length > 0 ? <p className="kp-hilfe">Gesperrt, bis die Fehler oben behoben sind: Liste korrigieren und neu einlesen.</p> : null}
        </div>
      ) : null}
    </Drawer>
  );
}

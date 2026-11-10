"use client";

import { useMemo } from "react";
import { Card, Radio } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import type { Lage, LagekarteObjektDTO } from "../_lib/lagekarteRegeln";
import { SZENARIEN, vorschau, type Szenario, type VorschauEingabe, type VorschauMeldung } from "../_lib/vorschau";
import { MonitorVorschau } from "./MonitorVorschau";
import v from "./verwaltung.module.css";

/**
 * Die Vorschau des Monitors mit Beispieldaten, rechts neben der Arbeit (am Telefon darunter). „Meldungen" und
 * „Einrichtung" zeigen dieselbe (IDA-396); die Einrichtung kennzeichnet Ungespeichertes als Entwurf.
 */
export function VorschauSpalte({
  eingabe,
  band,
  szenario,
  onSzenario,
  lagekarte,
  geaendert = false,
}: {
  eingabe: VorschauEingabe;
  band: VorschauMeldung[];
  szenario: Szenario;
  onSzenario: (s: Szenario) => void;
  lagekarte: { objekte: LagekarteObjektDTO[]; mitte: Lage; zoom: number };
  geaendert?: boolean;
}) {
  const bild = useMemo(() => vorschau(eingabe, szenario, band), [eingabe, szenario, band]);
  return (
    <aside className={v.vorschauSpalte} aria-label="Vorschau">
      <Card title="Vorschau" extra={<span style={SCHRIFT.neben} className={v.gedaempft}>mit Beispieldaten</span>}>
        <div style={{ display: "grid", gap: SPACE.md }}>
          <div role="status" className={v.entwurfStatus}>
            {geaendert ? <span className={v.entwurfMarke} data-rolle="vorschau-entwurf">Entwurf – noch nicht am Monitor</span> : null}
          </div>
          <Radio.Group
            aria-label="Beispiellage"
            value={szenario}
            onChange={(e) => onSzenario(e.target.value as Szenario)}
            options={SZENARIEN.map((s) => ({ value: s.wert, label: s.text }))}
            optionType="button"
          />
          <MonitorVorschau v={bild} szenario={szenario} standort={eingabe.standortName} lagekarte={lagekarte} />
        </div>
      </Card>
    </aside>
  );
}

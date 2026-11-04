"use client";

import { Card } from "antd";
import { Ruhezustand } from "@/core/ruhe";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { mangelBehebenAction } from "../_actions/verwaltung";
import type { MangelDTO } from "../_lib/typen";
import { GruppenFilter } from "./GruppenFilter";
import { MangelEintrag } from "./MangelEintrag";
import { useAktion } from "./useAktion";
import s from "./wartung.module.css";

export function MaengelListe({ offen, behoben, gruppenWahl, gewaehlt }: {
  offen: MangelDTO[];
  behoben: MangelDTO[];
  gruppenWahl: { id: string; name: string }[];
  gewaehlt: string | null;
}) {
  const { laeuft, fuehreAus } = useAktion();
  return (
    <>
      <Seitenkopf titel="Mängel" aktionen={<GruppenFilter wahl={gruppenWahl} gewaehlt={gewaehlt} />} />
      <Card title={`Offen (${offen.length})`}>
        {offen.length === 0 ? <Ruhezustand figur="erledigt" titel="Keine offenen Mängel" groesse="klein" /> : offen.map((m) => (
          <MangelEintrag key={m.id} m={m} mitGeraet laeuft={laeuft} onBehoben={(id) => fuehreAus(() => mangelBehebenAction(id), "Als behoben eingetragen.")} />
        ))}
      </Card>
      <Card title="Zuletzt behoben">
        {behoben.length === 0 ? <p className={s.neben} style={{ margin: 0 }}>Noch nichts behoben.</p> : behoben.map((m) => <MangelEintrag key={m.id} m={m} mitGeraet />)}
      </Card>
    </>
  );
}

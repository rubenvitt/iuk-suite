"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Drawer } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { flyinBreite } from "@/core/theme/flyin";
import type { FahrzeugWahl, PlanungKurz } from "../_lib/typen";
import { zeitspanne } from "../_lib/zeit";
import { PlanungFormular } from "./formulare";
import s from "./schichtplan.module.css";
import { Chip } from "./teile";
import { useTokensAmBody } from "./useTokensAmBody";

/** Die Übersicht: eine Karte je Planung mit Besetzung und Konflikten, dazu „Neue Planung“. */
export function Planungsliste({ liste, fahrzeuge }: { liste: PlanungKurz[]; fahrzeuge: FahrzeugWahl[] }) {
  const router = useRouter();
  useTokensAmBody();
  const [neu, setNeu] = useState(false);
  return (
    <div className={s.modul}>
      <Seitenkopf
        titel="Planungen"
        aktionen={<Button type="primary" onClick={() => setNeu(true)} icon={<Icons8Ikone name="plus" groesse={16} />}>Neue Planung</Button>}
      />
      {liste.length === 0 ? (
        <Card><span className={s.neben}>Noch keine Planung.</span></Card>
      ) : (
        <div className={s.karten}>
          {liste.map((p) => (
            <Card key={p.id} title={p.name} extra={<Chip ton="grau">{p.art === "lage" ? "Lage" : "Veranstaltung"}</Chip>}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span>{zeitspanne(p.von, p.bis, true)}</span>
                <span className={s.neben}>{p.ort || "Ort offen"} · {p.einheiten === 1 ? "1 Abschnitt oder Fahrzeug" : `${p.einheiten} Abschnitte und Fahrzeuge`} · {p.schichten} Schichten</span>
                <div className={s.zeile}>
                  <Chip ton={p.soll > 0 && p.ist === p.soll ? "ok" : "gelb"}>{p.ist}/{p.soll} Plätze</Chip>
                  {p.offen > 0 ? <Chip ton="gelb">{p.offen} offen</Chip> : null}
                  <Chip ton={p.konflikte ? "rot" : "ok"}>{p.konflikte === 1 ? "1 Konflikt" : `${p.konflikte} Konflikte`}</Chip>
                </div>
                <Button type="primary" href={`/p/${p.id}`} style={{ alignSelf: "flex-start" }}>Planung öffnen</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Drawer open={neu} onClose={() => setNeu(false)} size={flyinBreite(560)} title="Neue Planung" destroyOnHidden autoFocus={false} focusable={{ focusTriggerAfterClose: false }}>
        {neu ? <PlanungFormular planung={null} fahrzeuge={fahrzeuge} onGespeichert={(id) => router.push(`/p/${id}`)} /> : null}
      </Drawer>
    </div>
  );
}

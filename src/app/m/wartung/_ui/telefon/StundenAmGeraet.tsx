"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button, InputNumber } from "antd";
import { EntwurfHinweis } from "@/core/entwurf/EntwurfHinweis";
import { useEntwurf } from "@/core/entwurf/useEntwurf";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { stundenEintragenAction } from "../../_actions/telefon";
import { Kicker } from "../teile";
import s from "../wartung.module.css";

export function StundenAmGeraet({ geraetId, geraetName, zuletzt }: { geraetId: string; geraetName: string; zuletzt: number | null }) {
  const { message } = App.useApp();
  const router = useRouter();
  const [wert, setWert] = useState<number | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const zuKlein = wert !== null && zuletzt !== null && wert < zuletzt;

  // IDA-358: der abgelesene Stand bleibt auf dem Telefon, bis der Server ihn bestätigt; `sendung` hält Doppelte fern.
  const entwurf = useEntwurf<{ wert: number | null }, { stunden: number }, Awaited<ReturnType<typeof stundenEintragenAction>>>({
    schluessel: `wartung:stunden:${geraetId}`,
    stand: { wert },
    wiederherstellen: (w) => setWert(w.wert),
    senden: (d, sendung) => stundenEintragenAction(geraetId, { ...d, sendung }),
    antwort: (r) => {
      if (!r.ok) {
        setFehler(r.fehler);
        return false;
      }
      message.success("Gespeichert.");
      router.push(`/g/${geraetId}`);
      return true;
    },
  });
  const laeuft = entwurf.zustand === "sendet";

  const speichern = () => {
    if (wert === null || zuKlein || laeuft) return;
    setFehler(null);
    entwurf.sende({ stunden: wert });
  };

  return (
    <div className={s.telefon}>
      <section className={s.karte}>
        <Link href={`/g/${geraetId}`} className={s.zurueck}><Icons8Ikone name="chevron-left" groesse={16} /> {geraetName}</Link>
        <h1 className={s.geraetName} style={{ margin: 0 }}>Betriebsstunden</h1>
      </section>
      <section className={s.karte}>
        <Kicker className={s.karteTitel}>Stand am Zähler</Kicker>
        <InputNumber
          value={wert ?? undefined}
          onChange={(v) => setWert(v ?? null)}
          min={0}
          precision={0}
          suffix="h"
          inputMode="numeric"
          style={{ width: "100%" }}
          aria-label="Stand am Zähler"
          status={zuKlein || fehler ? "warning" : undefined}
          onPressEnter={speichern}
        />
        <div className={`${s.neben} ${s.klein}`} style={{ marginTop: 4 }} aria-live="polite">
          {fehler ?? (zuKlein ? `Kleiner als der letzte Stand (${zuletzt} h).` : zuletzt !== null ? `Zuletzt ${zuletzt} h` : null)}
        </div>
      </section>
      <div className={s.fuss}>
        <div className={s.entwurf}><EntwurfHinweis entwurf={entwurf} /></div>
        <Button type="primary" block disabled={wert === null || zuKlein} loading={laeuft} onClick={speichern}>Speichern</Button>
      </div>
    </div>
  );
}

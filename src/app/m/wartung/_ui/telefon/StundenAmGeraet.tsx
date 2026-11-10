"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button } from "antd";
import { EntwurfHinweis } from "@/core/entwurf/EntwurfHinweis";
import { useEntwurf } from "@/core/entwurf/useEntwurf";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { korrekturFrage, pruefeStundenEingabe, sprungFrage } from "../../_lib/stunden";
import { stundenEintragenAction } from "../../_actions/telefon";
import { Kicker } from "../teile";
import { StundenFeld } from "./StundenFeld";
import s from "../wartung.module.css";

/** Vor IDA-381 lag im Entwurf die Zahl (`wert`), seither der getippte Text; ein alter Entwurf kommt so noch an. */
type Stand = { text?: string; wert?: number | null };

/**
 * Betriebsstunden ablesen (IDA-381): ein großer Sprung und eine Korrektur nach unten gehen erst nach Rückfrage. Nach
 * unten korrigieren darf nur, wer die Gruppe des Geräts verwaltet (`darfKorrigieren`; der Server prüft es selbst).
 */
export function StundenAmGeraet({ geraetId, geraetName, zuletzt, darfKorrigieren = false }: {
  geraetId: string; geraetName: string; zuletzt: number | null; darfKorrigieren?: boolean;
}) {
  const { message } = App.useApp();
  const router = useRouter();
  const [text, setText] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  /** Der Wert, zu dem die Rückfrage gerade steht; ein anderer Wert stellt sie neu. */
  const [rueckfrage, setRueckfrage] = useState<number | null>(null);
  const befund = pruefeStundenEingabe(text, zuletzt);

  // IDA-358: der abgelesene Stand bleibt auf dem Telefon, bis der Server ihn bestätigt; `sendung` hält Doppelte fern.
  const entwurf = useEntwurf<Stand, { stunden: number; korrektur?: true }, Awaited<ReturnType<typeof stundenEintragenAction>>>({
    schluessel: `wartung:stunden:${geraetId}`,
    stand: { text },
    wiederherstellen: (w) => setText(w.text ?? (w.wert == null ? "" : String(w.wert))),
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

  const gesperrt = befund.art === "leer" || befund.art === "ungueltig" || (befund.art === "kleiner" && !darfKorrigieren);
  const frage = befund.art === "sprung" ? sprungFrage(befund.plus) : befund.art === "kleiner" && darfKorrigieren ? korrekturFrage(befund.zuletzt, befund.wert) : null;
  const fragtGerade = frage !== null && "wert" in befund && rueckfrage === befund.wert;

  const speichern = () => {
    if (gesperrt || laeuft || !("wert" in befund)) return;
    if (frage && !fragtGerade) {
      setRueckfrage(befund.wert);
      return;
    }
    setFehler(null);
    setRueckfrage(null);
    entwurf.sende(befund.art === "kleiner" ? { stunden: befund.wert, korrektur: true } : { stunden: befund.wert });
  };

  const tippe = (t: string) => {
    setText(t);
    setFehler(null);
  };

  return (
    <div className={s.telefon}>
      <section className={s.karte}>
        <Link href={`/g/${geraetId}`} className={s.zurueck}><Icons8Ikone name="chevron-left" groesse={16} /> {geraetName}</Link>
        <h1 className={s.geraetName} style={{ margin: 0 }}>Betriebsstunden</h1>
      </section>
      <section className={s.karte}>
        <Kicker className={s.karteTitel}>Stand am Zähler</Kicker>
        <StundenFeld id="stunden-feld" label="Stand am Zähler" text={text} setText={tippe} befund={befund} zuletzt={zuletzt} warnen={fehler} onEnter={speichern} />
      </section>
      <div className={s.fuss}>
        <div className={s.entwurf}><EntwurfHinweis entwurf={entwurf} /></div>
        {fragtGerade && <div className={s.rueckfrage} role="alert" data-rolle="stunden-rueckfrage">{frage}</div>}
        <Button type="primary" block disabled={gesperrt} loading={laeuft} onClick={speichern}>
          {fragtGerade ? (befund.art === "kleiner" ? "Ja, korrigieren" : "Ja, speichern") : befund.art === "kleiner" && darfKorrigieren ? "Korrigieren" : "Speichern"}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Input, Result } from "antd";
import { EntwurfHinweis } from "@/core/entwurf/EntwurfHinweis";
import { useEntwurf } from "@/core/entwurf/useEntwurf";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { NAME_MAX, NOTIZ_MAX } from "../../_lib/eingabe";
import type { SendeAntwort } from "../../_lib/koerper";
import { Kicker } from "../teile";
import { FotoWahl, verkleinere } from "./foto";
import { sendeAnRoute } from "./senden";
import s from "../wartung.module.css";

type Stand = { name: string; text: string; bereit: boolean | null };
type Nutzlast = { name: string; text: string; bereit: boolean };

/** Was nach dem Melden passiert, in einem Satz (IDA-381): das Gerät geht nur bei „Nein“ auf nicht einsatzbereit. */
function folgeText(bereit: boolean): string {
  return bereit
    ? "Die Verwaltung der Gruppe sieht den Mangel jetzt in ihrer Mängelliste."
    : "Das Gerät steht jetzt auf „Nicht einsatzbereit“, und die Verwaltung der Gruppe sieht den Mangel in ihrer Mängelliste.";
}

/**
 * `mitName`: ohne Anmeldung gemeldet — dann steht der Name, den man angibt, im Verlauf. Die Einsatzfrage hat keine
 * Vorauswahl (IDA-381): vorher stand „Ja, einsatzbereit“ schon da und ging ungelesen mit.
 */
export function MangelAmGeraet({ geraetId, geraetName, mitName = false }: { geraetId: string; geraetName: string; mitName?: boolean }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [bereit, setBereit] = useState<boolean | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [wahlFehlt, setWahlFehlt] = useState(false);
  /** Nach dem Melden: was gemeldet wurde (auch bei einer nach dem Neuladen nachgeschickten Meldung). */
  const [fertig, setFertig] = useState<boolean | null>(null);
  const gesendet = useRef<boolean | null>(null);
  const fotoRef = useRef(foto);
  useLayoutEffect(() => {
    fotoRef.current = foto;
  });

  /*
   * IDA-358: die Meldung liegt auf dem Telefon, bis die Route sie bestätigt; die Sendungs-ID ist die ID des
   * Mangels (`mangel/senden`), eine Wiederholung legt ihn nicht doppelt an. Das Foto liegt nicht im Entwurf —
   * nach dem Neuladen geht die Meldung ohne es (`PruefungAmGeraet.tsx`, `useEntwurf`).
   */
  const entwurf = useEntwurf<Stand, Nutzlast, SendeAntwort>({
    schluessel: `wartung:mangel:${geraetId}`,
    stand: { name, text, bereit },
    wiederherstellen: (w) => {
      setName(w.name);
      setText(w.text);
      setBereit(typeof w.bereit === "boolean" ? w.bereit : null);
    },
    senden: async (d, sendung) => {
      gesendet.current = d.bereit;
      const daten = new FormData();
      daten.set("sendung", sendung);
      daten.set("text", d.text);
      daten.set("einsatzbereit", d.bereit ? "ja" : "nein");
      if (mitName) daten.set("name", d.name);
      const f = fotoRef.current;
      if (f) daten.set("foto", await verkleinere(f), "foto.jpg");
      return sendeAnRoute(`/g/${geraetId}/mangel/senden`, daten);
    },
    antwort: (a) => {
      if (!a.ok) {
        setFehler(a.fehler);
        return false;
      }
      setFertig(gesendet.current ?? true);
      return true;
    },
  });
  const laeuft = entwurf.zustand === "sendet";

  function senden() {
    if (laeuft || !text.trim()) return;
    if (bereit === null) {
      setWahlFehlt(true);
      return;
    }
    setFehler(null);
    entwurf.sende({ name, text, bereit });
  }

  if (fertig !== null) {
    return (
      <div className={s.telefon}>
        <section className={s.karte} role="status" data-rolle="mangel-fertig">
          <Result status="success" title="Mangel gemeldet" subTitle={<span data-rolle="mangel-folge">{folgeText(fertig)}</span>} extra={<Button href={`/g/${geraetId}`}>Zurück zum Gerät</Button>} />
        </section>
      </div>
    );
  }

  return (
    <div className={s.telefon}>
      <section className={s.karte}>
        <Link href={`/g/${geraetId}`} className={s.zurueck}><Icons8Ikone name="chevron-left" groesse={16} /> {geraetName}</Link>
        <h1 className={s.geraetName} style={{ margin: 0 }}>Mangel melden</h1>
      </section>
      <section className={s.karte}>
        <Kicker className={s.karteTitel}>Was ist los?</Kicker>
        <Input.TextArea value={text} maxLength={NOTIZ_MAX} onChange={(e) => setText(e.target.value)} autoSize={{ minRows: 3 }} aria-label="Was ist los?" />
      </section>
      <section className={s.karte}>
        <Kicker className={s.karteTitel}>Foto</Kicker>
        <FotoWahl name="foto" datei={foto} setDatei={setFoto} />
      </section>
      <section className={s.karte}>
        <Kicker className={s.karteTitel}>Kann das Gerät noch raus?</Kicker>
        <div className={`${s.wahl} ${s.wahlSpalte}`} role="radiogroup" aria-label="Kann das Gerät noch raus?" aria-required="true">
          {([[true, "mangel", "Ja, einsatzbereit mit Mangel"], [false, "defekt", "Nein, nicht einsatzbereit"]] as const).map(([wert, farbe, text]) => (
            <label key={farbe}>
              <input type="radio" name="einsatzbereit" value={farbe} checked={bereit === wert} onChange={() => { setBereit(wert); setWahlFehlt(false); }} />
              {text}
            </label>
          ))}
        </div>
        {wahlFehlt && <div className={`${s.textRot} ${s.klein}`} style={{ marginTop: 8 }} role="alert" data-rolle="wahl-fehlt">Bitte wählen, ob das Gerät noch raus kann.</div>}
      </section>
      {mitName && (
        <section className={s.karte}>
          <Kicker className={s.karteTitel}>Dein Name</Kicker>
          <Input value={name} maxLength={NAME_MAX} autoComplete="name" onChange={(e) => setName(e.target.value)} aria-label="Dein Name" />
        </section>
      )}
      <div className={s.fuss}>
        <div className={s.entwurf}><EntwurfHinweis entwurf={entwurf} /></div>
        {fehler && <div className={`${s.neben} ${s.klein}`} style={{ marginBottom: 8 }} role="alert">{fehler}</div>}
        <Button type="primary" block disabled={!text.trim()} loading={laeuft} onClick={senden}>Mangel melden</Button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input, Result } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { randomId } from "@/core/zufallsId";
import { NAME_MAX, NOTIZ_MAX } from "../../_lib/eingabe";
import type { SendeAntwort } from "../../_lib/koerper";
import { Kicker } from "../teile";
import { FotoWahl, verkleinere } from "./foto";
import s from "../wartung.module.css";

/** `mitName`: ohne Anmeldung gemeldet — dann steht der Name, den man angibt, im Verlauf. */
export function MangelAmGeraet({ geraetId, geraetName, mitName = false }: { geraetId: string; geraetName: string; mitName?: boolean }) {
  const [sendung] = useState(randomId);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [bereit, setBereit] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fertig, setFertig] = useState(false);

  async function senden() {
    if (laeuft || !text.trim()) return;
    setFehler(null);
    setLaeuft(true);
    try {
      const daten = new FormData();
      daten.set("sendung", sendung);
      daten.set("text", text);
      daten.set("einsatzbereit", bereit ? "ja" : "nein");
      if (mitName) daten.set("name", name);
      if (foto) daten.set("foto", await verkleinere(foto), "foto.jpg");
      const r = await fetch(`/g/${geraetId}/mangel/senden`, { method: "POST", body: daten });
      const a = (await r.json().catch(() => null)) as SendeAntwort | null;
      if (a?.ok) setFertig(true);
      else setFehler(a && !a.ok ? a.fehler : "Die Meldung ging nicht durch. Bitte noch einmal senden.");
    } catch {
      setFehler("Keine Verbindung. Deine Angaben sind noch da, bitte gleich noch einmal senden.");
    } finally {
      setLaeuft(false);
    }
  }

  if (fertig) {
    return (
      <div className={s.telefon}>
        <section className={s.karte} role="status" data-rolle="mangel-fertig">
          <Result status="success" title="Mangel gemeldet" extra={<Button href={`/g/${geraetId}`}>Zurück zum Gerät</Button>} />
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
        <div className={`${s.wahl} ${s.wahlSpalte}`} role="radiogroup" aria-label="Kann das Gerät noch raus?">
          {([[true, "mangel", "Ja, einsatzbereit"], [false, "defekt", "Nein, nicht einsatzbereit"]] as const).map(([wert, farbe, text]) => (
            <label key={farbe}>
              <input type="radio" name="einsatzbereit" value={farbe} checked={bereit === wert} onChange={() => setBereit(wert)} />
              {text}
            </label>
          ))}
        </div>
      </section>
      {mitName && (
        <section className={s.karte}>
          <Kicker className={s.karteTitel}>Dein Name</Kicker>
          <Input value={name} maxLength={NAME_MAX} autoComplete="name" onChange={(e) => setName(e.target.value)} aria-label="Dein Name" />
        </section>
      )}
      <div className={s.fuss}>
        {fehler && <div className={`${s.neben} ${s.klein}`} style={{ marginBottom: 8 }} role="alert">{fehler}</div>}
        <Button type="primary" block disabled={!text.trim()} loading={laeuft} onClick={() => void senden()}>Mangel melden</Button>
      </div>
    </div>
  );
}

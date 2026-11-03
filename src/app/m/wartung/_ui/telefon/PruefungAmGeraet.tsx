"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input, InputNumber, Progress, Result } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { NOTIZ_MAX } from "../../_lib/eingabe";
import { ERGEBNIS_TEXT, type Zustand } from "../../_lib/fristen";
import type { SendeAntwort } from "../../_lib/koerper";
import type { CheckpunktDTO } from "../../_lib/typen";
import { Kicker } from "../teile";
import { FotoWahl, verkleinere } from "./foto";
import s from "../wartung.module.css";

type Antwort = { ok: boolean; text: string; foto: File | null };
const NETZ = "Keine Verbindung. Deine Angaben sind noch da, bitte gleich noch einmal senden.";

export function PruefungAmGeraet({
  geraetId, geraetName, titel, checkliste, stundenPflicht, stundenZuletzt,
}: {
  geraetId: string;
  geraetName: string;
  titel: string;
  checkliste: CheckpunktDTO[];
  stundenPflicht: boolean;
  stundenZuletzt: number | null;
}) {
  const [stunden, setStunden] = useState<number | null>(null);
  const [antworten, setAntworten] = useState<Record<string, Antwort>>({});
  const [ergebnis, setErgebnis] = useState<Zustand | null>(null);
  const [notiz, setNotiz] = useState("");
  const [offenerHinweis, setOffenerHinweis] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fertig, setFertig] = useState<{ ergebnis: Zustand; maengel: number } | null>(null);

  const erledigt = checkliste.filter((c) => antworten[c.id]).length;
  const maengel = checkliste.filter((c) => antworten[c.id] && !antworten[c.id].ok);
  const gewaehlt: Zustand = ergebnis === "ok" && maengel.length > 0 ? "mangel" : ergebnis ?? (maengel.length ? "mangel" : "ok");
  const stundenFehlt = stundenPflicht && stunden === null;
  const zuKlein = stunden !== null && stundenZuletzt !== null && stunden < stundenZuletzt;
  const ohneText = maengel.some((c) => !antworten[c.id].text.trim());
  const ohneBemerkung = maengel.length === 0 && gewaehlt !== "ok" && !notiz.trim();
  const bereit = erledigt === checkliste.length && !stundenFehlt && !zuKlein && !ohneText && !ohneBemerkung;
  const setze = (id: string, teil: Partial<Antwort>) =>
    setAntworten((a) => ({ ...a, [id]: { ...(a[id] ?? { ok: true, text: "", foto: null }), ...teil } }));

  async function senden() {
    if (laeuft || !bereit) return;
    setFehler(null);
    setLaeuft(true);
    try {
      const daten = new FormData();
      daten.set("daten", JSON.stringify({
        stunden, ergebnis: gewaehlt, notiz,
        antworten: checkliste.map((c) => ({ punktId: c.id, ok: antworten[c.id].ok, text: antworten[c.id].ok ? "" : antworten[c.id].text })),
      }));
      for (const c of maengel) {
        const f = antworten[c.id].foto;
        if (f) daten.set(`foto:${c.id}`, await verkleinere(f), "foto.jpg");
      }
      const r = await fetch(`/g/${geraetId}/pruefung/senden`, { method: "POST", body: daten });
      const a = (await r.json().catch(() => null)) as SendeAntwort | null;
      if (a?.ok) setFertig({ ergebnis: gewaehlt, maengel: a.maengel ?? 0 });
      else setFehler(a && !a.ok ? a.fehler : "Die Prüfung ging nicht durch. Bitte noch einmal senden.");
    } catch {
      setFehler(NETZ);
    } finally {
      setLaeuft(false);
    }
  }

  if (fertig) {
    return (
      <div className={s.telefon}>
        <section className={s.karte} role="status" data-rolle="pruefung-fertig">
          <Result
            status={fertig.ergebnis === "ok" ? "success" : "warning"}
            title="Prüfung gespeichert"
            subTitle={`${ERGEBNIS_TEXT[fertig.ergebnis]}.${fertig.maengel > 0 ? ` ${fertig.maengel} ${fertig.maengel === 1 ? "Mangel ist" : "Mängel sind"} gemeldet.` : ""}`}
            extra={<Button href={`/g/${geraetId}`}>Zurück zum Gerät</Button>}
          />
        </section>
      </div>
    );
  }

  return (
    <div className={s.telefon}>
      <section className={s.karte}>
        <Link href={`/g/${geraetId}`} className={s.zurueck}><Icons8Ikone name="chevron-left" groesse={16} /> {geraetName}</Link>
        <h1 className={s.geraetName} style={{ margin: "0 0 8px" }}>{titel}</h1>
        <Progress percent={Math.round((erledigt / Math.max(1, checkliste.length)) * 100)} format={() => `${erledigt} von ${checkliste.length}`} aria-label="Fortschritt" />
      </section>

      <section className={s.karte}>
        <Kicker className={s.karteTitel}>Betriebsstunden</Kicker>
        <InputNumber
          aria-label="Betriebsstunden am Zähler"
          value={stunden ?? undefined}
          onChange={(v) => setStunden(v ?? null)}
          min={0}
          precision={0}
          suffix="h"
          inputMode="numeric"
          style={{ width: "100%" }}
          status={zuKlein ? "warning" : undefined}
        />
        <div className={`${s.neben} ${s.klein}`} style={{ marginTop: 4 }} aria-live="polite">
          {zuKlein ? `Kleiner als der letzte Stand (${stundenZuletzt} h). Bitte noch einmal ablesen.` : stundenZuletzt !== null ? `Zuletzt ${stundenZuletzt} h` : null}
        </div>
      </section>

      {checkliste.map((c, i) => {
        const a = antworten[c.id];
        return (
          <section key={c.id} className={s.karte} data-rolle="pruefpunkt">
            <div className={s.quer} style={{ alignItems: "flex-start" }}>
              <strong><span className={s.ziffern}>{i + 1}.</span> {c.text}</strong>
              {c.hinweis && (
                <Button type="text" aria-expanded={offenerHinweis === c.id} onClick={() => setOffenerHinweis(offenerHinweis === c.id ? null : c.id)} icon={<Icons8Ikone name="help" groesse={20} />}>
                  So geht’s
                </Button>
              )}
            </div>
            {offenerHinweis === c.id && <p className={s.hinweis}>{c.hinweis}</p>}
            <div className={s.wahl} role="radiogroup" aria-label={c.text}>
              {(["ok", "mangel"] as const).map((wert) => (
                <label key={wert}>
                  <input
                    type="radio"
                    name={`pruef-${c.id}`}
                    value={wert}
                    checked={a ? (a.ok ? "ok" : "mangel") === wert : false}
                    onChange={() => setze(c.id, { ok: wert === "ok" })}
                  />
                  <Icons8Ikone name={wert === "ok" ? "checkmark" : "warning"} groesse={20} /> {wert === "ok" ? "In Ordnung" : "Mangel"}
                </label>
              ))}
            </div>
            {a && !a.ok && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <Input.TextArea
                  value={a.text}
                  maxLength={NOTIZ_MAX}
                  onChange={(e) => setze(c.id, { text: e.target.value })}
                  placeholder="Was ist los?"
                  autoSize={{ minRows: 2 }}
                  aria-label={`Mangel bei ${c.text}`}
                />
                <FotoWahl name={`foto-${c.id}`} datei={a.foto} setDatei={(f) => setze(c.id, { foto: f })} />
              </div>
            )}
          </section>
        );
      })}

      <section className={s.karte}>
        <Kicker className={s.karteTitel}>Ergebnis</Kicker>
        <div className={`${s.wahl} ${s.wahlSpalte}`} role="radiogroup" aria-label="Ergebnis">
          {(["ok", "mangel", "defekt"] as Zustand[]).map((z) => (
            <label key={z} aria-disabled={z === "ok" && maengel.length > 0}>
              <input
                type="radio"
                name="ergebnis"
                value={z}
                checked={gewaehlt === z}
                disabled={z === "ok" && maengel.length > 0}
                onChange={() => setErgebnis(z)}
              />
              {ERGEBNIS_TEXT[z]}
            </label>
          ))}
        </div>
        <Input.TextArea
          value={notiz}
          maxLength={NOTIZ_MAX}
          onChange={(e) => setNotiz(e.target.value)}
          placeholder="Bemerkung"
          autoSize={{ minRows: 2 }}
          style={{ marginTop: 12 }}
          aria-label="Bemerkung"
          status={ohneBemerkung ? "warning" : undefined}
        />
      </section>

      <div className={s.fuss}>
        {(fehler || !bereit) && (
          <div className={`${s.neben} ${s.klein}`} style={{ marginBottom: 8 }} aria-live="polite" role={fehler ? "alert" : undefined}>
            {fehler ?? [
              stundenFehlt ? "Betriebsstunden fehlen." : null,
              erledigt < checkliste.length ? `Noch ${checkliste.length - erledigt} ${checkliste.length - erledigt === 1 ? "Punkt" : "Punkte"} offen.` : null,
              ohneText ? "Bei jedem Mangel beschreiben, was los ist." : null,
              ohneBemerkung ? "Bitte in der Bemerkung beschreiben, was nicht stimmt." : null,
            ].filter(Boolean).join(" ")}
          </div>
        )}
        <Button type="primary" block disabled={!bereit} loading={laeuft} onClick={() => void senden()}>
          Prüfung abschließen
        </Button>
      </div>
    </div>
  );
}

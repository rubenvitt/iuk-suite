"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Input, InputNumber, Progress, Result } from "antd";
import { EntwurfHinweis } from "@/core/entwurf/EntwurfHinweis";
import { useEntwurf } from "@/core/entwurf/useEntwurf";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { NOTIZ_MAX } from "../../_lib/eingabe";
import { ERGEBNIS_TEXT, type Zustand } from "../../_lib/fristen";
import type { SendeAntwort } from "../../_lib/koerper";
import type { CheckpunktDTO } from "../../_lib/typen";
import { Kicker } from "../teile";
import { FotoWahl, verkleinere } from "./foto";
import { sendeAnRoute } from "./senden";
import s from "../wartung.module.css";

type Antwort = { ok: boolean; text: string; foto: File | null };
type Stand = { stunden: number | null; antworten: Record<string, { ok: boolean; text: string }>; ergebnis: Zustand | null; notiz: string };
type Daten = {
  stunden: number | null; ergebnis: Zustand; notiz: string;
  antworten: { punktId: string; ok: boolean; text: string; soll?: number; punkt?: string; hinweis?: string }[];
};

/**
 * Die Prüfung am Gerät mit der Checkliste der Art. Bei einer Materialkiste (`kiste`, IDA-335) sind die Punkte ihre
 * Inhaltsliste: je Position „Vollständig“ oder „Fehlt“, ohne Pflichttext, und ohne Betriebsstunden.
 */
export function PruefungAmGeraet({
  geraetId, geraetName, titel, checkliste, kiste = false, stundenPflicht, stundenZuletzt,
}: {
  geraetId: string;
  geraetName: string;
  titel: string;
  checkliste: CheckpunktDTO[];
  kiste?: boolean;
  stundenPflicht: boolean;
  stundenZuletzt: number | null;
}) {
  const [stunden, setStunden] = useState<number | null>(null);
  const [antworten, setAntworten] = useState<Record<string, Antwort>>({});
  const [ergebnis, setErgebnis] = useState<Zustand | null>(null);
  const [notiz, setNotiz] = useState("");
  const [offenerHinweis, setOffenerHinweis] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState<{ ergebnis: Zustand; maengel: number } | null>(null);
  const antwortenRef = useRef(antworten);
  useLayoutEffect(() => {
    antwortenRef.current = antworten;
  });

  /*
   * IDA-358 — DIE PRÜFUNG LIEGT AUF DEM TELEFON, BIS DER SERVER SIE BESTÄTIGT. Jede Antwort landet sofort im
   * Entwurf; scheitert das Absenden (Netz, Rollout), versucht `useEntwurf` es erneut, auch nach dem Neuladen.
   * Die Sendungs-ID ist `sendung` der Route — eine zweite Ankunft legt nichts doppelt an (`schonGesendet`).
   *
   * ⚠️ FOTOS LIEGEN NICHT IM ENTWURF (eine Datei passt nicht in `localStorage`). Ein Versuch auf derselben Seite
   * nimmt sie mit; nach dem Neuladen geht die Prüfung ohne die Fotos, die nicht mehr da sind.
   */
  const entwurf = useEntwurf<Stand, Daten, { ergebnis: Zustand; a: SendeAntwort }>({
    schluessel: `wartung:pruefung:${geraetId}`,
    stand: {
      stunden, ergebnis, notiz,
      antworten: Object.fromEntries(Object.entries(antworten).map(([k, a]) => [k, { ok: a.ok, text: a.text }])),
    },
    wiederherstellen: (w) => {
      setStunden(w.stunden);
      setErgebnis(w.ergebnis);
      setNotiz(w.notiz);
      setAntworten(Object.fromEntries(Object.entries(w.antworten).map(([k, a]) => [k, { ...a, foto: antwortenRef.current[k]?.foto ?? null }])));
    },
    senden: async (d, sendung) => {
      const daten = new FormData();
      daten.set("daten", JSON.stringify({ ...d, sendung }));
      for (const a of d.antworten) {
        const f = a.ok ? null : antwortenRef.current[a.punktId]?.foto;
        if (f) daten.set(`foto:${a.punktId}`, await verkleinere(f), "foto.jpg");
      }
      return { ergebnis: d.ergebnis, a: await sendeAnRoute(`/g/${geraetId}/pruefung/senden`, daten) };
    },
    antwort: ({ ergebnis: e, a }) => {
      if (!a.ok) {
        setFehler(a.fehler);
        return false;
      }
      setFertig({ ergebnis: e, maengel: a.maengel ?? 0 });
      return true;
    },
  });
  const laeuft = entwurf.zustand === "sendet";

  const erledigt = checkliste.filter((c) => antworten[c.id]).length;
  const maengel = checkliste.filter((c) => antworten[c.id] && !antworten[c.id].ok);
  const gewaehlt: Zustand = ergebnis === "ok" && maengel.length > 0 ? "mangel" : ergebnis ?? (maengel.length ? "mangel" : "ok");
  const stundenFehlt = !kiste && stundenPflicht && stunden === null;
  const zuKlein = stunden !== null && stundenZuletzt !== null && stunden < stundenZuletzt;
  const ohneText = !kiste && maengel.some((c) => !antworten[c.id].text.trim());
  const ohneBemerkung = maengel.length === 0 && gewaehlt !== "ok" && !notiz.trim();
  const bereit = erledigt === checkliste.length && !stundenFehlt && !zuKlein && !ohneText && !ohneBemerkung;
  const setze = (id: string, teil: Partial<Antwort>) =>
    setAntworten((a) => ({ ...a, [id]: { ...(a[id] ?? { ok: true, text: "", foto: null }), ...teil } }));

  function senden() {
    if (laeuft || !bereit) return;
    setFehler(null);
    entwurf.sende({
      stunden, ergebnis: gewaehlt, notiz,
      antworten: checkliste.map((c) => ({ punktId: c.id, ok: antworten[c.id].ok, text: antworten[c.id].ok ? "" : antworten[c.id].text, soll: c.soll, punkt: kiste ? c.text : undefined, hinweis: kiste ? c.hinweis : undefined })),
    });
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

  const wahlText = kiste ? { ok: "Vollständig", mangel: "Fehlt" } : { ok: "In Ordnung", mangel: "Mangel" };

  return (
    <div className={s.telefon}>
      <section className={s.karte}>
        <Link href={`/g/${geraetId}`} className={s.zurueck}><Icons8Ikone name="chevron-left" groesse={16} /> {geraetName}</Link>
        <h1 className={s.geraetName} style={{ margin: "0 0 8px" }}>{titel}</h1>
        <Progress percent={Math.round((erledigt / Math.max(1, checkliste.length)) * 100)} format={() => `${erledigt} von ${checkliste.length}`} aria-label="Fortschritt" />
      </section>

      {!kiste && <section className={s.karte}>
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
      </section>}

      {checkliste.map((c, i) => {
        const a = antworten[c.id];
        return (
          <section key={c.id} className={s.karte} data-rolle="pruefpunkt">
            <div className={s.quer} style={{ alignItems: "flex-start" }}>
              <strong>
                {c.soll !== undefined ? <span className={s.ziffern}>{c.soll} ×</span> : <span className={s.ziffern}>{i + 1}.</span>} {c.text}
              </strong>
              {c.hinweis && !kiste && (
                <Button type="text" aria-expanded={offenerHinweis === c.id} onClick={() => setOffenerHinweis(offenerHinweis === c.id ? null : c.id)} icon={<Icons8Ikone name="help" groesse={20} />}>
                  So geht’s
                </Button>
              )}
            </div>
            {kiste && c.hinweis && <p className={s.hinweis}>{c.hinweis}</p>}
            {!kiste && offenerHinweis === c.id && <p className={s.hinweis}>{c.hinweis}</p>}
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
                  <Icons8Ikone name={wert === "ok" ? "checkmark" : "warning"} groesse={20} /> {wahlText[wert]}
                </label>
              ))}
            </div>
            {a && !a.ok && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <Input.TextArea
                  value={a.text}
                  maxLength={NOTIZ_MAX}
                  onChange={(e) => setze(c.id, { text: e.target.value })}
                  placeholder={kiste ? "Wie viele fehlen?" : "Was ist los?"}
                  autoSize={{ minRows: kiste ? 1 : 2 }}
                  aria-label={kiste ? `Fehlt bei ${c.text}` : `Mangel bei ${c.text}`}
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
        <div className={s.entwurf}><EntwurfHinweis entwurf={entwurf} /></div>
        {(fehler || !bereit) && (
          <div className={`${s.neben} ${s.klein}`} style={{ marginBottom: 8 }} aria-live="polite" role={fehler ? "alert" : undefined}>
            {fehler ?? [
              stundenFehlt ? "Betriebsstunden fehlen." : null,
              erledigt < checkliste.length
                ? `Noch ${checkliste.length - erledigt} ${checkliste.length - erledigt === 1 ? (kiste ? "Position" : "Punkt") : (kiste ? "Positionen" : "Punkte")} offen.`
                : null,
              ohneText ? "Bei jedem Mangel beschreiben, was los ist." : null,
              ohneBemerkung ? "Bitte in der Bemerkung beschreiben, was nicht stimmt." : null,
            ].filter(Boolean).join(" ")}
          </div>
        )}
        <Button type="primary" block disabled={!bereit} loading={laeuft} onClick={senden}>
          {kiste ? "Durchzählen abschließen" : "Prüfung abschließen"}
        </Button>
      </div>
    </div>
  );
}

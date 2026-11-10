"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Input, Progress, Result } from "antd";
import { EntwurfHinweis } from "@/core/entwurf/EntwurfHinweis";
import { useEntwurf } from "@/core/entwurf/useEntwurf";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { NOTIZ_MAX } from "../../_lib/eingabe";
import { ERGEBNIS_TEXT, type Zustand } from "../../_lib/fristen";
import type { SendeAntwort } from "../../_lib/koerper";
import { KLEINER_TEXT, pruefeStundenEingabe, sprungFrage } from "../../_lib/stunden";
import type { CheckpunktDTO } from "../../_lib/typen";
import { Kicker } from "../teile";
import { FotoWahl, verkleinere } from "./foto";
import { sendeAnRoute } from "./senden";
import { StundenFeld } from "./StundenFeld";
import s from "../wartung.module.css";

type Antwort = { ok: boolean; text: string; foto: File | null };
/** `stundenText` seit IDA-381 (der getippte Text); ein älterer Entwurf trägt nur die Zahl in `stunden`. */
type Stand = { stunden?: number | null; stundenText?: string; antworten: Record<string, { ok: boolean; text: string }>; ergebnis: Zustand | null; notiz: string };
type Daten = {
  stunden: number | null; ergebnis: Zustand; notiz: string;
  antworten: { punktId: string; ok: boolean; text: string; soll?: number; punkt?: string; hinweis?: string; unterwegs?: number }[];
  rueckgabe?: string;
};

/**
 * Die Prüfung am Gerät mit den Punkten der Checkliste, die zu dieser Prüfart gehören (IDA-369). Bei einer
 * Materialkiste (`kiste`, IDA-335) sind die Punkte ihre Inhaltsliste: je Position „Vollständig“ oder „Fehlt“, ohne
 * Pflichttext, und ohne Betriebsstunden.
 */
export function PruefungAmGeraet({
  geraetId, geraetName, pruefartId, anlass = false, titel, checkliste, kiste = false, stundenPflicht, stundenZuletzt, unterwegs = {}, anleitung = "", rueckgabe,
}: {
  geraetId: string;
  geraetName: string;
  pruefartId: string;
  /** Eine Prüfung vor oder nach dem Einsatz: ihr Entwurf liegt getrennt von dem der Prüfung nach Frist. */
  anlass?: boolean;
  titel: string;
  checkliste: CheckpunktDTO[];
  kiste?: boolean;
  stundenPflicht: boolean;
  stundenZuletzt: number | null;
  /** Je Position, wie viele gerade unterwegs sind (IDA-372); bei `rueckgabe` leer. */
  unterwegs?: Record<string, number>;
  anleitung?: string;
  /** Entnahme-ID der ganzen Kiste, die dieses Durchzählen zurücklegt. */
  rueckgabe?: string;
}) {
  const [stundenText, setStundenText] = useState("");
  const [antworten, setAntworten] = useState<Record<string, Antwort>>({});
  const [ergebnis, setErgebnis] = useState<Zustand | null>(null);
  const [notiz, setNotiz] = useState("");
  const [aufgeklappt, setAufgeklappt] = useState<Record<string, boolean>>({});
  /** Der Stand, zu dem die Rückfrage vor einem großen Sprung gerade steht (IDA-381). */
  const [rueckfrage, setRueckfrage] = useState<number | null>(null);
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
   *
   * Der Schlüssel der Prüfung nach Frist ist der von vor IDA-369, damit ein Entwurf über den Rollout erhalten bleibt.
   */
  const entwurf = useEntwurf<Stand, Daten, { ergebnis: Zustand; a: SendeAntwort }>({
    schluessel: anlass ? `wartung:pruefung:${geraetId}:${pruefartId}` : `wartung:pruefung:${geraetId}`,
    stand: {
      stundenText, ergebnis, notiz,
      antworten: Object.fromEntries(Object.entries(antworten).map(([k, a]) => [k, { ok: a.ok, text: a.text }])),
    },
    wiederherstellen: (w) => {
      setStundenText(w.stundenText ?? (w.stunden == null ? "" : String(w.stunden)));
      setErgebnis(w.ergebnis);
      setNotiz(w.notiz);
      setAntworten(Object.fromEntries(Object.entries(w.antworten).map(([k, a]) => [k, { ...a, foto: antwortenRef.current[k]?.foto ?? null }])));
    },
    senden: async (d, sendung) => {
      const daten = new FormData();
      daten.set("daten", JSON.stringify({ ...d, sendung, pruefartId }));
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
  const befund = pruefeStundenEingabe(kiste ? "" : stundenText, stundenZuletzt);
  const stunden = "wert" in befund ? befund.wert : null;
  const stundenFehlt = !kiste && stundenPflicht && befund.art === "leer";
  const stundenUngueltig = befund.art === "ungueltig";
  const zuKlein = befund.art === "kleiner";
  const ohneText = !kiste && maengel.some((c) => !antworten[c.id].text.trim());
  const ohneBemerkung = maengel.length === 0 && gewaehlt !== "ok" && !notiz.trim();
  const bereit = erledigt === checkliste.length && !stundenFehlt && !stundenUngueltig && !zuKlein && !ohneText && !ohneBemerkung;
  const fragtGerade = befund.art === "sprung" && rueckfrage === befund.wert;
  const offenerPunkt = checkliste.find((c) => !antworten[c.id]);
  const ohneTextPunkt = kiste ? undefined : maengel.find((c) => !antworten[c.id].text.trim());
  // IDA-381: was den Knopf sperrt, steht beim Knopf — und führt per Tipp dorthin, oft weit oben auf der Seite.
  const gruende: { text: string; ziel: string }[] = [
    stundenFehlt ? { text: "Betriebsstunden fehlen.", ziel: STUNDEN_ID } : null,
    stundenUngueltig ? { text: "Betriebsstunden sind keine Zahl.", ziel: STUNDEN_ID } : null,
    befund.art === "kleiner" ? { text: `Betriebsstunden: ${KLEINER_TEXT(befund.zuletzt)}`, ziel: STUNDEN_ID } : null,
    offenerPunkt
      ? { text: `Noch ${checkliste.length - erledigt} ${checkliste.length - erledigt === 1 ? (kiste ? "Position" : "Punkt") : (kiste ? "Positionen" : "Punkte")} offen.`, ziel: punktId(offenerPunkt.id) }
      : null,
    ohneTextPunkt ? { text: "Bei jedem Mangel beschreiben, was los ist.", ziel: mangelId(ohneTextPunkt.id) } : null,
    ohneBemerkung ? { text: "Bitte in der Bemerkung beschreiben, was nicht stimmt.", ziel: BEMERKUNG_ID } : null,
  ].filter((g) => g !== null);
  const setze = (id: string, teil: Partial<Antwort>) =>
    setAntworten((a) => ({ ...a, [id]: { ...(a[id] ?? { ok: true, text: "", foto: null }), ...teil } }));

  function senden() {
    if (laeuft || !bereit) return;
    if (befund.art === "sprung" && !fragtGerade) {
      setRueckfrage(befund.wert);
      return;
    }
    setFehler(null);
    setRueckfrage(null);
    entwurf.sende({
      stunden, ergebnis: gewaehlt, notiz,
      rueckgabe,
      antworten: checkliste.map((c) => ({ punktId: c.id, ok: antworten[c.id].ok, text: antworten[c.id].ok ? "" : antworten[c.id].text, soll: c.soll, punkt: kiste ? c.text : undefined, hinweis: kiste ? c.hinweis : undefined, unterwegs: kiste ? unterwegs[c.id] ?? 0 : undefined })),
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

      {anleitung && <section className={s.karte}><p className={s.hinweis} style={{ margin: 0, whiteSpace: "pre-wrap" }}>{anleitung}</p></section>}

      {!kiste && <section className={s.karte}>
        <Kicker className={s.karteTitel}>Betriebsstunden</Kicker>
        <StundenFeld id={STUNDEN_ID} label="Betriebsstunden am Zähler" text={stundenText} setText={setStundenText} befund={befund} zuletzt={stundenZuletzt} />
      </section>}

      {checkliste.map((c, i) => {
        const a = antworten[c.id];
        return (
          <section key={c.id} id={punktId(c.id)} className={s.karte} data-rolle="pruefpunkt">
            <div className={s.quer} style={{ alignItems: "flex-start" }}>
              <strong>
                {c.soll !== undefined ? <span className={s.ziffern}>{c.soll} ×</span> : <span className={s.ziffern}>{i + 1}.</span>} {c.text}
                {kiste && unterwegs[c.id] > 0 && <span className={s.neben}> (davon {unterwegs[c.id]} unterwegs)</span>}
              </strong>
            </div>
            {kiste && c.hinweis && <p className={s.hinweis}>{c.hinweis}</p>}
            {!kiste && c.hinweis && (
              <PunktHinweis text={c.hinweis} offen={!!aufgeklappt[c.id]} umschalten={() => setAufgeklappt((a) => ({ ...a, [c.id]: !a[c.id] }))} />
            )}
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
                  id={mangelId(c.id)}
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
          id={BEMERKUNG_ID}
          aria-label="Bemerkung"
          status={ohneBemerkung ? "warning" : undefined}
        />
      </section>

      <div className={s.fuss}>
        <div className={s.entwurf}><EntwurfHinweis entwurf={entwurf} /></div>
        {fehler ? (
          <div className={`${s.neben} ${s.klein}`} style={{ marginBottom: 8 }} aria-live="polite" role="alert">{fehler}</div>
        ) : !bereit ? (
          <div className={`${s.neben} ${s.klein} ${s.fussGrund}`} aria-live="polite" data-rolle="pruefung-gruende">
            {gruende.map((g) => (
              <button key={g.text} type="button" className={s.fussSprung} onClick={() => springe(g.ziel)}>{g.text}</button>
            ))}
          </div>
        ) : fragtGerade && befund.art === "sprung" ? (
          <div className={s.rueckfrage} role="alert" data-rolle="stunden-rueckfrage">{sprungFrage(befund.plus)}</div>
        ) : null}
        <Button type="primary" block disabled={!bereit} loading={laeuft} onClick={senden}>
          {fragtGerade ? "Ja, abschließen" : kiste ? "Durchzählen abschließen" : "Prüfung abschließen"}
        </Button>
      </div>
    </div>
  );
}

const STUNDEN_ID = "pruef-stunden";
const BEMERKUNG_ID = "pruef-bemerkung";
const punktId = (id: string) => `pruef-punkt-${id}`;
const mangelId = (id: string) => `pruef-mangel-${id}`;

/** Zum Feld bzw. Prüfpunkt scrollen und ihn fokussieren (IDA-381). */
function springe(ziel: string) {
  const el = document.getElementById(ziel);
  if (!el) return;
  el.scrollIntoView?.({ behavior: "smooth", block: "center" });
  const feld = el.matches("input, textarea") ? el : el.querySelector<HTMLElement>("input, textarea");
  feld?.focus({ preventScroll: true });
}

/** Ab hier ist ein Hinweis eine Anleitung und wird erst auf Tipp ganz gezeigt; die kurzen stehen offen (IDA-381). */
const HINWEIS_KURZ = 160;

function PunktHinweis({ text, offen, umschalten }: { text: string; offen: boolean; umschalten: () => void }) {
  const lang = text.length > HINWEIS_KURZ || text.trim().includes("\n");
  return (
    <>
      <p className={`${s.punktHinweis} ${lang && !offen ? s.punktHinweisZu : ""}`} data-rolle="punkt-hinweis">{text}</p>
      {lang && (
        <Button type="link" style={{ paddingInline: 0 }} aria-expanded={offen} onClick={umschalten}>{offen ? "Weniger" : "Mehr"}</Button>
      )}
    </>
  );
}

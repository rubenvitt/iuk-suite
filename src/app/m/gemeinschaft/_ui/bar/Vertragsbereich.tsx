"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { vertragUnterschreibenAction } from "../../_actions/anfrage";
import { eingangText } from "../../_lib/vermietungText";
import type { VertragStatus } from "../../_lib/vermietungTypen";
import s from "./bar.module.css";

/**
 * Der Mietvertrag auf der Statusseite einer Zusage (IDA-343): ansehen, dann am Handy unterschreiben oder eine
 * unterschriebene PDF/ein Foto hochladen. Hat die Leitung das Zeichnen ausgeschaltet, nur der Upload. Nach dem
 * Unterschreiben nur noch der Download.
 */
export function Vertragsbereich({ code, person, v }: { code: string; person: string; v: VertragStatus }) {
  const pfad = `/status/${code}/vertrag`;
  if (v.datei) {
    return (
      <section className={s.karte} aria-labelledby="vertrag-titel" data-testid="vertrag-status">
        <h2 className={s.ueberschrift} id="vertrag-titel">Mietvertrag</h2>
        <span className={`${s.plakette} ${s.zugesagt}`}>Unterschrieben</span>
        <p className="go-meta" style={{ marginTop: 12 }}>{eingangText(v.datei.am)}</p>
        <div className="go-knopfzeile" style={{ marginTop: 12 }}>
          <a className="go-knopf go-knopf-leise" href={pfad} download>Vertrag herunterladen</a>
        </div>
      </section>
    );
  }
  if (v.stand === "unterschrieben") {
    return (
      <section className={s.karte} aria-labelledby="vertrag-titel" data-testid="vertrag-status">
        <h2 className={s.ueberschrift} id="vertrag-titel">Mietvertrag</h2>
        <span className={`${s.plakette} ${s.zugesagt}`}>Unterschrieben</span>
      </section>
    );
  }
  if (!v.vorlage) return null;
  return <Unterschreiben code={code} person={person} stand={v.vorlage} zeichnen={v.zeichnen} pfad={pfad} />;
}

function Unterschreiben({ code, person, stand, zeichnen, pfad }: { code: string; person: string; stand: string; zeichnen: boolean; pfad: string }) {
  const router = useRouter();
  const [name, setName] = useState(person);
  const [einverstanden, setEinverstanden] = useState(false);
  const [leer, setLeer] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const flaeche = useRef<Unterschriftflaeche>(null);
  const datei = useRef<HTMLInputElement>(null);

  async function unterschreiben() {
    setFehler(null);
    const bild = flaeche.current?.alsPng();
    if (!bild) { setFehler("Bitte unterschreib im Feld."); return; }
    setLaeuft(true);
    try {
      const r = await vertragUnterschreibenAction(code, { name, bild, stand });
      if (!r.ok) { setFehler(r.fehler); return; }
      router.refresh();
    } catch {
      setFehler("Das hat gerade nicht geklappt. Versuch es bitte noch einmal.");
    } finally {
      setLaeuft(false);
    }
  }

  async function hochladen(f: File) {
    setFehler(null);
    setLaeuft(true);
    try {
      const form = new FormData();
      form.append("datei", f);
      const antwort = await fetch(pfad, { method: "POST", body: form });
      const rumpf = (await antwort.json().catch(() => null)) as { ok: boolean; fehler?: string } | null;
      if (!antwort.ok || !rumpf?.ok) { setFehler(rumpf?.fehler ?? "Das Hochladen hat nicht geklappt. Bitte die Seite neu laden."); return; }
      router.refresh();
    } catch {
      setFehler("Das Hochladen hat nicht geklappt. Prüf bitte die Verbindung.");
    } finally {
      setLaeuft(false);
      if (datei.current) datei.current.value = "";
    }
  }

  return (
    <section className={s.karte} aria-labelledby="vertrag-titel" data-testid="vertrag-unterschreiben">
      <h2 className={s.ueberschrift} id="vertrag-titel">Mietvertrag</h2>
      <span className={`${s.plakette} ${s.angefragt}`}>Zum Unterschreiben</span>
      <div className="go-knopfzeile" style={{ marginTop: 16 }}>
        <a className={`go-knopf go-knopf-leise ${s.voll}`} href={pfad} target="_blank" rel="noopener">Vertrag ansehen (PDF)</a>
      </div>
      {zeichnen ? <>
      <label className={s.block} style={{ marginTop: 16 }}>
        <span className="go-label">Name</span>
        <input className="go-feld" autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className={s.block}>
        <div className={s.unterschriftKopf}>
          <span className="go-label" id="unterschrift-label">Unterschrift</span>
          <button type="button" className={s.linkKnopf} disabled={leer} onClick={() => flaeche.current?.leeren()}>Löschen</button>
        </div>
        <UnterschriftFlaeche ref={flaeche} beschriftetVon="unterschrift-label" onLeer={setLeer} />
      </div>
      <label className={s.haken}>
        <input type="checkbox" checked={einverstanden} onChange={(e) => setEinverstanden(e.target.checked)} />
        <span>Ich habe den Vertrag gelesen und bin einverstanden.</span>
      </label>
      <div className="go-knopfzeile" style={{ marginTop: 16 }}>
        <button type="button" className={`go-knopf ${s.voll}`} disabled={laeuft || leer || !einverstanden || name.trim().length < 2} onClick={unterschreiben}>
          Unterschreiben
        </button>
      </div>
      </> : null}
      <input ref={datei} type="file" accept="application/pdf,image/jpeg,image/png" hidden aria-hidden="true" data-testid="vertrag-hochladen"
        onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void hochladen(f); }} />
      <div className="go-knopfzeile" style={{ marginTop: zeichnen ? 12 : 16 }}>
        <button type="button" className={`go-knopf ${zeichnen ? "go-knopf-leise " : ""}${s.voll}`} disabled={laeuft} onClick={() => datei.current?.click()}>
          Unterschriebenen Vertrag hochladen
        </button>
      </div>
      <p className="go-meta" style={{ marginTop: 8 }}>PDF oder Foto, höchstens 10 MB</p>
      {fehler ? <p className="go-fehler" role="alert">{fehler}</p> : null}
    </section>
  );
}

type Unterschriftflaeche = { alsPng: () => string | null; leeren: () => void };

/** Zeichenfläche für Finger, Stift oder Maus; schwarze Tinte auf hellem Grund, auch im Dunkelmodus. */
function UnterschriftFlaeche({ ref, beschriftetVon, onLeer }: { ref: React.Ref<Unterschriftflaeche>; beschriftetVon: string; onLeer: (leer: boolean) => void }) {
  const leinwand = useRef<HTMLCanvasElement>(null);
  const letzter = useRef<{ x: number; y: number } | null>(null);
  const striche = useRef(0);

  useEffect(() => {
    const c = leinwand.current;
    if (!c) return;
    const groesse = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width === Math.round(r.width * dpr)) return;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      const ctx = c.getContext("2d");
      if (ctx) { ctx.scale(dpr, dpr); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 2.4; ctx.strokeStyle = "#111"; }
      striche.current = 0;
      onLeer(true);
    };
    groesse();
    const ro = new ResizeObserver(groesse);
    ro.observe(c);
    return () => ro.disconnect();
  }, [onLeer]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  useImperativeHandle(ref, () => ({
    alsPng: () => (striche.current > 0 && leinwand.current ? leinwand.current.toDataURL("image/png") : null),
    leeren: () => {
      const c = leinwand.current;
      const ctx = c?.getContext("2d");
      if (c && ctx) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore(); }
      striche.current = 0;
      onLeer(true);
    },
  }), [onLeer]);

  return (
    <canvas ref={leinwand} className={s.unterschrift} role="img" aria-labelledby={beschriftetVon} data-testid="unterschrift-flaeche"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); letzter.current = pos(e); }}
      onPointerMove={(e) => {
        const von = letzter.current;
        const ctx = leinwand.current?.getContext("2d");
        if (!von || !ctx) return;
        const nach = pos(e);
        ctx.beginPath(); ctx.moveTo(von.x, von.y); ctx.lineTo(nach.x, nach.y); ctx.stroke();
        letzter.current = nach;
        // Ausgeschrieben statt `striche.current++ === 0`: der React Compiler übersetzt das Postfix auf einer Ref als
        // Vergleich NACH dem Hochzählen (gemessen im gebauten Stand), und die Fläche bliebe „leer“.
        const vorher = striche.current;
        striche.current = vorher + 1;
        if (vorher === 0) onLeer(false);
      }}
      onPointerUp={() => { letzter.current = null; }}
      onPointerCancel={() => { letzter.current = null; }} />
  );
}

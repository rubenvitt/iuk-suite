"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Card, Popconfirm, Spin, Tag } from "antd";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { vorlageEntfernenAction, vorlageFeldAction } from "../../_actions/vermietung";
import { eingangText } from "../../_lib/vermietungText";
import { feldAusPixeln, feldInPixeln, FELD_MIN, type Feld, type Seitenmass } from "../../_lib/vertragFeld";
import type { VorlageDTO } from "../../_lib/vermietungTypen";
import { oeffnePdf, rendereSeite } from "./pdfSeiten";
import s from "./vermietung.module.css";

const PFAD = "/vermietung/vorlage/datei";
const groesse = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

type Zug = { x1: number; y1: number; x2: number; y2: number };

/**
 * Die Vertragsvorlage der Bar (IDA-343): hochladen, ersetzen, entfernen und das Unterschriftenfeld auf einer Seite
 * aufziehen. Die Seite rendert pdf.js; ein Zug mit Maus, Stift oder Finger ergibt das Rechteck, umgerechnet in
 * PDF-Punkte (`_lib/vertragFeld.ts`). Der Server prüft das Feld noch einmal gegen die echten Seitenmaße.
 */
export function Vorlagenverwaltung({ vorlage }: { vorlage: VorlageDTO | null }) {
  const { message } = App.useApp();
  const router = useRouter();
  const datei = useRef<HTMLInputElement>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function hochladen(f: File) {
    setLaeuft(true);
    try {
      const form = new FormData();
      form.append("datei", f);
      const antwort = await fetch(PFAD, { method: "POST", body: form });
      const rumpf = (await antwort.json().catch(() => null)) as { ok: boolean; fehler?: string } | null;
      if (!antwort.ok || !rumpf?.ok) { message.warning(rumpf?.fehler ?? "Das Hochladen hat nicht geklappt. Bitte die Seite neu laden."); return; }
      message.success("Vorlage gespeichert.");
      router.refresh();
    } catch {
      message.warning("Das Hochladen hat nicht geklappt. Prüf bitte die Verbindung.");
    } finally {
      setLaeuft(false);
      if (datei.current) datei.current.value = "";
    }
  }

  async function entfernen() {
    const r = await vorlageEntfernenAction();
    if (!r.ok) { message.warning(r.fehler); return; }
    message.success("Vorlage entfernt.");
    router.refresh();
  }

  return (
    <div className={s.modul}>
      <Seitenkopf titel="Mietvertrag" />
      <input ref={datei} type="file" accept="application/pdf" hidden aria-hidden="true" data-testid="vorlage-datei"
        onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void hochladen(f); }} />
      <Card title="Vorlage">
        {vorlage ? (
          <div className={s.zeile} data-testid="vorlage">
            <Button href={PFAD} target="_blank" icon={<Icons8Ikone name="document" groesse={18} />}>{vorlage.name}</Button>
            <span className={s.neben}>{groesse(vorlage.groesse)} · {eingangText(vorlage.abgelegtAm)}</span>
            <Button onClick={() => datei.current?.click()} loading={laeuft}>Ersetzen</Button>
            <Popconfirm title="Vorlage entfernen?" description="Neue Zusagen bekommen dann keinen Vertrag auf die Statusseite." okText="Entfernen" cancelText="Abbrechen" onConfirm={entfernen}>
              <Button type="text" icon={<Icons8Ikone name="trash" groesse={18} />}>Entfernen</Button>
            </Popconfirm>
          </div>
        ) : (
          <Button type="primary" icon={<Icons8Ikone name="upload" groesse={18} />} loading={laeuft} onClick={() => datei.current?.click()}>Vorlage hochladen (PDF)</Button>
        )}
      </Card>
      {vorlage ? <Feldwahl key={vorlage.sha256} feld={vorlage.feld} /> : null}
    </div>
  );
}

/** Seite blättern, Rechteck aufziehen, speichern. */
function Feldwahl({ feld }: { feld: Feld | null }) {
  const { message } = App.useApp();
  const router = useRouter();
  const rahmen = useRef<HTMLDivElement>(null);
  const leinwand = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [seite, setSeite] = useState(feld?.seite ?? 0);
  const [anzeige, setAnzeige] = useState<{ massstab: number; mass: Seitenmass } | null>(null);
  const [zug, setZug] = useState<Zug | null>(null);
  const [entwurf, setEntwurf] = useState<Feld | null>(null);
  const [speichert, setSpeichert] = useState(false);
  // Der Zug steht zusätzlich in einer Ref: `pointermove` wird gebündelt gerendert, `pointerup` sähe sonst einen alten Stand.
  const zugRef = useRef<Zug | null>(null);

  useEffect(() => {
    let weg = false;
    let geladen: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const antwort = await fetch(PFAD, { cache: "no-store" });
        if (!antwort.ok) throw new Error(String(antwort.status));
        geladen = await oeffnePdf(await antwort.arrayBuffer());
        if (weg) { void geladen.loadingTask.destroy(); return; }
        setDoc(geladen);
      } catch {
        if (!weg) setFehler("Die Vorlage lässt sich hier nicht anzeigen.");
      }
    })();
    return () => { weg = true; void geladen?.loadingTask.destroy(); };
  }, []);

  const zeichne = useCallback(async () => {
    if (!doc || !leinwand.current || !rahmen.current) return;
    const breite = Math.min(720, rahmen.current.clientWidth);
    try {
      setAnzeige(await rendereSeite(doc, seite, leinwand.current, breite));
    } catch {
      setFehler("Die Seite lässt sich nicht anzeigen.");
    }
  }, [doc, seite]);

  useEffect(() => { void zeichne(); }, [zeichne]);
  useEffect(() => {
    const el = rahmen.current;
    if (!el) return;
    let breite = el.clientWidth;
    const ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - breite) > 8) { breite = el.clientWidth; void zeichne(); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, [zeichne]);

  const punkt = (ev: React.PointerEvent) => {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: Math.max(0, Math.min(r.width, ev.clientX - r.left)), y: Math.max(0, Math.min(r.height, ev.clientY - r.top)) };
  };

  function runter(ev: React.PointerEvent) {
    if (!anzeige) return;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    const p = punkt(ev);
    zugRef.current = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    setZug(zugRef.current);
  }
  function bewege(ev: React.PointerEvent) {
    if (!zugRef.current) return;
    const p = punkt(ev);
    zugRef.current = { ...zugRef.current, x2: p.x, y2: p.y };
    setZug(zugRef.current);
  }
  function hoch() {
    const z = zugRef.current;
    zugRef.current = null;
    setZug(null);
    if (!z || !anzeige) return;
    const f = feldAusPixeln(seite, z, anzeige.massstab, anzeige.mass);
    if (f.b < FELD_MIN.b || f.h < FELD_MIN.h) { message.warning("Das Feld ist zu klein."); return; }
    setEntwurf(f);
  }

  async function speichern(neu: Feld | null) {
    setSpeichert(true);
    try {
      const r = await vorlageFeldAction(neu);
      if (!r.ok) { message.warning(r.fehler); return; }
      message.success(neu ? "Unterschriftenfeld gespeichert." : "Unterschriftenfeld entfernt.");
      setEntwurf(null);
      router.refresh();
    } finally {
      setSpeichert(false);
    }
  }

  const gezeigt = entwurf ?? feld;
  const kasten = gezeigt && anzeige && gezeigt.seite === seite ? feldInPixeln(gezeigt, anzeige.massstab, anzeige.mass) : null;
  const zugKasten = zug ? { links: Math.min(zug.x1, zug.x2), oben: Math.min(zug.y1, zug.y2), breite: Math.abs(zug.x2 - zug.x1), hoehe: Math.abs(zug.y2 - zug.y1) } : null;
  const seiten = doc?.numPages ?? 0;

  return (
    <Card title="Unterschriftenfeld" extra={feld ? <Tag color="success">Seite {feld.seite + 1}</Tag> : <Tag>Eigene Seite am Ende</Tag>}>
      {fehler ? <p className={s.neben} role="alert">{fehler}</p> : null}
      <div className={s.zeile} style={{ marginBottom: 12 }}>
        <Button aria-label="Vorige Seite" disabled={seite <= 0} onClick={() => setSeite((x) => x - 1)} icon={<Icons8Ikone name="chevron-left" groesse={16} />} />
        <span className={s.neben} data-testid="vorlage-seite">{seiten ? `Seite ${seite + 1} von ${seiten}` : "…"}</span>
        <Button aria-label="Nächste Seite" disabled={seite >= seiten - 1} onClick={() => setSeite((x) => x + 1)} icon={<Icons8Ikone name="chevron-right" groesse={16} />} />
        <span style={{ flex: 1 }} />
        {entwurf ? (
          <>
            <Button type="primary" loading={speichert} onClick={() => speichern(entwurf)}>Feld speichern</Button>
            <Button onClick={() => setEntwurf(null)}>Verwerfen</Button>
          </>
        ) : feld ? (
          <Button type="text" loading={speichert} onClick={() => speichern(null)}>Feld entfernen</Button>
        ) : null}
      </div>
      <div ref={rahmen} className={s.vorlageRahmen}>
        {!doc && !fehler ? <Spin /> : null}
        <div className={s.vorlageSeite} data-testid="vorlage-flaeche"
          onPointerDown={runter} onPointerMove={bewege} onPointerUp={hoch} onPointerCancel={() => { zugRef.current = null; setZug(null); }}>
          <canvas ref={leinwand} aria-label={`Seite ${seite + 1} der Vorlage`} />
          {kasten ? <div className={`${s.feldKasten} ${entwurf ? s.feldEntwurf : ""}`} style={{ left: kasten.links, top: kasten.oben, width: kasten.breite, height: kasten.hoehe }} /> : null}
          {zugKasten ? <div className={`${s.feldKasten} ${s.feldEntwurf}`} style={{ left: zugKasten.links, top: zugKasten.oben, width: zugKasten.breite, height: zugKasten.hoehe }} /> : null}
        </div>
      </div>
    </Card>
  );
}

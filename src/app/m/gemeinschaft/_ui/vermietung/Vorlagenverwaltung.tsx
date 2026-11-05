"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Card, Input, Popconfirm, Segmented, Spin, Switch } from "antd";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Statuschip } from "@/core/status/Statuschip";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { vorlageEntfernenAction, vorlageFelderAction, vorlageZeichnenAction } from "../../_actions/vermietung";
import { eingangText } from "../../_lib/vermietungText";
import { DOKUMENTARTEN, type Dokumentart, type VorlageDTO } from "../../_lib/vermietungTypen";
import {
  FELD_MIN, FELDARTEN, feldAusPixeln, feldInPixeln, neueFeldId, ROLLEN, type FeldArt, type Rolle, type Seitenmass, type Vertragsfeld,
} from "../../_lib/vertragFeld";
import { oeffnePdf, rendereSeite } from "./pdfSeiten";
import { groesse } from "./Vertragskasten";
import s from "./vermietung.module.css";

const PFAD = "/vermietung/vorlage/datei";
const ART_TEXT: Record<FeldArt, string> = { text: "Text", ankreuz: "Ankreuzen", unterschrift: "Unterschrift" };
const KURZ: Record<Dokumentart, string> = { mietvertrag: "Mietvertrag", uebergabe: "Übergabe", rueckgabe: "Rückgabe" };
const ROLLE_TEXT: Record<Rolle, string> = { leitung: "Leitung", mieter: "Mietende Person" };

type Zug = { x1: number; y1: number; x2: number; y2: number };

/**
 * Die Vorlagen der Vermietung (IDA-343, IDA-354): je Dokument (Mietvertrag, Übergabe, Rückgabe) hochladen, ersetzen,
 * entfernen, Zeichnen an/aus und die Felder. Formularfelder der PDF kommen beim Hochladen mit; weitere Felder zieht
 * die Leitung auf der gerenderten Seite auf. Der Server prüft die Liste noch einmal gegen die echte PDF.
 */
export function Vorlagenverwaltung({ vorlagen }: { vorlagen: VorlageDTO[] }) {
  const [art, setArt] = useState<Dokumentart>("mietvertrag");
  const vorlage = vorlagen.find((v) => v.art === art) ?? null;
  return (
    <div className={s.modul}>
      <Seitenkopf titel="Verträge" />
      <div className={s.wahl}>
        <Segmented<Dokumentart> value={art} onChange={setArt} aria-label="Dokument"
          options={DOKUMENTARTEN.map((a) => ({ value: a, label: KURZ[a] }))} data-testid="vorlage-art" />
      </div>
      <Vorlagenkarte key={art} art={art} vorlage={vorlage} />
      {vorlage ? <Feldeditor key={`${art}:${vorlage.sha256}:${JSON.stringify(vorlage.felder)}`} art={art} felder={vorlage.felder} /> : null}
    </div>
  );
}

function Vorlagenkarte({ art, vorlage }: { art: Dokumentart; vorlage: VorlageDTO | null }) {
  const { message } = App.useApp();
  const router = useRouter();
  const datei = useRef<HTMLInputElement>(null);
  const [laeuft, setLaeuft] = useState(false);
  const pfad = `${PFAD}?art=${art}`;

  async function hochladen(f: File) {
    setLaeuft(true);
    try {
      const form = new FormData();
      form.append("datei", f);
      const antwort = await fetch(pfad, { method: "POST", body: form });
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

  async function zeichnen(an: boolean) {
    setLaeuft(true);
    try {
      const r = await vorlageZeichnenAction(art, an);
      if (!r.ok) { message.warning(r.fehler); return; }
      router.refresh();
    } finally {
      setLaeuft(false);
    }
  }

  async function entfernen() {
    const r = await vorlageEntfernenAction(art);
    if (!r.ok) { message.warning(r.fehler); return; }
    message.success("Vorlage entfernt.");
    router.refresh();
  }

  return (
    <Card title="Vorlage">
      <input ref={datei} type="file" accept="application/pdf" hidden aria-hidden="true" data-testid="vorlage-datei"
        onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void hochladen(f); }} />
      {vorlage ? (
        <div className={s.zeile} data-testid="vorlage">
          <Button href={pfad} target="_blank" icon={<Icons8Ikone name="document" groesse={18} />}>{vorlage.name}</Button>
          <span className={s.neben}>{groesse(vorlage.groesse)} · {eingangText(vorlage.abgelegtAm)}</span>
          <Button onClick={() => datei.current?.click()} loading={laeuft}>Ersetzen</Button>
          <Popconfirm title="Vorlage entfernen?" description="Schon erstellte Dokumente bleiben, neue lassen sich nicht mehr erstellen." okText="Entfernen" cancelText="Abbrechen" onConfirm={entfernen}>
            <Button type="text" icon={<Icons8Ikone name="trash" groesse={18} />}>Entfernen</Button>
          </Popconfirm>
          <label className={s.zeile}>
            <Switch checked={vorlage.zeichnen} loading={laeuft} onChange={(an) => void zeichnen(an)} data-testid="vorlage-zeichnen" />
            <span>Digital unterschreiben</span>
          </label>
        </div>
      ) : (
        <Button type="primary" icon={<Icons8Ikone name="upload" groesse={18} />} loading={laeuft} onClick={() => datei.current?.click()}>Vorlage hochladen (PDF)</Button>
      )}
    </Card>
  );
}

/** Die Seiten der Vorlage, darüber die Felder: aufziehen, wählen, benennen, löschen, speichern. */
function Feldeditor({ art, felder: gespeichert }: { art: Dokumentart; felder: Vertragsfeld[] }) {
  const { message } = App.useApp();
  const router = useRouter();
  const rahmen = useRef<HTMLDivElement>(null);
  const leinwand = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [seite, setSeite] = useState(0);
  const [anzeige, setAnzeige] = useState<{ massstab: number; mass: Seitenmass } | null>(null);
  const [zug, setZug] = useState<Zug | null>(null);
  const [felder, setFelder] = useState<Vertragsfeld[]>(gespeichert);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [neuArt, setNeuArt] = useState<FeldArt>("text");
  const [speichert, setSpeichert] = useState(false);
  // Der Zug steht zusätzlich in einer Ref: `pointermove` wird gebündelt gerendert, `pointerup` sähe sonst einen alten Stand.
  const zugRef = useRef<Zug | null>(null);
  const geaendert = JSON.stringify(felder) !== JSON.stringify(gespeichert);

  useEffect(() => {
    let weg = false;
    let geladen: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const antwort = await fetch(`${PFAD}?art=${art}`, { cache: "no-store" });
        if (!antwort.ok) throw new Error(String(antwort.status));
        geladen = await oeffnePdf(await antwort.arrayBuffer());
        if (weg) { void geladen.loadingTask.destroy(); return; }
        setDoc(geladen);
      } catch {
        if (!weg) setFehler("Die Vorlage lässt sich hier nicht anzeigen.");
      }
    })();
    return () => { weg = true; void geladen?.loadingTask.destroy(); };
  }, [art]);

  const zeichne = useCallback(async () => {
    if (!doc || !leinwand.current || !rahmen.current) return;
    const breite = Math.min(720, rahmen.current.clientWidth);
    try {
      const r = await rendereSeite(doc, seite, leinwand.current, breite);
      if (r) { setAnzeige(r); setFehler(null); }
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
    // Ein Tippen ohne Zug wählt ab, statt zu warnen.
    if (Math.abs(z.x2 - z.x1) < 4 && Math.abs(z.y2 - z.y1) < 4) { setGewaehlt(null); return; }
    const r = feldAusPixeln(seite, z, anzeige.massstab, anzeige.mass);
    const min = FELD_MIN[neuArt];
    if (r.b < min.b || r.h < min.h) { message.warning("Das Feld ist zu klein."); return; }
    const nr = felder.filter((f) => f.art === neuArt).length + 1;
    const neu: Vertragsfeld = { id: neueFeldId(), art: neuArt, name: `${ART_TEXT[neuArt]} ${nr}`, quelle: "gezogen", ...r, ...(neuArt === "unterschrift" ? { rolle: "mieter" as const } : {}) };
    setFelder((alt) => [...alt, neu]);
    setGewaehlt(neu.id);
  }

  const aendere = (id: string, mehr: Partial<Vertragsfeld>) => setFelder((alt) => alt.map((f) => {
    if (f.id !== id) return f;
    const neu = { ...f, ...mehr };
    if (neu.art === "unterschrift") return { ...neu, rolle: neu.rolle ?? "mieter" };
    const { rolle: _, ...ohne } = neu;
    return ohne;
  }));

  function waehle(f: Vertragsfeld) {
    setGewaehlt(f.id);
    setSeite(f.seite);
  }

  async function speichern() {
    if (felder.some((f) => !f.name.trim())) { message.warning("Jedes Feld braucht einen Namen."); return; }
    setSpeichert(true);
    try {
      const r = await vorlageFelderAction(art, felder.map((f) => ({ ...f, name: f.name.trim() })));
      if (!r.ok) { message.warning(r.fehler); return; }
      message.success("Felder gespeichert.");
      router.refresh();
    } finally {
      setSpeichert(false);
    }
  }

  const auswahl = felder.find((f) => f.id === gewaehlt) ?? null;
  const zugKasten = zug ? { links: Math.min(zug.x1, zug.x2), oben: Math.min(zug.y1, zug.y2), breite: Math.abs(zug.x2 - zug.x1), hoehe: Math.abs(zug.y2 - zug.y1) } : null;
  const seiten = doc?.numPages ?? 0;

  return (
    <Card title="Felder" extra={geaendert ? (
      <div className={s.zeile}>
        <Button onClick={() => { setFelder(gespeichert); setGewaehlt(null); }}>Verwerfen</Button>
        <Button type="primary" loading={speichert} onClick={() => void speichern()} data-testid="felder-speichern">Speichern</Button>
      </div>
    ) : null}>
      {fehler ? <p className={s.neben} role="alert">{fehler}</p> : null}
      <div className={s.editor}>
        <div>
          <div className={s.zeile} style={{ marginBottom: 12 }}>
            <Button aria-label="Vorige Seite" disabled={seite <= 0} onClick={() => setSeite((x) => x - 1)} icon={<Icons8Ikone name="chevron-left" groesse={16} />} />
            <span className={s.neben} data-testid="vorlage-seite">{seiten ? `Seite ${seite + 1} von ${seiten}` : "…"}</span>
            <Button aria-label="Nächste Seite" disabled={seite >= seiten - 1} onClick={() => setSeite((x) => x + 1)} icon={<Icons8Ikone name="chevron-right" groesse={16} />} />
            <span style={{ flex: 1 }} />
            <div className={s.wahl}><Segmented<FeldArt> value={neuArt} onChange={setNeuArt} options={FELDARTEN} aria-label="Neues Feld" data-testid="feld-neu-art" /></div>
          </div>
          <div ref={rahmen} className={s.vorlageRahmen}>
            {!doc && !fehler ? <Spin /> : null}
            <div className={s.vorlageSeite} data-testid="vorlage-flaeche"
              onPointerDown={runter} onPointerMove={bewege} onPointerUp={hoch} onPointerCancel={() => { zugRef.current = null; setZug(null); }}>
              <canvas ref={leinwand} aria-label={`Seite ${seite + 1} der Vorlage`} />
              {anzeige ? felder.filter((f) => f.seite === seite).map((f) => {
                const k = feldInPixeln(f, anzeige.massstab, anzeige.mass);
                return (
                  <button key={f.id} type="button" aria-label={f.name} aria-pressed={f.id === gewaehlt} data-testid="feld-kasten"
                    className={`${s.feldKasten} ${s.feldWahl} ${s[`feld_${f.art}`] ?? ""} ${f.id === gewaehlt ? s.feldEntwurf : ""}`}
                    style={{ left: k.links, top: k.oben, width: k.breite, height: k.hoehe }}
                    onPointerDown={(e) => e.stopPropagation()} onClick={() => setGewaehlt(f.id)} />
                );
              }) : null}
              {zugKasten ? <div className={`${s.feldKasten} ${s.feldEntwurf}`} style={{ left: zugKasten.links, top: zugKasten.oben, width: zugKasten.breite, height: zugKasten.hoehe }} /> : null}
            </div>
          </div>
        </div>
        <div className={s.feldSpalte}>
          {auswahl ? (
            <div className={s.vertrag} data-testid="feld-auswahl">
              <div className={s.zeile}>
                <strong style={{ flex: 1 }}>{auswahl.quelle === "formular" ? "Formularfeld" : "Aufgezogenes Feld"}</strong>
                <Popconfirm title="Feld löschen?" okText="Löschen" cancelText="Abbrechen" onConfirm={() => { setFelder((alt) => alt.filter((f) => f.id !== auswahl.id)); setGewaehlt(null); }}>
                  <Button type="text" icon={<Icons8Ikone name="trash" groesse={18} />} aria-label="Feld löschen" />
                </Popconfirm>
              </div>
              <label>
                <div className={s.feldname}>Name</div>
                <Input value={auswahl.name} maxLength={80} onChange={(e) => aendere(auswahl.id, { name: e.target.value })} data-testid="feld-name" />
              </label>
              <div>
                <div className={s.feldname}>Art</div>
                {auswahl.quelle === "gezogen" ? (
                  <Segmented<FeldArt> block value={auswahl.art} options={FELDARTEN} aria-label="Art des Felds"
                    onChange={(a) => { const min = FELD_MIN[a]; if (auswahl.b < min.b || auswahl.h < min.h) { message.warning("Für diese Art ist das Feld zu klein."); return; } aendere(auswahl.id, { art: a }); }} />
                ) : <div>{ART_TEXT[auswahl.art]}</div>}
              </div>
              {auswahl.art === "unterschrift" ? (
                <div>
                  <div className={s.feldname}>Wer unterschreibt</div>
                  <Segmented<Rolle> block value={auswahl.rolle ?? "mieter"} options={ROLLEN} aria-label="Wer unterschreibt" data-testid="feld-rolle"
                    onChange={(r) => aendere(auswahl.id, { rolle: r })} />
                </div>
              ) : null}
            </div>
          ) : null}
          <ul className={s.feldliste} aria-label="Felder der Vorlage">
            {felder.map((f) => (
              <li key={f.id}>
                <button type="button" className={`${s.feldzeile} ${f.id === gewaehlt ? s.feldzeileAn : ""}`} onClick={() => waehle(f)} aria-pressed={f.id === gewaehlt}>
                  <span className={s.feldzeileName}>{f.name}</span>
                  <span className={s.neben}>S. {f.seite + 1}</span>
                  <Statuschip>{f.art === "unterschrift" ? ROLLE_TEXT[f.rolle ?? "mieter"] : ART_TEXT[f.art]}</Statuschip>
                </button>
              </li>
            ))}
          </ul>
          {!felder.some((f) => f.art === "unterschrift" && f.rolle === "mieter") ? <Statuschip ton="info">Mietende Person: eigene Seite am Ende</Statuschip> : null}
        </div>
      </div>
    </Card>
  );
}

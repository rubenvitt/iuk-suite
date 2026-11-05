"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { vertragUnterschreibenAction } from "../../_actions/anfrage";
import { eingangText } from "../../_lib/vermietungText";
import { DOKUMENT_TITEL, type Dokumentart, type StatusDokument, type VertragStatus } from "../../_lib/vermietungTypen";
import { UnterschriftFlaeche, type Unterschriftflaeche } from "../unterschrift/UnterschriftFlaeche";
import s from "./bar.module.css";

/**
 * Die Dokumente auf der Statusseite einer Zusage (IDA-343, IDA-354): je freigegebenem Dokument eine Karte zum Ansehen,
 * dann am Handy unterschreiben oder eine unterschriebene PDF/ein Foto hochladen. Hat die Leitung das Zeichnen für
 * diese Vorlage ausgeschaltet, nur der Upload. Nach dem Unterschreiben nur noch der Download.
 */
export function Vertragsbereich({ code, person, v }: { code: string; person: string; v: VertragStatus }) {
  return <>{v.dokumente.map((d) => <Dokumentkarte key={d.art} code={code} person={person} d={d} />)}</>;
}

function Dokumentkarte({ code, person, d }: { code: string; person: string; d: StatusDokument }) {
  const pfad = `/status/${code}/vertrag?art=${d.art}`;
  const titel = DOKUMENT_TITEL[d.art];
  const tid = `dokument-${d.art}-titel`;
  if (d.stand === "unterschrieben") {
    return (
      <section className={s.karte} aria-labelledby={tid} data-testid={`dokument-${d.art}`} data-stand="unterschrieben">
        <h2 className={s.ueberschrift} id={tid}>{titel}</h2>
        <span className={`${s.plakette} ${s.zugesagt}`}>Unterschrieben</span>
        {d.datei ? (
          <>
            <p className="go-meta" style={{ marginTop: 12 }}>{eingangText(d.datei.am)}</p>
            <div className="go-knopfzeile" style={{ marginTop: 12 }}>
              <a className="go-knopf go-knopf-leise" href={pfad} download>{titel} herunterladen</a>
            </div>
          </>
        ) : null}
      </section>
    );
  }
  return <Unterschreiben code={code} person={person} art={d.art} version={d.version} zeichnen={d.zeichnen} pfad={pfad} titel={titel} tid={tid} />;
}

function Unterschreiben({ code, person, art, version, zeichnen, pfad, titel, tid }: {
  code: string; person: string; art: Dokumentart; version: number; zeichnen: boolean; pfad: string; titel: string; tid: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(person);
  const [einverstanden, setEinverstanden] = useState(false);
  const [leer, setLeer] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const flaeche = useRef<Unterschriftflaeche>(null);
  const datei = useRef<HTMLInputElement>(null);
  const lid = `unterschrift-${art}-label`;

  async function unterschreiben() {
    setFehler(null);
    const bild = flaeche.current?.alsPng();
    if (!bild) { setFehler("Bitte unterschreib im Feld."); return; }
    setLaeuft(true);
    try {
      const r = await vertragUnterschreibenAction(code, art, { name, bild, version });
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
    <section className={s.karte} aria-labelledby={tid} data-testid={`dokument-${art}`} data-stand="offen">
      <h2 className={s.ueberschrift} id={tid}>{titel}</h2>
      <span className={`${s.plakette} ${s.angefragt}`}>Zum Unterschreiben</span>
      <div className="go-knopfzeile" style={{ marginTop: 16 }}>
        <a className={`go-knopf go-knopf-leise ${s.voll}`} href={pfad} target="_blank" rel="noopener">{titel} ansehen (PDF)</a>
      </div>
      {zeichnen ? <>
      <label className={s.block} style={{ marginTop: 16 }}>
        <span className="go-label">Name</span>
        <input className="go-feld" autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className={s.block}>
        <div className={s.unterschriftKopf}>
          <span className="go-label" id={lid}>Unterschrift</span>
          <button type="button" className={s.linkKnopf} disabled={leer} onClick={() => flaeche.current?.leeren()}>Löschen</button>
        </div>
        <UnterschriftFlaeche ref={flaeche} beschriftetVon={lid} onLeer={setLeer} />
      </div>
      <label className={s.haken}>
        <input type="checkbox" checked={einverstanden} onChange={(e) => setEinverstanden(e.target.checked)} />
        <span>Ich habe das Dokument gelesen und bin einverstanden.</span>
      </label>
      <div className="go-knopfzeile" style={{ marginTop: 16 }}>
        <button type="button" className={`go-knopf ${s.voll}`} disabled={laeuft || leer || !einverstanden || name.trim().length < 2} onClick={unterschreiben}>
          Unterschreiben
        </button>
      </div>
      </> : null}
      <input ref={datei} type="file" accept="application/pdf,image/jpeg,image/png" hidden aria-hidden="true" data-testid={`dokument-${art}-hochladen`}
        onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void hochladen(f); }} />
      <div className="go-knopfzeile" style={{ marginTop: zeichnen ? 12 : 16 }}>
        <button type="button" className={`go-knopf ${zeichnen ? "go-knopf-leise " : ""}${s.voll}`} disabled={laeuft} onClick={() => datei.current?.click()}>
          Unterschrieben hochladen
        </button>
      </div>
      <p className="go-meta" style={{ marginTop: 8 }}>PDF oder Foto, höchstens 10 MB</p>
      {fehler ? <p className="go-fehler" role="alert">{fehler}</p> : null}
    </section>
  );
}

"use client";

/**
 * DAS MELDEFORMULAR FÜR MÄNGEL (IDA-298) — Punkte ankreuzen, beschreiben, fotografieren, senden.
 *
 * Die Fotos werden HIER verkleinert (längste Kante `KANTE_CLIENT`, JPEG), bevor sie hochgehen: ein
 * Telefonbild hat 3–8 MB, und am Fahrzeug ist das Netz oft schwach. Kann der Browser ein Bild nicht
 * selbst lesen (z. B. HEIC in Chrome), geht das Original hoch und der Server entscheidet. Verlassen kann
 * man sich darauf nicht — der Server rechnet jedes Bild ohnehin neu (`_lib/maengel/fotos.ts`).
 *
 * IDA-358: Punkte, Beschreibung und Name liegen auf dem Gerät (`core/entwurf`), die Meldung bis zur
 * Bestätigung auch; ein Wurf oder eine Antwort ohne JSON (Rollout: 502, 404) wird wiederholt, mit
 * derselben Sendungs-ID — die Route macht daraus die ID des Mangels und legt ihn nicht zweimal an.
 * ⚠️ DIE FOTOS NICHT: eine Datei ist nicht ablegbar (`core/entwurf/ablage.ts`). Sie gehen mit, solange
 * die Seite steht; nach einem Neuladen geht die liegende Meldung ohne sie raus — lieber der Mangel ohne
 * Bild als gar keiner.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useEntwurf } from "@/core/entwurf/useEntwurf";
import { SendeStatus } from "./SendeStatus";
import Link from "next/link";
import { Ikone } from "./ikonen";
import { BESCHREIBUNG_MAX, NAME_MAX, type MeldeAntwort } from "../_lib/maengel/meldung";
import s from "./helfer.module.css";
import m from "./mangel.module.css";

const KANTE_CLIENT = 1600;
const MAX_FOTOS_CLIENT = 3;

type Foto = { id: number; datei: File; vorschau: string };

async function verkleinere(datei: File): Promise<Blob> {
  try {
    const bild = await createImageBitmap(datei, { imageOrientation: "from-image" });
    const faktor = Math.min(1, KANTE_CLIENT / Math.max(bild.width, bild.height));
    const leinwand = document.createElement("canvas");
    leinwand.width = Math.round(bild.width * faktor);
    leinwand.height = Math.round(bild.height * faktor);
    leinwand.getContext("2d")?.drawImage(bild, 0, 0, leinwand.width, leinwand.height);
    bild.close();
    const blob = await new Promise<Blob | null>((fertig) => leinwand.toBlob(fertig, "image/jpeg", 0.82));
    return blob ?? datei;
  } catch {
    return datei;
  }
}

export function MangelFormular({
  ortId,
  ortAnzeige,
  punkte,
  andererOrt,
  rueckweg,
}: {
  ortId: string;
  ortAnzeige: string;
  punkte: string[];
  /** Link „Anderer Ort" — `null`, wenn es nur diesen einen gibt. */
  andererOrt: string | null;
  rueckweg: { href: string; text: string };
}) {
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [beschreibung, setBeschreibung] = useState("");
  const [name, setName] = useState("");
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState(false);
  const zaehler = useRef(0);
  const fotoFeld = useRef<HTMLInputElement>(null);
  const vorschauen = useRef<string[]>([]);
  // Die Fotos des Augenblicks fuer `senden` — eine Wiederholung nimmt, was gerade dasteht.
  const fotosJetzt = useRef<Foto[]>([]);

  useEffect(() => {
    vorschauen.current = fotos.map((f) => f.vorschau);
    fotosJetzt.current = fotos;
  }, [fotos]);

  type Nutzlast = { punkte: string[]; beschreibung: string; name: string };
  const entwurf = useEntwurf<Nutzlast, Nutzlast, MeldeAntwort>({
    schluessel: `lagerbuch:mangel:${ortId}`,
    stand: { punkte: gewaehlt, beschreibung, name },
    wiederherstellen: (w) => {
      setGewaehlt(w.punkte);
      setBeschreibung(w.beschreibung);
      setName(w.name);
    },
    senden: async (n, sendungId) => {
      const daten = new FormData();
      daten.set("ort", ortId);
      daten.set("sendung", sendungId);
      for (const p of n.punkte) daten.append("punkt", p);
      daten.set("beschreibung", n.beschreibung);
      daten.set("name", n.name);
      for (const [i, f] of fotosJetzt.current.entries()) daten.append("foto", await verkleinere(f.datei), `foto-${i}.jpg`);
      const r = await fetch("/helfer/mangel/melden", { method: "POST", body: daten });
      const antwort = (await r.json().catch(() => null)) as MeldeAntwort | null;
      // Ohne Antwort der Route (Rollout: 502, 404 als HTML) ist nichts entschieden — ein Wurf, also wiederholen.
      if (!antwort || typeof antwort.ok !== "boolean") throw new Error(`Meldung ohne Antwort (HTTP ${r.status})`);
      return antwort;
    },
    antwort: (a) => {
      if (a.ok) {
        setFertig(true);
        return true;
      }
      setFehler(a.fehler);
      return false;
    },
  });
  const laeuft = entwurf.zustand !== "ruhe";
  useEffect(() => () => vorschauen.current.forEach((u) => URL.revokeObjectURL(u)), []);

  function umschalten(punkt: string): void {
    setGewaehlt((vorher) => (vorher.includes(punkt) ? vorher.filter((p) => p !== punkt) : [...vorher, punkt]));
  }

  function fotosDazu(liste: FileList | null): void {
    if (!liste) return;
    const neu = [...liste].filter((d) => d.type.startsWith("image/") || d.type === "");
    setFotos((vorher) => [
      ...vorher,
      ...neu.slice(0, MAX_FOTOS_CLIENT - vorher.length).map((datei) => ({
        id: zaehler.current++, datei, vorschau: URL.createObjectURL(datei),
      })),
    ]);
    if (fotoFeld.current) fotoFeld.current.value = "";
  }

  function fotoWeg(id: number): void {
    setFotos((vorher) => {
      const weg = vorher.find((f) => f.id === id);
      if (weg) URL.revokeObjectURL(weg.vorschau);
      return vorher.filter((f) => f.id !== id);
    });
  }

  function senden(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (laeuft) return;
    if (gewaehlt.length === 0 && beschreibung.trim() === "") {
      setFehler("Bitte mindestens einen Punkt ankreuzen oder beschreiben, was los ist.");
      return;
    }
    setFehler(null);
    entwurf.sende({ punkte: gewaehlt, beschreibung, name });
  }

  function nochEiner(): void {
    fotos.forEach((f) => URL.revokeObjectURL(f.vorschau));
    setGewaehlt([]);
    setBeschreibung("");
    setFotos([]);
    setFertig(false);
  }

  if (fertig) {
    return (
      <div className={`${s.karte} ${m.fertig}`} data-rolle="mangel-fertig" role="status">
        <div className={m.fertigTitel}>Danke, ist gemeldet</div>
        <p className={s.fussnote}>Die Verwaltung des Lagerbuchs bekommt Bescheid und kümmert sich.</p>
        <div className={m.wege}>
          <button type="button" className={`${s.knopf} ${s.knopfGeist}`} onClick={nochEiner}>
            Noch einen Mangel hier melden
          </button>
          <Link className={`${s.knopf} ${s.knopfGeist}`} href={rueckweg.href}>{rueckweg.text}</Link>
        </div>
      </div>
    );
  }

  return (
    <form className={s.lesebahn} onSubmit={senden} noValidate data-rolle="mangel-formular">
      <div className={s.schirmKopf}>Mangel melden</div>
      <div className={s.karte}>
        <div className={s.zeile} style={{ justifyContent: "space-between" }}>
          <div className={s.zeileHaupt}>
            <div className={s.fussnote}>Ort</div>
            <div className={s.zeileName} data-rolle="mangel-ort">{ortAnzeige}</div>
          </div>
          {andererOrt && (
            <Link className={`${s.knopf} ${s.knopfGeist}`} href={andererOrt} data-rolle="mangel-anderer-ort">
              Ändern
            </Link>
          )}
        </div>
      </div>

      <fieldset className={`${s.karte} ${m.abschnitt}`} style={{ padding: 0, margin: "14px 0 0" }}>
        <legend className={m.versteckt}>Was ist los?</legend>
        <div className={s.karteTitel} aria-hidden="true">Was ist los?</div>
        {punkte.map((punkt) => (
          <label key={punkt} className={`${s.zeile} ${s.zeileWahl}`}>
            <input
              type="checkbox"
              className={s.wahlKnopf}
              checked={gewaehlt.includes(punkt)}
              onChange={() => umschalten(punkt)}
            />
            <span className={s.zeileHaupt}>{punkt}</span>
          </label>
        ))}
      </fieldset>

      <div className={`${s.karte} ${m.abschnitt}`}>
        <label className={s.karteTitel} htmlFor="mangel-beschreibung" style={{ display: "block" }}>Beschreibung</label>
        <div className={s.kartePad}>
          <textarea
            id="mangel-beschreibung"
            className={`${s.feld} ${m.beschreibung}`}
            placeholder="Was genau, wo genau?"
            maxLength={BESCHREIBUNG_MAX}
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.target.value)}
          />
        </div>
      </div>

      <div className={`${s.karte} ${m.abschnitt}`}>
        <div className={s.karteTitel}>Fotos</div>
        {fotos.length > 0 && (
          <div className={m.fotoleiste} data-rolle="mangel-fotos">
            {fotos.map((f, i) => (
              <div key={f.id} className={m.foto}>
                {/* eslint-disable-next-line @next/next/no-img-element -- lokale Vorschau aus einer Blob-Adresse */}
                <img src={f.vorschau} alt={`Foto ${i + 1}`} />
                <button type="button" className={m.fotoWeg} onClick={() => fotoWeg(f.id)} aria-label={`Foto ${i + 1} entfernen`}>
                  <Ikone name="kreuz" groesse={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className={s.kartePad}>
          {fotos.length < MAX_FOTOS_CLIENT ? (
            <label className={`${s.knopf} ${s.knopfGeist} ${m.fotoKnopf}`}>
              <input
                ref={fotoFeld}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className={m.versteckt}
                onChange={(e) => fotosDazu(e.target.files)}
                data-rolle="mangel-foto-feld"
              />
              <Ikone name="plus" groesse={16} />
              {fotos.length === 0 ? "Foto aufnehmen" : "Weiteres Foto"}
            </label>
          ) : (
            <p className={s.fussnote}>Mehr als {MAX_FOTOS_CLIENT} Fotos gehen nicht mit.</p>
          )}
        </div>
      </div>

      <div className={`${s.karte} ${m.abschnitt}`}>
        <label className={s.karteTitel} htmlFor="mangel-name" style={{ display: "block" }}>Dein Name (freiwillig)</label>
        <div className={s.kartePad}>
          <input
            id="mangel-name"
            className={s.feld}
            autoComplete="name"
            maxLength={NAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>

      {fehler && <p className={m.fehler} role="alert" data-rolle="mangel-fehler">{fehler}</p>}
      <SendeStatus entwurf={entwurf} rolle="mangel-status" verwerfbar />

      <button
        type="submit"
        className={`${s.knopf} ${s.knopfRot} ${s.knopfBreit}`}
        style={{ marginTop: 14 }}
        disabled={laeuft}
        data-rolle="mangel-senden"
      >
        {entwurf.zustand === "sendet" ? "Wird gesendet …" : "Mangel melden"}
      </button>
    </form>
  );
}

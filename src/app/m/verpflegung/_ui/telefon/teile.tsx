"use client";

import { useState, type ReactNode } from "react";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { einheitText, restKurz, runde, TEILBAR, zahlText, type MhdStatus } from "../../_lib/mhd";
import type { ArtikelDTO } from "../../_lib/typen";
import { Kamera } from "./Kamera";
import s from "./telefon.module.css";

/** Bausteine der Telefonansicht. Ohne antd (öffentliche Ansichtsklasse). */

export function Ampel({ status }: { status: MhdStatus }) {
  return <span className={`${s.chip} ${s[status.ampel]}`}>{status.gesperrt ? "gesperrt" : restKurz(status.tage)}</span>;
}

export function Menge({ menge, einheit }: { menge: number; einheit: string }) {
  return <div className={s.mengenchip}>{zahlText(menge)}<small>{einheitText(menge, einheit)}</small></div>;
}

export function Zurueck({ onClick, children = "Zurück" }: { onClick: () => void; children?: ReactNode }) {
  return <button type="button" className={s.zurueck} onClick={onClick}><Icons8Ikone name="arrow-left" groesse={16} /> {children}</button>;
}

export function Fehler({ text }: { text: string | null }) {
  return text ? <div className={`${s.hinweis} ${s.rot}`} role="alert">{text}</div> : null;
}

/** Plus/Minus mit Zahlenfeld; in kg und l auch Teile (0,5). */
export function Stepper({ wert, setWert, max, einheit }: { wert: number; setWert: (n: number) => void; max?: number; einheit: string }) {
  const teilbar = TEILBAR.includes(einheit);
  const schritt = teilbar ? 0.5 : 1;
  const min = teilbar ? 0.001 : 1;
  const [text, setText] = useState<string | null>(null);
  const begrenze = (n: number) => runde(Math.max(min, max !== undefined ? Math.min(max, n) : n));
  return (
    <div className={s.stepper}>
      <button type="button" className={s.steptaste} aria-label="weniger" disabled={wert <= min} onClick={() => { setText(null); setWert(begrenze(wert - schritt)); }}>
        <Icons8Ikone name="minus" groesse={22} kraeftig />
      </button>
      <input
        className={s.stepwert}
        inputMode={teilbar ? "decimal" : "numeric"}
        value={text ?? zahlText(wert)}
        onChange={(e) => {
          const roh = e.target.value.replace(teilbar ? /[^\d,.]/g : /\D/g, "");
          setText(roh);
          const n = Number(roh.replace(",", "."));
          if (Number.isFinite(n) && n > 0) setWert(begrenze(teilbar ? n : Math.round(n)));
        }}
        onBlur={() => setText(null)}
        aria-label="Menge"
      />
      <button type="button" className={s.steptaste} aria-label="mehr" disabled={max !== undefined && wert >= max} onClick={() => { setText(null); setWert(begrenze(wert + schritt)); }}>
        <Icons8Ikone name="plus" groesse={22} kraeftig />
      </button>
    </div>
  );
}

/** Ein Strichcode aus Kamera oder Feld: nur Ziffern, 8 oder 12–14 Stellen. */
export function eanAus(roh: string): string | null {
  const z = roh.replace(/\s/g, "");
  return /^(\d{8}|\d{12,14})$/.test(z) ? z : null;
}

export type Treffer = { ean: string; artikelId: string | null };

/** Eine Zeile der Artikelliste: was sie zeigt, steht fest; gefiltert wird über Name, Kategorie und EAN. */
export type ListenZeile = { artikel: ArtikelDTO; bestand: number; ampel: MhdStatus | null };

const falte = (x: string) => x.toLocaleLowerCase("de").normalize("NFD").replace(/\p{M}/gu, "");

/**
 * Startschirm jedes Reiters wie `lagerbuch/_ui/ArtikelSuche.tsx`: Suchfeld, daneben die Kamera für die EAN der
 * Packung, darunter die Artikel. Eine getippte EAN geht wie ein Scan weiter, auch wenn das Lager sie nicht kennt.
 */
export function ArtikelListe({ zeilen, artikel, onWahl, onTreffer, leerText }: {
  zeilen: readonly ListenZeile[];
  artikel: readonly ArtikelDTO[];
  onWahl: (artikelId: string) => void;
  onTreffer: (t: Treffer) => void;
  leerText: string;
}) {
  const [q, setQ] = useState("");
  const [kamera, setKamera] = useState(false);
  const ean = eanAus(q);
  const nadel = falte(q.trim());
  const treffer = zeilen.filter((z) => falte(`${z.artikel.name} ${z.artikel.kategorie} ${z.artikel.ean ?? ""}`).includes(nadel));
  const melde = (code: string) => {
    const e = eanAus(code);
    if (e) onTreffer({ ean: e, artikelId: artikel.find((a) => a.ean === e)?.id ?? null });
  };
  return (
    <>
      <form className={s.feldzeile} onSubmit={(e) => { e.preventDefault(); if (ean) melde(ean); }}>
        <input
          className={s.suchfeld}
          type="search"
          aria-label="Artikel suchen"
          placeholder="Artikel oder Strichcode…"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-rolle="artikel-suche"
        />
        <button type="button" className={`${s.knopf} ${kamera ? s.knopfTinte : s.knopfGeist}`} aria-pressed={kamera} onClick={() => setKamera((k) => !k)}>
          <Icons8Ikone name="barcode" groesse={20} /> Scannen
        </button>
      </form>
      {kamera && <div className={s.block} style={{ marginTop: 0, marginBottom: 10 }}><Kamera lesart="ean" onCode={melde} /></div>}
      {ean && (
        <button type="button" className={`${s.knopf} ${s.knopfTinte} ${s.breit}`} style={{ marginBottom: 10 }} onClick={() => melde(ean)}>
          Weiter mit {ean}
        </button>
      )}
      <div className={`${s.karte} ${s.karteRaster}`}>
        {zeilen.length === 0 && <div className={s.leer}>{leerText}</div>}
        {zeilen.length > 0 && treffer.length === 0 && <div className={s.leer}>Nichts gefunden.</div>}
        {treffer.map((z) => (
          <button type="button" key={z.artikel.id} className={s.zeile} onClick={() => onWahl(z.artikel.id)} data-rolle="artikel-zeile">
            <div className={s.zeilehaupt}>
              <div className={s.name}>{z.artikel.name}</div>
              <div className={s.meta}>
                <span className={s.fach}>{z.artikel.kategorie}</span>
                <span>Bestand {zahlText(z.bestand)} {einheitText(z.bestand, z.artikel.einheit)}</span>
                {z.ampel && z.ampel.ampel !== "ok" && <Ampel status={z.ampel} />}
                {z.artikel.vorlaeufig && <span className={`${s.chip} ${s.gelb}`}>vorläufig</span>}
              </div>
            </div>
            <Icons8Ikone name="chevron-right" groesse={18} />
          </button>
        ))}
      </div>
    </>
  );
}

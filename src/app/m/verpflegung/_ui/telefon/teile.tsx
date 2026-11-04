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

export function Rueckmeldung({ text, onWeiter }: { text: string; onWeiter: () => void }) {
  return (
    <div className={s.stapel}>
      <div className={`${s.hinweis} ${s.ok}`} role="status" style={{ marginTop: 0, fontSize: 15, padding: "14px 14px" }}>
        <Icons8Ikone name="checkmark" groesse={18} /> {text}
      </div>
      <button type="button" className={`${s.knopf} ${s.knopfTinte} ${s.breit}`} onClick={onWeiter}>
        <Icons8Ikone name="barcode" groesse={20} /> Nächste Packung scannen
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

/**
 * Packung finden: Kamera (EAN), oder EAN tippen, oder nach Namen suchen. `auswahl` sind die Artikel, die die
 * Namenssuche anbietet (beim Ausgeben die, die hier liegen).
 */
export function Scanner({ titel, auswahl, artikel, onTreffer }: {
  titel: string;
  auswahl: readonly ArtikelDTO[];
  artikel: readonly ArtikelDTO[];
  onTreffer: (t: Treffer) => void;
}) {
  const [suche, setSuche] = useState("");
  const q = suche.trim().toLowerCase();
  const ean = eanAus(suche);
  const treffer = q && !ean ? auswahl.filter((a) => a.name.toLowerCase().includes(q) || (a.ean ?? "").includes(q)).slice(0, 8) : [];
  const melde = (code: string) => {
    const e = eanAus(code);
    if (e) onTreffer({ ean: e, artikelId: artikel.find((a) => a.ean === e)?.id ?? null });
  };
  return (
    <>
      <div className={s.schirmkopf}>{titel}</div>
      <Kamera lesart="ean" onCode={melde} />
      <form className={s.block} onSubmit={(e) => { e.preventDefault(); if (ean) melde(ean); }}>
        <input
          className={s.suchfeld}
          aria-label="Strichcode oder Name"
          placeholder="Strichcode oder Name"
          autoComplete="off"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          data-rolle="scan-feld"
        />
        {ean && <button type="submit" className={`${s.knopf} ${s.knopfTinte} ${s.breit} ${s.block}`}>Weiter mit {ean}</button>}
      </form>
      {treffer.length > 0 && (
        <div className={`${s.karte} ${s.block}`}>
          {treffer.map((a) => (
            <button type="button" key={a.id} className={s.zeile} onClick={() => onTreffer({ ean: a.ean ?? "", artikelId: a.id })}>
              <div className={s.zeilehaupt}>
                <div className={s.name}>{a.name}</div>
                {a.ean && <div className={s.meta}><span className={s.mono}>{a.ean}</span></div>}
              </div>
              <Icons8Ikone name="chevron-right" groesse={18} />
            </button>
          ))}
        </div>
      )}
      {q && !ean && treffer.length === 0 && <div className={`${s.karte} ${s.leer} ${s.block}`}>Nichts gefunden.</div>}
    </>
  );
}

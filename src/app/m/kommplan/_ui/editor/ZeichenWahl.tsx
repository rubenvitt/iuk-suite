"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Button, Input } from "antd";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import { symbolId, type Symbolsatz } from "../zeichnung/Symbole";
import { SUCHBEISPIELE, sucheZeichen } from "./suche";
import { leseZuletzt, merkeZuletzt } from "./zuletzt";

/**
 * ZEICHEN-SUCHE (Spec §6.4, Entscheidung 4): oben die zuletzt genutzten (dieser Browser) und die des
 * Plans, darunter die Treffer. Die SVGs kommen über `ladeSymbole` nach und stehen dann in den `<defs>`
 * der Fläche — die Vorschauen hier referenzieren sie per `<use>`.
 */
export function ZeichenWahl({ wert, index, symbole, ladeSymbole, planZeichen, onWahl }: {
  wert: string | null; index: readonly ZeichenIndexEintrag[]; symbole: Symbolsatz;
  ladeSymbole: (schluessel: string[]) => void; planZeichen: readonly string[]; onWahl: (k: string | null) => void;
}) {
  const basis = useId();
  const raster = useRef<HTMLDivElement>(null);
  const [anfrage, setAnfrage] = useState("");
  const [zuletzt, setZuletzt] = useState<string[]>(() => leseZuletzt());
  const titel = useMemo(() => new Map(index.map((e) => [e.schluessel, e.titel])), [index]);
  const treffer = sucheZeichen(index, anfrage);
  const vorschlaege = [...new Set([...zuletzt, ...planZeichen])].filter((k) => titel.has(k)).slice(0, 12);

  const suche = (text: string) => {
    setAnfrage(text);
    const neu = sucheZeichen(index, text).map((e) => e.schluessel).filter((k) => !symbole[k]);
    if (neu.length > 0) ladeSymbole(neu);
  };
  const waehle = (k: string | null) => {
    if (k !== null) setZuletzt(merkeZuletzt(k));
    setAnfrage("");
    onWahl(k);
  };
  const knopf = (k: string) => (
    <button type="button" key={k} className="kp-zeichen-knopf" data-zeichen={k} aria-pressed={wert === k} onClick={() => waehle(k)}>
      {symbole[k]
        ? <svg viewBox="0 0 10 10" width={36} height={36} aria-hidden="true"><use href={`#${symbolId(k)}`} width={10} height={10} /></svg>
        : <span className="kp-zeichen-platz" aria-hidden="true" />}
      <span>{titel.get(k)}</span>
    </button>
  );

  return (
    <div className="kp-zeichenwahl">
      <p className="kp-hilfe" id={`${basis}-jetzt`}>{wert ? `Gewählt: ${titel.get(wert) ?? wert}` : "Kein Zeichen gewählt — die Karte trägt dann nur den Titel."}</p>
      {/* Enter wählt den ersten Treffer (leere Anfrage: den ersten Vorschlag), ↓ springt ins Raster (Kritik: sonst Tab für Tab). */}
      <Input aria-label="Zeichen suchen" aria-describedby={`${basis}-jetzt`} value={anfrage} onChange={(e) => suche(e.target.value)} placeholder={`z. B. ${SUCHBEISPIELE.join(", ")}`} allowClear
        onPressEnter={(e) => { e.preventDefault(); const erster = anfrage.trim() === "" ? vorschlaege[0] : treffer[0]?.schluessel; if (erster) waehle(erster); }}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); raster.current?.querySelector<HTMLButtonElement>("[data-zeichen]")?.focus(); } }} />
      {anfrage.trim() === "" && vorschlaege.length > 0 ? (
        <><p className="kp-hilfe">Zuletzt genutzt</p><div className="kp-zeichen-raster" ref={raster}>{vorschlaege.map(knopf)}</div></>
      ) : null}
      {anfrage.trim() !== "" ? (
        treffer.length > 0 ? <div className="kp-zeichen-raster" ref={raster} aria-live="polite">{treffer.map((e) => knopf(e.schluessel))}</div>
          : <p className="kp-hilfe" aria-live="polite">Kein Zeichen passt zu „{anfrage.trim()}“.</p>
      ) : null}
      {wert ? <Button onClick={() => waehle(null)}>Kein Zeichen</Button> : null}
    </div>
  );
}

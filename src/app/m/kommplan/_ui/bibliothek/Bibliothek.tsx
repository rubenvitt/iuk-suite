"use client";

import { useRef, useState } from "react";
import { Tabs } from "antd";
import { ladeZeichenAction } from "../../_actions/zeichen";
import type { Bibliothek as BibliothekDaten } from "../../_lib/bibliothek/typen";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import { SymbolDefs, type Symbolsatz } from "../zeichnung/Symbole";
import { EinheitenBereich } from "./EinheitenBereich";
import { StellenBereich } from "./StellenBereich";
import { VerbindungenBereich } from "./VerbindungenBereich";

/**
 * DIE BIBLIOTHEK (Spec §4.3, §6.1; Umsetzungsplan Phase 4, Entscheidung 11): drei Reiter, die Zahl im Reiter.
 * Zeichen-SVGs kommen wie im Editor über `ladeZeichenAction` nach und stehen EINMAL im Symbolvorrat (M11).
 * Nach jedem Speichern `router.refresh()` in den Bereichen — die Seite ist eine Server Component.
 */
export function Bibliothek({ bibliothek, zeichenIndex, symbole: start }: { bibliothek: BibliothekDaten; zeichenIndex: ZeichenIndexEintrag[]; symbole: Symbolsatz }) {
  const [symbole, setSymbole] = useState<Symbolsatz>(start);
  const unterwegs = useRef(new Set<string>());
  function ladeSymbole(schluessel: string[]) {
    const fehlen = [...new Set(schluessel)].filter((k) => !symbole[k] && !unterwegs.current.has(k)).slice(0, 40);
    if (fehlen.length === 0) return;
    for (const k of fehlen) unterwegs.current.add(k);
    void ladeZeichenAction(fehlen).then((neu) => setSymbole((alt) => ({ ...alt, ...neu }))).catch(() => {})
      .finally(() => { for (const k of fehlen) unterwegs.current.delete(k); });
  }
  const gemeinsam = { zeichenIndex, symbole, ladeSymbole };
  return (
    <div className="kp-bibliothek">
      <svg className="kp-symbolvorrat" aria-hidden="true" focusable="false" width={0} height={0} style={{ position: "absolute" }}><SymbolDefs symbole={symbole} /></svg>
      <Tabs items={[
        { key: "stellen", label: `Stellen (${bibliothek.stellen.length})`, children: <StellenBereich stellen={bibliothek.stellen} {...gemeinsam} /> },
        { key: "einheiten", label: `Einheiten (${bibliothek.einheiten.length})`, children: <EinheitenBereich einheiten={bibliothek.einheiten} {...gemeinsam} /> },
        { key: "verbindungen", label: `Verbindungen (${bibliothek.verbindungen.length})`, children: <VerbindungenBereich verbindungen={bibliothek.verbindungen} /> },
      ]} />
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { Tabs } from "antd";
import { ladeZeichenAction } from "../../_actions/zeichen";
import type { Bibliothek as BibliothekDaten } from "../../_lib/bibliothek/typen";
import type { EigenesZeichen } from "../../_lib/zeichen/eigen/typen";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import { SymbolDefs, type Symbolsatz } from "../zeichnung/Symbole";
import { EinheitenBereich } from "./EinheitenBereich";
import { StellenBereich } from "./StellenBereich";
import { VerbindungenBereich } from "./VerbindungenBereich";
import { ZeichenBereich } from "./ZeichenBereich";

/**
 * DIE BIBLIOTHEK (Spec §4.3, §6.1; Umsetzungsplan Phase 4, Entscheidung 11): vier Reiter, die Zahl im Reiter; der
 * vierte trägt die eigenen Zeichen (Baukasten). Zeichen-SVGs kommen wie im Editor über `ladeZeichenAction` nach und
 * stehen EINMAL im Symbolvorrat (M11). Nach jedem Speichern `router.refresh()` in den Bereichen — die Seite ist eine
 * Server Component; ihre Symbole gewinnen gegen die nachgeladenen (ein geändertes eigenes Zeichen zeigt sein neues Bild).
 */
export function Bibliothek({ bibliothek, eigeneZeichen = [], zeichenIndex, symbole: start, schrift = "inherit", reiter }: {
  bibliothek: BibliothekDaten; eigeneZeichen?: EigenesZeichen[]; zeichenIndex: ZeichenIndexEintrag[]; symbole: Symbolsatz; schrift?: string; reiter?: string;
}) {
  const [geladen, setSymbole] = useState<Symbolsatz>({});
  const symbole: Symbolsatz = { ...geladen, ...start };
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
      <Tabs defaultActiveKey={reiter} items={[
        { key: "stellen", label: `Stellen (${bibliothek.stellen.length})`, children: <StellenBereich stellen={bibliothek.stellen} {...gemeinsam} /> },
        { key: "einheiten", label: `Einheiten (${bibliothek.einheiten.length})`, children: <EinheitenBereich einheiten={bibliothek.einheiten} {...gemeinsam} /> },
        { key: "verbindungen", label: `Verbindungen (${bibliothek.verbindungen.length})`, children: <VerbindungenBereich verbindungen={bibliothek.verbindungen} /> },
        { key: "zeichen", label: `Zeichen (${eigeneZeichen.length})`, children: <ZeichenBereich zeichen={eigeneZeichen} symbole={symbole} schrift={schrift} /> },
      ]} />
    </div>
  );
}

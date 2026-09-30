"use client";

import { useEffect, useRef, type Ref } from "react";
import { Popover } from "antd";
import { aendereStelle } from "../../_lib/plan/operationen";
import type { Stelle } from "../../_lib/plan/schema";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import type { Aendere } from "../editor/aendere";
import { ZeichenWahl } from "../editor/ZeichenWahl";
import { leseZuletzt } from "../editor/zuletzt";
import { symbolId, type Symbolsatz } from "../zeichnung/Symbole";

/**
 * ZEICHEN KOMPAKT (Umsetzungsplan Phase 3, Entscheidungen 13, 16, 17): 44 px, das Zeichen per `<use>`
 * aus dem Symbolvorrat des Editors; das Popover trägt dieselbe `ZeichenWahl` wie das Flyin. Offen oder zu
 * bestimmt der Aufrufer (Alt+Z öffnet es aus dem Titel); beim Öffnen geht der Fokus in „Zeichen suchen"
 * (Fokus im Effekt ist erlaubt, Zustand nicht). Nach der Wahl entscheidet `onFertig` über den Rückweg.
 */
export function ZeichenKnopf({ stelle, index, symbole, ladeSymbole, planZeichen, aendere, tabIndex, offen, onOffen, onFertig, knopfRef }: {
  stelle: Stelle; index: readonly ZeichenIndexEintrag[]; symbole: Symbolsatz; ladeSymbole(schluessel: string[]): void;
  planZeichen: readonly string[]; aendere: Aendere; tabIndex: number;
  offen: boolean; onOffen(o: boolean): void; onFertig(): void; knopfRef: Ref<HTMLButtonElement>;
}) {
  const inhalt = useRef<HTMLDivElement>(null);
  useEffect(() => { if (offen) inhalt.current?.querySelector<HTMLInputElement>('input[aria-label="Zeichen suchen"]')?.focus(); }, [offen]);
  const name = stelle.titel.trim() || "(ohne Titel)";
  const zeichen = stelle.zeichen === null ? "keins" : index.find((e) => e.schluessel === stelle.zeichen)?.titel ?? stelle.zeichen;
  return (
    <Popover open={offen} trigger="click" placement="bottomLeft" destroyOnHidden
      onOpenChange={(o) => { onOffen(o); if (o) ladeSymbole(leseZuletzt()); }}
      content={<div ref={inhalt} className="kp-g-zeichenwahl" data-zeile-portal={stelle.id}>
        <ZeichenWahl wert={stelle.zeichen} index={index} symbole={symbole} ladeSymbole={ladeSymbole} planZeichen={planZeichen}
          onWahl={(k) => { aendere((q) => aendereStelle(q, stelle.id, { zeichen: k })); onOffen(false); onFertig(); }} />
      </div>}>
      <button ref={knopfRef} type="button" className="kp-g-zeichen" tabIndex={tabIndex} aria-expanded={offen} aria-label={`Zeichen von ${name}: ${zeichen} — ändern`}>
        {stelle.zeichen !== null && symbole[stelle.zeichen]
          ? <svg viewBox="0 0 10 10" width={32} height={32} aria-hidden="true"><use href={`#${symbolId(stelle.zeichen)}`} width={10} height={10} /></svg>
          : <span className="kp-g-zeichen-leer" aria-hidden="true" />}
      </button>
    </Popover>
  );
}

"use client";

import type { ClipboardEvent, CSSProperties, FocusEvent, KeyboardEvent, ReactNode, Ref } from "react";
import { Button, Dropdown, Input, type InputRef, type MenuProps } from "antd";
import type { GliederungsZeile } from "../../_lib/plan/gliederung";
import { LAENGE } from "../../_lib/plan/schema";

export type ZeilenAktion = "neu" | "unterstelle" | "links" | "rechts" | "einruecken" | "ausruecken" | "hoch" | "runter" | "uebernehmen" | "details" | "loeschen";
const titelVon = (s: { titel: string } | null) => (s === null ? "" : s.titel.trim() || "(ohne Titel)");

/**
 * EINE ZEILE DER GLIEDERUNG (Umsetzungsplan Phase 3, Entscheidungen 4, 10, 11, 15): rein darstellend,
 * alles Verhalten kommt vom Aufrufer. `aktiv` steuert den Roving Tabindex; `neben` (Verbindung,
 * Einheiten) blendet CSS am Telefon außer an der gewählten Zeile aus; `vorne` ist der Zeichenknopf,
 * `unten` die aufgeklappten Einheiten (Task 8).
 */
export function GliederungZeile({ zeile, gewaehlt, aktiv, menue, titelRef, aktionenRef, onTitel, onTaste, onEinfuegen, onFokus, onVerlassen, onMenue, onAktion, vorne, neben, unten }: {
  zeile: GliederungsZeile; gewaehlt: boolean; aktiv: boolean; menue: MenuProps["items"];
  titelRef: Ref<InputRef>; aktionenRef: Ref<HTMLButtonElement>;
  onTitel(wert: string): void; onTaste(e: KeyboardEvent<HTMLInputElement>): void; onEinfuegen?(e: ClipboardEvent<HTMLInputElement>): void;
  onFokus(): void; onVerlassen(e: FocusEvent<HTMLInputElement>): void; onMenue(offen: boolean): void; onAktion(a: ZeilenAktion): void;
  vorne?: ReactNode; neben?: ReactNode; unten?: ReactNode;
}) {
  const s = zeile.stelle;
  const lage = zeile.seite ? `Seitenstelle ${zeile.seite} von ${titelVon(zeile.eltern)}` : zeile.eltern ? `unter ${titelVon(zeile.eltern)}` : "oberste Ebene";
  const tab = aktiv ? 0 : -1;
  return (
    <li data-zeile={s.id} className="kp-g-zeile" aria-current={gewaehlt ? "true" : undefined} style={{ "--ebene": zeile.ebene } as CSSProperties}>
      <div className="kp-g-haupt">
        {zeile.seite ? <span className="kp-chip" data-seite={zeile.seite}>{`Seitenstelle ${zeile.seite}`}</span> : null}
        {vorne}
        <Input ref={titelRef} name="titel" className="kp-g-titel" tabIndex={tab} value={s.titel} maxLength={LAENGE.titel}
          placeholder="(ohne Titel)" enterKeyHint="enter" aria-label={`Titel, Ebene ${zeile.ebene + 1}, ${lage}`}
          onFocus={onFokus} onBlur={onVerlassen} onChange={(e) => onTitel(e.target.value)} onKeyDown={onTaste} onPaste={onEinfuegen} />
        {neben ? <div className="kp-g-neben">{neben}</div> : null}
        <Dropdown trigger={["click"]} onOpenChange={onMenue} menu={{ items: menue, onClick: ({ key }) => onAktion(key as ZeilenAktion) }}
          popupRender={(m) => <div data-zeile-portal={s.id}>{m}</div>}>
          <Button ref={aktionenRef} tabIndex={tab} aria-label={`Aktionen für ${titelVon(s)}`}>⋯</Button>
        </Dropdown>
      </div>
      {unten}
    </li>
  );
}

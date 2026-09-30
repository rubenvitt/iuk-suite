"use client";

import { useState, type Ref } from "react";
import { Select, type RefSelectProps } from "antd";
import { aendereStelle } from "../../_lib/plan/operationen";
import { ART_NAME, type PlanInhalt, type Stelle } from "../../_lib/plan/schema";
import { findeVerbindung, legeVerbindungAn } from "../../_lib/plan/verbindungen";
import type { Aendere } from "../editor/aendere";
import { neueId } from "../editor/ids";
import { KEINE, leseNeu, verbindungsOptionen } from "./verbindungsOptionen";

/**
 * Verbindung zur Elternstelle, inline (Umsetzungsplan Phase 3, Entscheidungen 10, 12, 15). Wurzeln haben
 * keine. Nur die AKTIVE Zeile trägt ein echtes Select (die Optionen nur bei offener Liste); jede andere
 * zeigt ihre Verbindung als schlichten Knopf, der die Zeile wählt und das Select geöffnet fokussiert
 * (`onOffen(true)` — der Aufrufer macht die Zeile aktiv und setzt den Fokus). `onFertig` nach der Wahl
 * und nach Esc auf der geschlossenen Liste: zurück in den Titel.
 */
export function VerbindungFeld({ inhalt, stelle, aendere, aktiv, offen, onOffen, onFertig, feldRef }: {
  inhalt: PlanInhalt; stelle: Stelle; aendere: Aendere; aktiv: boolean; offen: boolean;
  onOffen(o: boolean): void; onFertig(): void; feldRef: Ref<RefSelectProps>;
}) {
  const [suche, setSuche] = useState("");
  if (stelle.eltern === null) return <span className="kp-hilfe">oberste Ebene</span>;
  const name = stelle.titel.trim() || "(ohne Titel)";
  const jetzt = stelle.verbindungId === null ? null : inhalt.verbindungen.find((v) => v.id === stelle.verbindungId) ?? null;
  const text = jetzt ? `${jetzt.bezeichnung} · ${ART_NAME[jetzt.art]}` : "keine";
  if (!aktiv) {
    return <button type="button" className="kp-g-verbindung-text" tabIndex={-1} aria-label={`Verbindung von ${name}: ${text} — ändern`} onClick={() => onOffen(true)}>{text}</button>;
  }
  const waehle = (wert: string) => {
    const art = leseNeu(wert);
    const bezeichnung = suche.trim();
    const id = neueId(inhalt, "v");
    aendere((q) => {
      if (art === null) return aendereStelle(q, stelle.id, { verbindungId: wert === KEINE ? null : wert });
      const vorhanden = findeVerbindung(q, bezeichnung, art);
      const mit = vorhanden ? q : legeVerbindungAn(q, { id, art, bezeichnung });
      return aendereStelle(mit, stelle.id, { verbindungId: vorhanden?.id ?? id });
    });
    setSuche("");
    onOffen(false);
    onFertig();
  };
  return (
    <Select ref={feldRef} className="kp-g-verbindung" aria-label={`Verbindung von ${name}`}
      value={stelle.verbindungId ?? KEINE} onChange={waehle} popupMatchSelectWidth={false}
      open={offen} onOpenChange={onOffen}
      onKeyDown={(e) => { if (e.key === "Escape" && !offen) { e.preventDefault(); onFertig(); } }}
      showSearch={{ searchValue: suche, onSearch: (t) => { setSuche(t); if (!offen) onOffen(true); }, filterOption: false }}
      popupRender={(liste) => <div data-zeile-portal={stelle.id}>{liste}</div>}
      options={offen ? verbindungsOptionen(inhalt, suche) : [{ value: stelle.verbindungId ?? KEINE, label: text }]} />
  );
}

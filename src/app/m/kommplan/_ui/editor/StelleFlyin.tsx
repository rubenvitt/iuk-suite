"use client";

import { useEffect, useId, type RefObject } from "react";
import { Button, Checkbox, Drawer, Input, type InputRef } from "antd";
import { flyinBreite } from "@/core/theme/flyin";
import { aendereStelle, type StellenAenderung } from "../../_lib/plan/operationen";
import { LAENGE, type PlanInhalt } from "../../_lib/plan/schema";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import type { Symbolsatz } from "../zeichnung/Symbole";
import type { Aendere } from "./aendere";
import { KontaktZeilen } from "./KontaktZeilen";
import { ZeichenWahl } from "./ZeichenWahl";

export interface StelleFormularProps {
  inhalt: PlanInhalt; stelleId: string; aendere: Aendere; symbole: Symbolsatz;
  zeichenIndex: readonly ZeichenIndexEintrag[]; ladeSymbole: (schluessel: string[]) => void;
  fokus: { ziel: "titel" | "einheit"; stelle: string | null; n: number }; titelRef: RefObject<InputRef | null>; onLoeschen: () => void;
  /** Enter im Titelfeld: „fertig" — der Editor schließt das Flyin und gibt der Fläche den Fokus (Entscheidung 17). */
  onFertig: () => void;
}

/** Grundbreite des Flyins; die Fläche rechnet mit derselben Zahl den verdeckten Teil heraus (Entscheidung 18). */
export const STELLE_FLYIN_GRUND = 520;

/**
 * DAS FLYIN EINER STELLE (Spec §6.2, §6.4): rechts, `flyinBreite()` (Falle 13), OHNE Maske — die
 * Zeichnung bleibt klickbar, ein Klick auf eine andere Karte wechselt die Stelle im offenen Flyin.
 * Jede Eingabe wirkt sofort auf das Dokument (Autosave, Rückgängig); es gibt kein „Speichern".
 * `nachSchliessen` läuft NACH der Schließ-Animation: erst dann gibt der Editor der Fläche den Fokus,
 * sonst holte eine Fokus-Rückgabe der Schublade ihn danach wieder weg.
 */
export function StelleFlyin({ offen, onSchliessen, nachSchliessen, ...formular }: StelleFormularProps & { offen: boolean; onSchliessen: () => void; nachSchliessen: () => void }) {
  const s = formular.inhalt.stellen.find((x) => x.id === formular.stelleId);
  return (
    <Drawer open={offen} onClose={onSchliessen} mask={false} size={flyinBreite(STELLE_FLYIN_GRUND)} destroyOnHidden rootClassName="kp-flyin"
      title={s ? (s.titel.trim() || "Neue Stelle") : "Stelle"}
      afterOpenChange={(auf) => { if (auf && formular.fokus.ziel === "titel" && formular.fokus.stelle === formular.stelleId) formular.titelRef.current?.focus(); else if (!auf) nachSchliessen(); }}>
      {offen ? <StelleFormular {...formular} /> : null}
    </Drawer>
  );
}

export function StelleFormular(p: StelleFormularProps) {
  const { inhalt, stelleId, aendere, fokus, titelRef } = p;
  const basis = useId();
  // Fokusanfrage des Editors (neue Stelle, Enter): auch bei schon offenem Flyin, daher über `fokus.n`.
  // Sie nennt ihre Stelle: eine alte Anfrage gilt nach einem Wechsel der Auswahl nicht für die neue.
  useEffect(() => { if (fokus.ziel === "titel" && fokus.stelle === stelleId) titelRef.current?.focus(); }, [fokus, titelRef, stelleId]);
  const s = inhalt.stellen.find((x) => x.id === stelleId);
  if (!s) return <p className="kp-hilfe">Diese Stelle gibt es nicht mehr.</p>;
  const setze = (teil: StellenAenderung, schluessel?: string) => aendere((q) => aendereStelle(q, s.id, teil), schluessel);
  const planZeichen = [...new Set(inhalt.stellen.map((x) => x.zeichen).filter((z): z is string => z !== null))];

  return (
    <div className="kp-formular" data-flyin-stelle={s.id}>
      <label className="kp-feldname" htmlFor={`${basis}-titel`}>Titel</label>
      <Input id={`${basis}-titel`} ref={titelRef} name="titel" value={s.titel} maxLength={LAENGE.titel}
        onChange={(e) => setze({ titel: e.target.value }, `titel:${s.id}`)}
        onPressEnter={(e) => { e.preventDefault(); p.onFertig(); }} />
      <label className="kp-feldname" htmlFor={`${basis}-leiter`}>Leiter</label>
      <Input id={`${basis}-leiter`} name="leiter" value={s.leiter ?? ""} maxLength={LAENGE.leiter}
        onChange={(e) => setze({ leiter: e.target.value === "" ? null : e.target.value }, `leiter:${s.id}`)} />
      <Checkbox className="kp-hervorheben" checked={s.hervorheben} onChange={(e) => setze({ hervorheben: e.target.checked })}>Hervorheben</Checkbox>

      {/* key={s.id} an den Abschnitten mit eigenem Zustand: das Flyin bleibt beim Wechsel der Auswahl
          dieselbe Instanz — ohne key wanderten Suchanfrage, offene Listen und Fehlermeldungen zur
          nächsten Stelle mit (Review Focus 7). NICHT das ganze Formular keyen: dessen Fokus-Effekt
          zöge sonst bei jeder Pfeiltasten-Auswahl den Fokus ins Titelfeld. */}
      <fieldset className="kp-abschnitt">
        <legend>Zeichen</legend>
        <ZeichenWahl key={s.id} wert={s.zeichen} index={p.zeichenIndex} symbole={p.symbole} ladeSymbole={p.ladeSymbole}
          planZeichen={planZeichen} onWahl={(k) => setze({ zeichen: k })} />
      </fieldset>

      <KontaktZeilen key={s.id} kontakte={s.kontakte} onAendere={(neu, sch) => setze({ kontakte: neu }, sch ? `${sch}:${s.id}` : undefined)} />

      {/* TASK-12-EINFUEGESTELLE: Untersteht/Lage, Verbindung, Kanäle, Einheiten */}

      <div className="kp-formular-knoepfe">
        <Button danger onClick={p.onLoeschen}>Stelle löschen</Button>
      </div>
    </div>
  );
}

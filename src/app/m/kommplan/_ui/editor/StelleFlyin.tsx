"use client";

import { useEffect, useId, useState, type RefObject } from "react";
import { Button, Checkbox, Drawer, Input, Select, type InputRef } from "antd";
import { flyinBreite } from "@/core/theme/flyin";
import { speichereBibStelleAction } from "../../_actions/bibliothek";
import { passt, vergleichsform, type BibStelle } from "../../_lib/bibliothek/typen";
import { bibStelleAus, stelleVorschlaege, uebernimmBibStelle } from "../../_lib/plan/bibliothek";
import { aendereStelle, type StellenAenderung } from "../../_lib/plan/operationen";
import { LAENGE, type PlanInhalt, type Stelle } from "../../_lib/plan/schema";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import { fokussiereWennFrei, OHNE_FOKUSRUECKGABE } from "../fokus";
import type { Symbolsatz } from "../zeichnung/Symbole";
import { TitelVorschlaege } from "../gliederung/TitelVorschlaege";
import type { Aendere } from "./aendere";
import { useBibliothek } from "./bibliothekKontext";
import { EinheitenListe } from "./EinheitenListe";
import { KontaktZeilen } from "./KontaktZeilen";
import { StellenLage } from "./StellenLage";
import { VerbindungWahl } from "./VerbindungWahl";
import { ZeichenWahl } from "./ZeichenWahl";
import { NETZFEHLER } from "../../_lib/ergebnis";

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
    // autoFocus={false}: rc-drawer fokussiert sonst beim Öffnen seinen Container — NACH dem Fokus-Effekt
    // des Formulars. Kam N während der Schließanimation, hing der Fokus ~530 ms am Container, und
    // Getipptes ging verloren (Review Phase 2). Den Fokus setzt allein die Fokusanfrage des Editors.
    <Drawer open={offen} onClose={onSchliessen} mask={false} size={flyinBreite(STELLE_FLYIN_GRUND)} destroyOnHidden rootClassName="kp-flyin" autoFocus={false} focusable={OHNE_FOKUSRUECKGABE}
      title={s ? (s.titel.trim() || "Neue Stelle") : "Stelle"}
      afterOpenChange={(auf) => { if (auf && formular.fokus.ziel === "titel" && formular.fokus.stelle === formular.stelleId) fokussiereWennFrei(formular.titelRef.current?.input); else if (!auf) nachSchliessen(); }}>
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
  const { aktiv, bib } = useBibliothek();
  const s = inhalt.stellen.find((x) => x.id === stelleId);
  if (!s) return <p className="kp-hilfe">Diese Stelle gibt es nicht mehr.</p>;
  /** Eine Stelle aus der Bibliothek übernehmen — EIN Rückgängig-Schritt; das mitgebrachte Zeichen lädt dieser Weg selbst nach. */
  const uebernimm = (b: BibStelle) => {
    const f = aendere((q) => uebernimmBibStelle(q, s.id, b));
    if (f === null && b.zeichen) p.ladeSymbole([b.zeichen]);
    return f;
  };
  const setze = (teil: StellenAenderung, schluessel?: string) => aendere((q) => aendereStelle(q, s.id, teil), schluessel);
  const planZeichen = [...new Set(inhalt.stellen.map((x) => x.zeichen).filter((z): z is string => z !== null))];

  return (
    <div className="kp-formular" data-flyin-stelle={s.id}>
      {aktiv ? <AusBibliothek key={`bib:${s.id}`} uebernimm={uebernimm} titelRef={titelRef} /> : null}
      <label className="kp-feldname" htmlFor={`${basis}-titel`}>Titel</label>
      <Input id={`${basis}-titel`} ref={titelRef} name="titel" value={s.titel} maxLength={LAENGE.titel}
        onChange={(e) => setze({ titel: e.target.value }, `titel:${s.id}`)}
        onPressEnter={(e) => { if (e.altKey) return; e.preventDefault(); p.onFertig(); }}
        onKeyDown={(e) => { if (e.key === "Enter" && e.altKey && !e.repeat) { e.preventDefault(); const v = stelleVorschlaege(bib.stellen, s)[0]; if (v) uebernimm(v); } }} />
      <TitelVorschlaege stelle={s} tabStopps onWahl={(b) => { uebernimm(b); titelRef.current?.focus(); }} />
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

      <KontaktZeilen key={`kontakte:${s.id}`} kontakte={s.kontakte} onAendere={(neu, sch) => setze({ kontakte: neu }, sch ? `${sch}:${s.id}` : undefined)} />

      <StellenLage key={`lage:${s.id}`} inhalt={inhalt} stelle={s} aendere={aendere} />
      <VerbindungWahl key={`verbindung:${s.id}`} inhalt={inhalt} stelle={s} aendere={aendere} />
      <EinheitenListe key={`einheiten:${s.id}`} inhalt={inhalt} stelle={s} aendere={aendere} fokus={fokus} ladeSymbole={p.ladeSymbole} />

      {aktiv ? <InBibliothek key={`inbib:${s.id}`} stelle={s} /> : null}
      {/* Eine eigene Zeile: Meldungen von „In Bibliothek übernehmen“ verschieben den Löschknopf nicht (Review Phase 4). */}
      <div className="kp-formular-knoepfe">
        <Button danger onClick={p.onLoeschen}>Stelle löschen</Button>
      </div>
    </div>
  );
}


/** „Aus Bibliothek" (Spec §6.4): füllt die Stelle per Kopie, EIN Rückgängig-Schritt; Einheiten, Lage und Verbindung bleiben. */
function AusBibliothek({ uebernimm, titelRef }: { uebernimm: (b: BibStelle) => string | null; titelRef: RefObject<InputRef | null> }) {
  const basis = useId();
  const { bib } = useBibliothek();
  const [meldung, setMeldung] = useState<string | null>(null);
  // Nach jeder Wahl leer neu montiert (`key`): ein festes `value={null}` zeigte in antd je nach Fassung nicht den Platzhalter.
  const [runde, setRunde] = useState(0);
  // Mit dem Select ginge der Fokus verloren (Flyin ohne Maske: Esc, Tab, Enter erreichten das Formular nicht mehr) — er geht ins Titelfeld.
  useEffect(() => { if (runde > 0) titelRef.current?.focus(); }, [runde, titelRef]);
  if (bib.stellen.length === 0) return null;
  const waehle = (id: string) => {
    setRunde((n) => n + 1);
    const b = bib.stellen.find((x) => x.id === id);
    if (!b) return;
    const f = uebernimm(b);
    setMeldung(f ?? `„${b.titel}“ übernommen. „Rückgängig“ holt die vorigen Angaben zurück.`);
  };
  return (
    <div className="kp-aus-bibliothek">
      <label className="kp-feldname" htmlFor={`${basis}-bib`}>Aus Bibliothek</label>
      <Select key={runde} id={`${basis}-bib`} placeholder="Stelle aus der Bibliothek suchen" onChange={waehle}
        showSearch={{ filterOption: (eingabe, o) => passt(eingabe, [String(o?.label ?? "")]) }}
        options={bib.stellen.map((b) => ({ value: b.id, label: b.leiter ? `${b.titel} · ${b.leiter}` : b.titel }))} />
      {meldung ? <p className="kp-hilfe" role="status">{meldung}</p> : null}
    </div>
  );
}

/**
 * „In Bibliothek übernehmen" (Spec §4.3): Titel, Zeichen, Leiter, Kontakte als neuer Eintrag. Eine Dublette meldet
 * sich und bietet „Eintrag in der Bibliothek aktualisieren" an (die Notiz des Eintrags bleibt). Während des Laufs
 * nur `loading`, nie `disabled` — ein gesperrter Knopf verlöre den Fokus; Doppelauslösung fängt `laeuft` ab.
 */
function InBibliothek({ stelle }: { stelle: Stelle }) {
  const { bib, merke } = useBibliothek();
  const [meldung, setMeldung] = useState<string | null>(null);
  const [vorhanden, setVorhanden] = useState<BibStelle | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  async function sende(ziel: BibStelle | null) {
    if (laeuft) return;
    setLaeuft(true);
    const r = await speichereBibStelleAction({ ...bibStelleAus(stelle), id: ziel?.id ?? null, notiz: ziel?.notiz ?? null })
      .catch(() => ({ ok: false as const, fehler: NETZFEHLER }));
    setLaeuft(false);
    if (r.ok) {
      merke({ stellen: [r.eintrag] });
      setVorhanden(null);
      setMeldung(ziel ? `„${r.eintrag.titel}“ in der Bibliothek aktualisiert.` : `„${r.eintrag.titel}“ steht jetzt in der Bibliothek.`);
      return;
    }
    const titelFehler = "feldFehler" in r ? r.feldFehler?.titel : undefined;
    setMeldung(titelFehler ?? r.fehler);
    // Den vorhandenen Eintrag nur anbieten, wenn der Editor ihn kennt (sonst bleibt es bei der Meldung).
    setVorhanden(titelFehler ? bib.stellen.find((b) => vergleichsform(b.titel) === vergleichsform(stelle.titel)) ?? null : null);
  }
  // Knöpfe in ihrem eigenen Raster, die Meldung DARUNTER über die ganze Breite — als Rasterzelle neben den Knöpfen
  // stand sie in einer halben Spalte und schob „Stelle löschen“ in die nächste Zeile (Review Phase 4).
  return (
    <div className="kp-in-bibliothek">
      <div className="kp-formular-knoepfe">
        <Button onClick={() => void sende(null)} loading={laeuft} disabled={stelle.titel.trim() === ""}>In Bibliothek übernehmen</Button>
        {vorhanden ? <Button className="kp-knopf-umbruch" onClick={() => void sende(vorhanden)} loading={laeuft}>Eintrag in der Bibliothek aktualisieren</Button> : null}
      </div>
      {meldung ? <p className="kp-hilfe" role="status">{meldung}</p> : null}
    </div>
  );
}

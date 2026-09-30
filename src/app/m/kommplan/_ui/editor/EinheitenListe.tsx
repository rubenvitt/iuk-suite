"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input, type InputRef } from "antd";
import { aendereEinheit, fuegeEinheitenEin, loescheEinheit } from "../../_lib/plan/einheiten";
import { leseEinheitenliste } from "../../_lib/plan/einfuegen";
import { GRENZE, LAENGE, type PlanInhalt, type Stelle } from "../../_lib/plan/schema";
import type { Aendere } from "./aendere";
import { neueId, neueIds } from "./ids";

/**
 * EINHEITEN (Spec §6.4): einzeln oder „Liste einfügen" (je Zeile erstes Wort Typ, Rest Rufname).
 * Eine Liste mit Fehlern oder über der Grenze wird ganz abgewiesen, nie still gekürzt (Review Focus 2).
 */
export function EinheitenListe({ stelle, aendere, fokus }: {
  inhalt: PlanInhalt; stelle: Stelle; aendere: Aendere; fokus: { ziel: "titel" | "einheit"; stelle: string | null; n: number };
}) {
  const [liste, setListe] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string[]>([]);
  const [lokal, setLokal] = useState(0);
  const letzterTyp = useRef<InputRef>(null);
  const listeKnopf = useRef<HTMLButtonElement>(null);
  // Zwei getrennte Anfragen: die des Editors („+ Einheit" am Griff) und die eigene („+ Einheit" hier).
  // Zusammengelegt stähle eine spätere Titel-Anfrage des Editors den Fokus, sobald `lokal > 0` ist.
  // Nur für DIESE Stelle: der Abschnitt ist per key an die Stelle gebunden und montiert beim Wechsel
  // der Auswahl neu — eine noch stehende „+ Einheit"-Anfrage der vorigen Stelle zöge sonst den Fokus
  // in das Typ-Feld der neuen (und bräche die Tastaturschleife, Entscheidung 17).
  useEffect(() => { if (fokus.ziel === "einheit" && fokus.stelle === stelle.id) letzterTyp.current?.focus(); }, [fokus, stelle.id]);
  useEffect(() => { if (lokal > 0) letzterTyp.current?.focus(); }, [lokal]);

  const neu = () => {
    const f = aendere((p) => fuegeEinheitenEin(p, stelle.id, [{ id: neueId(p, "e"), typ: "", rufname: "", zeichen: null }]));
    if (f === null) setLokal((n) => n + 1); else setFehler([f]);
  };
  const uebernimm = () => {
    const r = leseEinheitenliste(liste ?? "");
    if (r.fehler.length > 0) { setFehler(r.fehler); return; }
    const f = aendere((p) => {
      const ids = neueIds(p, "e", r.einheiten.length);
      return fuegeEinheitenEin(p, stelle.id, r.einheiten.map((e, i) => ({ id: ids[i], ...e, zeichen: null })));
    });
    if (f !== null) { setFehler([f]); return; }
    setListe(null); setFehler([]);
    listeKnopf.current?.focus(); // der Fokus ginge mit der Textarea sonst verloren
  };

  return (
    <fieldset className="kp-abschnitt">
      <legend>Einheiten</legend>
      {stelle.einheiten.length === 0 ? <p className="kp-hilfe">Noch keine Einheiten.</p> : null}
      {stelle.einheiten.map((e, i) => (
        <div key={e.id} className="kp-zeile" data-einheit-zeile={e.id}>
          <Input ref={i === stelle.einheiten.length - 1 ? letzterTyp : undefined} aria-label={`Einheit ${i + 1}: Typ`} value={e.typ} maxLength={LAENGE.typ}
            onChange={(x) => aendere((p) => aendereEinheit(p, stelle.id, e.id, { typ: x.target.value }), `einheit:${e.id}:typ`)} placeholder="z. B. RTW" />
          <Input aria-label={`Einheit ${i + 1}: Rufname`} value={e.rufname} maxLength={LAENGE.rufname}
            onChange={(x) => aendere((p) => aendereEinheit(p, stelle.id, e.id, { rufname: x.target.value }), `einheit:${e.id}:rufname`)} placeholder="z. B. RK UE 40-83-5" />
          <Button aria-label={`Einheit ${i + 1} entfernen`} onClick={() => aendere((p) => loescheEinheit(p, stelle.id, e.id))}>Entfernen</Button>
        </div>
      ))}
      <div className="kp-formular-knoepfe">
        <Button onClick={neu} disabled={stelle.einheiten.length >= GRENZE.einheiten}>+ Einheit</Button>
        <Button ref={listeKnopf} onClick={() => { setListe(liste === null ? "" : null); setFehler([]); }}>{liste === null ? "Liste einfügen" : "Liste schließen"}</Button>
      </div>
      {liste !== null ? (
        <>
          {/* autoFocus: direkt einfügen können; Strg/Cmd+Enter übernimmt (Kritik) */}
          <Input.TextArea autoFocus aria-label="Einheiten, je Zeile eine" aria-keyshortcuts="Control+Enter Meta+Enter" value={liste}
            onChange={(e) => setListe(e.target.value)} autoSize={{ minRows: 4, maxRows: 12 }}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); uebernimm(); } }}
            placeholder={"RTW RK UE 40-83-5\nKTW RK UE 40-92-1"} />
          <div className="kp-formular-knoepfe"><Button type="primary" onClick={uebernimm} disabled={(liste ?? "").trim() === ""}>Übernehmen</Button></div>
        </>
      ) : null}
      {fehler.length > 0 ? <ul className="kp-feldfehler" role="status">{fehler.map((f) => <li key={f}>{f}</li>)}</ul> : null}
    </fieldset>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input, Select, type InputRef, type RefSelectProps } from "antd";
import { importiereBibEinheitenAction } from "../../_actions/bibliothek";
import { passt, vergleichsform, type BibEinheit } from "../../_lib/bibliothek/typen";
import { einsatzOrte, fuegeBibEinheitenEin } from "../../_lib/plan/bibliothek";
import { aendereEinheit, fuegeEinheitenEin, loescheEinheit } from "../../_lib/plan/einheiten";
import { leseEinheitenliste } from "../../_lib/plan/einfuegen";
import { GRENZE, LAENGE, type PlanInhalt, type Stelle } from "../../_lib/plan/schema";
import type { Aendere } from "./aendere";
import { useBibliothek } from "./bibliothekKontext";
import { neueId, neueIds } from "./ids";

/**
 * EINHEITEN (Spec §6.4): einzeln oder „Liste einfügen" (je Zeile erstes Wort Typ, Rest Rufname).
 * Eine Liste mit Fehlern oder über der Grenze wird ganz abgewiesen, nie still gekürzt (Review Focus 2).
 */
export function EinheitenListe({ inhalt, stelle, aendere, fokus, ladeSymbole }: {
  inhalt: PlanInhalt; stelle: Stelle; aendere: Aendere; fokus: { ziel: "titel" | "einheit"; stelle: string | null; n: number };
  /** Zeichen mitgebrachter Bibliothekseinheiten nachladen (Phase 4, Entscheidung 13). */
  ladeSymbole?: (schluessel: string[]) => void;
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
  const { aktiv, bib, merke } = useBibliothek();
  const [bibWahl, setBibWahl] = useState<string[]>([]);
  const [bibRunde, setBibRunde] = useState(0);
  const [bibMeldung, setBibMeldung] = useState<string | null>(null);
  const [bibLaeuft, setBibLaeuft] = useState(false);
  const bibFeld = useRef<RefSelectProps>(null);
  // Nach „Hinzufügen" sperrt sich der Knopf (Auswahl leer) — der Fokus geht zurück in die Auswahl, nicht auf body.
  useEffect(() => { if (bibRunde > 0) bibFeld.current?.focus(); }, [bibRunde]);

  const ausBib = () => {
    const gewaehlt = bib.einheiten.filter((e) => bibWahl.includes(e.id));
    const f = aendere((p) => fuegeBibEinheitenEin(p, stelle.id, gewaehlt, neueIds(p, "e", gewaehlt.length)));
    if (f !== null) { setFehler([f]); return; }
    const zeichen = gewaehlt.flatMap((e) => (e.zeichen ? [e.zeichen] : []));
    if (zeichen.length > 0) ladeSymbole?.(zeichen);
    setBibWahl([]); setFehler([]); setBibRunde((n) => n + 1);
  };
  async function inBibliothek() {
    if (bibLaeuft) return;
    const zeilen = stelle.einheiten.filter((e) => e.typ.trim() !== "" && e.rufname.trim() !== "");
    if (zeilen.length === 0) return;
    setBibLaeuft(true);
    const r = await importiereBibEinheitenAction(zeilen.map((e) => ({ typ: e.typ, rufname: e.rufname, notiz: null, zeichen: e.zeichen })))
      .catch(() => ({ ok: false as const, fehler: NETZ }));
    setBibLaeuft(false);
    if (r.ok) { merke({ einheiten: r.eintraege }); setBibMeldung(`${r.angelegt} angelegt, ${r.uebersprungen} schon vorhanden.`); }
    else setBibMeldung(r.fehler);
  }

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
      {aktiv && bib.einheiten.length > 0 ? (
        // Eigene Klasse, NICHT `kp-zeile`: in den aufgeklappten Einheiten der Gliederung gälte sonst ab 768 px das
        // dreispaltige Raster der Einheitenzeilen (`.kp-g-einheiten .kp-zeile`) — das Select läge in der Typspalte.
        <div className="kp-bib-einheiten">
          <Select ref={bibFeld} className="kp-bib-einheiten-wahl" mode="multiple" aria-label="Einheiten aus der Bibliothek" value={bibWahl} onChange={setBibWahl}
            placeholder="Aus Bibliothek suchen"
            showSearch={{ autoClearSearchValue: false, filterOption: (eingabe, o) => passt(eingabe, [String(o?.label ?? "")]) }}
            options={bibOptionen(bib.einheiten, inhalt, stelle)} />
          <Button onClick={ausBib} disabled={bibWahl.length === 0}>Hinzufügen</Button>
        </div>
      ) : null}
      <div className="kp-formular-knoepfe">
        <Button onClick={neu} disabled={stelle.einheiten.length >= GRENZE.einheiten}>+ Einheit</Button>
        <Button ref={listeKnopf} onClick={() => { setListe(liste === null ? "" : null); setFehler([]); }}>{liste === null ? "Liste einfügen" : "Liste schließen"}</Button>
        {aktiv && stelle.einheiten.length > 0 ? <Button onClick={() => void inBibliothek()} loading={bibLaeuft}>Einheiten in Bibliothek übernehmen</Button> : null}
      </div>
      {bibMeldung ? <p className="kp-hilfe" role="status">{bibMeldung}</p> : null}
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

const NETZ = "Das ging nicht durch. Prüfe die Verbindung und versuche es noch einmal.";

/**
 * Optionen der Einheitenauswahl (Entscheidung 13): an DIESER Stelle schon vorhandene Fahrzeuge gesperrt, an einer
 * anderen eingesetzte mit „— schon bei …" und hinter den freien — so entstehen doppelte Fahrzeuge nicht unbemerkt.
 */
function bibOptionen(einheiten: readonly BibEinheit[], inhalt: PlanInhalt, stelle: Stelle) {
  const orte = einsatzOrte(inhalt);
  const hier = new Set(stelle.einheiten.map((e) => vergleichsform(e.rufname)));
  return einheiten.map((e) => {
    const k = vergleichsform(e.rufname);
    const ort = orte.get(k);
    const name = `${e.typ} ${e.rufname}`;
    if (hier.has(k)) return { value: e.id, label: `${name} — steht schon hier`, disabled: true, rang: 2 };
    return ort ? { value: e.id, label: `${name} — schon bei ${ort.titel}`, rang: 1 } : { value: e.id, label: name, rang: 0 };
  }).sort((a, b) => a.rang - b.rang); // stabil: innerhalb eines Rangs bleibt die Reihenfolge der Bibliothek
}

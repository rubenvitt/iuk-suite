"use client";

import { useEffect, useImperativeHandle, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Button, type MenuProps } from "antd";
import { MELDUNG, fuegeGeschwisterEin, gliederungsZeilen, loescheLeereZeile, nachbarZeile, rueckeAus, rueckeEin, setzeVerbindungFuerGeschwister, verschiebeInReihe, zeilenAktionen, type GliederungsZeile, type ZeilenAktionen } from "../../_lib/plan/gliederung";
import { aendereStelle, fuegeSeitenstelleEin, fuegeUnterstelleEin, fuegeWurzelEin } from "../../_lib/plan/operationen";
import type { PlanInhalt } from "../../_lib/plan/schema";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import type { Aendere } from "../editor/aendere";
import { neueId } from "../editor/ids";
import { globalerBefehl } from "../editor/tasten";
import type { Symbolsatz } from "../zeichnung/Symbole";
import { GliederungZeile, type ZeilenAktion } from "./GliederungZeile";
import { gliederungsBefehl } from "./tasten";

export type FokusZiel = "titel" | "aktionen" | "zeichen" | "verbindung";
export interface GliederungGriff {
  /** Fokus in diese Zeile (fehlt sie: in die aktive; leerer Plan: „Erste Stelle anlegen"); Vorgabe: der Titel. */
  fokus(id: string | null, ziel?: FokusZiel): void;
  /** Zeile ins Bild holen, ohne den Fokus zu setzen (am Telefon öffnete Fokus die Tastatur). */
  zeige(id: string): void;
  /** Ein per Enter angelegtes, unberührtes Element verwerfen — beim Ansichtswechsel (Entscheidung 8). */
  raeumeAuf(): void;
}
export const GLIEDERUNG_BEDIENZEILE =
  "Enter neue Stelle darunter, auf leerer Zeile ausrücken · Tab / Umschalt+Tab Ebene · Alt+↑/↓ verschieben · ↑/↓ wandern · " +
  "Alt+V Verbindung · Alt+Z Zeichen · F2 oder Strg/Cmd+Enter Details · Esc verlässt das Titelfeld · " +
  "Eine eingerückte Liste einfügen legt einen ganzen Zweig an";
export const GLIEDERUNG_BEDIENZEILE_SCHMAL = "„⋯“ an jeder Zeile: anlegen, einrücken, verschieben, Details · Eine eingerückte Liste einfügen legt einen ganzen Zweig an";
const LEER_ZIEL = "~leer";

export interface GliederungProps {
  inhalt: PlanInhalt; auswahl: string | null; aendere: Aendere; meldung: ReactNode; griff?: Ref<GliederungGriff>;
  onAuswahl(id: string): void; onDetails(id: string): void; onLoeschen(id: string): void;
  onRueck(): void; onWieder(): void; onHinweis(text: string): void;
  /**
   * Verwirft den letzten Schritt, wenn `nach` noch der jetzige Stand ist — ein unberührt angelegtes Element
   * (U28) —, und wendet `dann` ATOMAR als neuen Schritt an (Enter auf leerer Zeile, Entscheidung 5): in
   * einem Aufruf, weil `aendere` danach noch den alten Verlauf sähe. Ergebnis: der neue Stand, sonst null.
   */
  verwirfUnberuehrt(nach: PlanInhalt, dann?: (q: PlanInhalt) => PlanInhalt): PlanInhalt | null;
  symbole: Symbolsatz; zeichenIndex: readonly ZeichenIndexEintrag[]; ladeSymbole(schluessel: string[]): void;
}

function menue(a: ZeilenAktionen, verbindung: string | null): MenuProps["items"] {
  return [
    { key: "neu", label: "Neue Stelle darunter (Enter)" },
    { key: "unterstelle", label: "Unterstelle anlegen", disabled: !a.unterstelle },
    { key: "links", label: "Seitenstelle links", disabled: !a.seitenstelle },
    { key: "rechts", label: "Seitenstelle rechts", disabled: !a.seitenstelle },
    { type: "divider" },
    { key: "einruecken", label: "Einrücken (Tab)", disabled: !a.einruecken },
    { key: "ausruecken", label: "Ausrücken (Umschalt+Tab)", disabled: !a.ausruecken },
    { key: "hoch", label: "Nach oben (Alt+↑)", disabled: !a.hoch },
    { key: "runter", label: "Nach unten (Alt+↓)", disabled: !a.runter },
    { type: "divider" },
    { key: "uebernehmen", label: verbindung ? `Verbindung „${verbindung}“ für Geschwister ohne Verbindung übernehmen` : "Verbindung für Geschwister übernehmen", disabled: !a.uebernehmen },
    { key: "details", label: "Details … (F2)" },
    { type: "divider" },
    { key: "loeschen", label: "Stelle löschen", danger: true },
  ];
}

/**
 * DIE GLIEDERUNG (Spec §6.5; Umsetzungsplan Phase 3, Entscheidungen 4–16). Dieselben Daten, derselbe
 * Verlauf und derselbe Speicherer wie das Diagramm: jede Änderung ist eine reine Operation über
 * `aendere`. Der Fokus folgt einer Anfrage (`fokus`), die ein Effekt NACH dem Rendern erfüllt — die
 * Zeile kann dabei im DOM umgezogen oder verschwunden sein (dann der Nachbar aus der alten Folge).
 * Wohin er geht, hängt an der Herkunft der Aktion (Entscheidung 16): Tastatur → Titel, Zeiger → das
 * Bedienelement, von dem sie ausging. Kein setState im Effekt-Rumpf.
 */
/**
 * Registriert ein Element je Zeile. antds `Input`/`Button` reichen den Ref über `composeRef` weiter: der
 * ruft den Rückruf beim Abbau mit `null` und übergeht dessen Aufräumfunktion — deshalb beides.
 */
function merke<T>(karte: Map<string, T>, id: string, el: T | null): () => void {
  if (el) karte.set(id, el); else karte.delete(id);
  return () => { if (karte.get(id) === el) karte.delete(id); };
}

export function Gliederung(p: GliederungProps) {
  const { inhalt, auswahl, aendere } = p;
  const zeilen = gliederungsZeilen(inhalt);
  const felder = useRef(new Map<string, HTMLInputElement>());
  const aktionen = useRef(new Map<string, HTMLButtonElement>());
  const erste = useRef<HTMLButtonElement>(null);
  const neu = useRef<{ id: string; nach: PlanInhalt } | null>(null);
  /** Herkunft der laufenden Aktion: gesetzt von pointerdown, gelöscht von keydown (auch aus Portalen der Zeile). */
  const zeiger = useRef(false);
  const [fokus, setFokus] = useState<{ id: string; n: number; stelle: number | "ende"; ziel: FokusZiel; ersatz: string[] } | null>(null);
  const [menueOffen, setMenueOffen] = useState<string | null>(null);
  const aktiv = zeilen.some((z) => z.stelle.id === auswahl) ? auswahl : zeilen[0]?.stelle.id ?? null;

  useEffect(() => {
    if (!fokus) return;
    if (fokus.id === LEER_ZIEL) { erste.current?.focus(); return; }
    const da = (x: string) => felder.current.get(x)?.isConnected === true;
    const id = [fokus.id, ...fokus.ersatz].find(da) ?? [...felder.current.keys()].find(da);
    if (id === undefined) { erste.current?.focus(); return; }
    if (fokus.ziel === "aktionen") { aktionen.current.get(id)?.focus(); return; }
    // „zeichen"/„verbindung" erfüllt Task 8 (Knopf bzw. Select der Zeile); bis dahin der Titel
    const el = felder.current.get(id)!;
    el.focus();
    const pos = fokus.stelle === "ende" ? el.value.length : Math.min(fokus.stelle, el.value.length);
    el.setSelectionRange(pos, pos);
  }, [fokus]);

  /** `ersatz`: Nachbarn aus der JETZIGEN Zeilenfolge — falls die Zeile nach dem Schritt fehlt (Strg+Z, Löschen). */
  const fokussiere = (id: string, stelle: number | "ende" = "ende", ziel: FokusZiel = "titel") =>
    setFokus((f) => ({ id, n: (f?.n ?? 0) + 1, stelle, ziel, ersatz: [nachbarZeile(zeilen, id, "hoch"), nachbarZeile(zeilen, id, "runter")].filter((x): x is string => x !== null) }));
  useImperativeHandle(p.griff, () => ({
    fokus: (id, ziel = "titel") => fokussiere(id ?? aktiv ?? LEER_ZIEL, "ende", ziel),
    zeige: (id) => felder.current.get(id)?.closest("li")?.scrollIntoView?.({ block: "nearest" }),
    raeumeAuf: () => { const n = neu.current; if (n) raeumeAuf(n.id); },
  }));

  function tueMit(op: (q: PlanInhalt) => PlanInhalt): PlanInhalt | null {
    let nach: PlanInhalt | null = null;
    return aendere((q) => (nach = op(q))) === null ? nach : null;
  }
  /** Ein per Enter angelegtes, unberührtes Element verschwindet beim Verlassen (Entscheidung 8). */
  function raeumeAuf(id: string): boolean {
    const n = neu.current;
    neu.current = null;
    return n !== null && n.id === id && p.verwirfUnberuehrt(n.nach) !== null;
  }
  /** Legt über `op` eine leere Stelle `id` an, merkt sie als unberührt und setzt den Fokus in ihren Titel. */
  function lege(op: (q: PlanInhalt, id: string) => PlanInhalt) {
    const id = neueId(inhalt, "s");
    const nach = tueMit((q) => op(q, id));
    if (nach) { neu.current = { id, nach }; fokussiere(id); }
  }
  function ersteStelle() { lege((q, id) => fuegeWurzelEin(q, id)); }
  function aktion(z: GliederungsZeile, a: ZeilenAktion) {
    const id = z.stelle.id;
    const zurueck: FokusZiel = zeiger.current ? "aktionen" : "titel"; // Entscheidung 16
    setMenueOffen(null);
    switch (a) {
      case "details": p.onDetails(id); return;
      case "loeschen": p.onLoeschen(id); return;
      case "neu": lege((q, n) => fuegeGeschwisterEin(q, id, n)); return; // anlegen: Fokus in den neuen Titel
      case "unterstelle": lege((q, n) => fuegeUnterstelleEin(q, id, n)); return;
      case "links": case "rechts": lege((q, n) => fuegeSeitenstelleEin(q, id, a, n)); return;
      case "einruecken": tueMit((q) => rueckeEin(q, id)); break;
      case "ausruecken": tueMit((q) => rueckeAus(q, id)); break;
      case "uebernehmen": tueMit((q) => setzeVerbindungFuerGeschwister(q, id)); break;
      default: tueMit((q) => verschiebeInReihe(q, id, a === "hoch" ? "hoch" : "runter"));
    }
    fokussiere(id, "ende", zurueck);
  }
  function taste(e: KeyboardEvent<HTMLInputElement>, z: GliederungsZeile) {
    const id = z.stelle.id;
    const g = globalerBefehl(e, false);
    if (g) {
      e.preventDefault();
      neu.current = null;
      if (g.art === "rueckgaengig") p.onRueck(); else p.onWieder();
      fokussiere(id); // fehlt die Zeile danach, fängt `ersatz` den Fokus (Entscheidung 10)
      return;
    }
    const b = gliederungsBefehl({ key: e.key, code: e.code, repeat: e.repeat, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey, isComposing: e.nativeEvent.isComposing }, e.currentTarget.value.trim() === "");
    if (!b) return;
    e.preventDefault(); // auch Tab ohne Wirkung: der Fokus verlässt das Feld nie (Review Focus 3)
    const caret = e.currentTarget.selectionStart ?? "ende";
    switch (b.art) {
      case "neu": {
        const neuId = neueId(inhalt, "s");
        const nach = tueMit((q) => fuegeGeschwisterEin(q, id, neuId));
        if (nach) { neu.current = { id: neuId, nach }; fokussiere(neuId); }
        return;
      }
      case "neuLeer": { // Entscheidung 5: ausrücken statt einer Kette leerer Karten
        if (z.eltern === null || z.seite !== null) { p.onHinweis(MELDUNG.erstTitel); return; }
        const eltern = z.eltern.id;
        const n = neu.current;
        neu.current = null;
        if (n?.id === id) { // verworfen + neu hinter der Elternstelle: EIN Schritt, wieder unberührt
          const neuId = neueId(inhalt, "s");
          const nach = p.verwirfUnberuehrt(n.nach, (q) => fuegeGeschwisterEin(q, eltern, neuId));
          if (nach) { neu.current = { id: neuId, nach }; fokussiere(neuId); return; }
        }
        tueMit((q) => rueckeAus(q, id));
        fokussiere(id);
        return;
      }
      case "einruecken": tueMit((q) => rueckeEin(q, id)); fokussiere(id, caret); return;
      case "ausruecken": tueMit((q) => rueckeAus(q, id)); fokussiere(id, caret); return;
      case "verschiebe": tueMit((q) => verschiebeInReihe(q, id, b.richtung)); fokussiere(id, caret); return;
      case "wandere": {
        const ziel = nachbarZeile(zeilen, id, b.richtung);
        if (ziel === null) return;
        raeumeAuf(id);
        fokussiere(ziel);
        return;
      }
      case "loeschen": {
        const ziel = nachbarZeile(zeilen, id, b.richtung) ?? nachbarZeile(zeilen, id, b.richtung === "hoch" ? "runter" : "hoch");
        const weg = raeumeAuf(id) || tueMit((q) => loescheLeereZeile(q, id)) !== null;
        if (weg) fokussiere(ziel ?? LEER_ZIEL);
        return;
      }
      case "verlassen": {
        if (raeumeAuf(id)) { fokussiere(nachbarZeile(zeilen, id, "hoch") ?? nachbarZeile(zeilen, id, "runter") ?? LEER_ZIEL); return; }
        aktionen.current.get(id)?.focus();
        return;
      }
      case "details": p.onDetails(id); return;
      case "verbindung": case "zeichen": fokussiere(id, "ende", b.art); return; // öffnet Task 8
    }
  }
  /** Entscheidung 8: verlässt der Fokus die Zeile (Klick, Tipp, Kopfleiste), verschwindet das unberührte Element. */
  function verlassen(e: FocusEvent<HTMLInputElement>, id: string) {
    if (neu.current?.id !== id) return;
    const nach = e.relatedTarget as Element | null;
    if (nach && (e.currentTarget.closest("li")?.contains(nach) || nach.closest(`[data-zeile-portal="${id}"]`))) return;
    raeumeAuf(id);
  }
  // Mehrzeiliges Einfügen folgt im nächsten Schritt (Umsetzungsplan Phase 3, Task 8); bis dahin fügt das Feld normal ein.

  return (
    <div className="kp-gliederung" data-gliederung=""
      onPointerDownCapture={() => { zeiger.current = true; }} onKeyDownCapture={() => { zeiger.current = false; }}>
      {zeilen.length === 0 ? (
        <div className="kp-leer">
          <p>Dieser Plan hat noch keine Stellen.</p>
          <Button ref={erste} type="primary" onClick={ersteStelle}>Erste Stelle anlegen</Button>
          <p className="kp-hilfe">Tipp: Danach eine eingerückte Liste (aus Word, einer E-Mail oder einem Editor) ins Titelfeld einfügen — daraus wird ein ganzer Zweig.</p>
        </div>
      ) : (
        <ul className="kp-g-liste" aria-label="Gliederung">
          {zeilen.map((z) => {
            const id = z.stelle.id;
            const verbindung = z.stelle.verbindungId === null ? null : inhalt.verbindungen.find((v) => v.id === z.stelle.verbindungId)?.bezeichnung ?? null;
            return (
              <GliederungZeile key={id} zeile={z} gewaehlt={id === auswahl} aktiv={id === aktiv}
                menue={menueOffen === id ? menue(zeilenAktionen(inhalt, id), verbindung) : []}
                titelRef={(r) => merke(felder.current, id, r?.input ?? null)}
                aktionenRef={(el) => merke(aktionen.current, id, el)}
                onTitel={(wert) => aendere((q) => aendereStelle(q, id, { titel: wert }), `titel:${id}`)}
                onTaste={(e) => taste(e, z)} onVerlassen={(e) => verlassen(e, id)}
                onFokus={() => { if (auswahl !== id) p.onAuswahl(id); }}
                onMenue={(offen) => setMenueOffen(offen ? id : null)} onAktion={(a) => aktion(z, a)} />
            );
          })}
        </ul>
      )}
      <p className="kp-hilfe kp-bedienhinweis kp-nur-breit">{GLIEDERUNG_BEDIENZEILE}</p>
      <p className="kp-hilfe kp-bedienhinweis kp-nur-schmal">{GLIEDERUNG_BEDIENZEILE_SCHMAL}</p>
      {p.meldung ? <div className="kp-g-meldung" data-meldung="">{p.meldung}</div> : null}
    </div>
  );
}

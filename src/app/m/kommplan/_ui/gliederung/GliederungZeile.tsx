"use client";

import { memo, type ClipboardEvent, type CSSProperties, type FocusEvent, type KeyboardEvent, type RefObject } from "react";
import { Button, Dropdown, Input, type MenuProps, type RefSelectProps } from "antd";
import type { GliederungsZeile } from "../../_lib/plan/gliederung";
import { LAENGE, type PlanInhalt } from "../../_lib/plan/schema";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import type { Aendere } from "../editor/aendere";
import { EinheitenListe } from "../editor/EinheitenListe";
import type { Symbolsatz } from "../zeichnung/Symbole";
import { VerbindungFeld } from "./VerbindungFeld";
import { ZeichenKnopf } from "./ZeichenKnopf";

export type ZeilenAktion = "neu" | "unterstelle" | "links" | "rechts" | "einruecken" | "ausruecken" | "hoch" | "runter" | "uebernehmen" | "details" | "loeschen";
export type OffenesFeld = "zeichen" | "verbindung";
const titelVon = (s: { titel: string } | null) => (s === null ? "" : s.titel.trim() || "(ohne Titel)");
const KEIN_FOKUS = { ziel: "titel" as const, stelle: null, n: 0 };

/**
 * Was eine Zeile zur EREIGNISZEIT von der Gliederung braucht. Die Gliederung setzt das Ref nach jedem
 * Rendern (`useLayoutEffect`), die Zeile liest es nur in Rückrufen — so sind alle Rückrufe einer Zeile
 * stabil, und `memo` trägt (Umsetzungsplan Phase 3, Entscheidung 2).
 */
export interface ZeilenBefehle {
  aendere: Aendere;
  aendereVerbindung(id: string): Aendere;
  titel(id: string, wert: string): void;
  taste(e: KeyboardEvent<HTMLInputElement>, z: GliederungsZeile): void;
  einfuegen(e: ClipboardEvent<HTMLInputElement>, id: string): void;
  verlassen(e: FocusEvent<HTMLInputElement>, id: string): void;
  fokus(id: string): void;
  menue(id: string, offen: boolean): void;
  aktion(z: GliederungsZeile, a: ZeilenAktion): void;
  offen(id: string, was: OffenesFeld, o: boolean): void;
  fertig(id: string, was: OffenesFeld): void;
  einheiten(id: string): void;
  ladeSymbole(schluessel: string[]): void;
}
/** Bedienelemente je Zeile, damit die Gliederung den Fokus nach einem Schritt setzen kann. Stabil über die Lebenszeit. */
export interface ZeilenRegister {
  felder: Map<string, HTMLInputElement>; aktionen: Map<string, HTMLButtonElement>;
  zeichen: Map<string, HTMLButtonElement>; selects: Map<string, RefSelectProps>;
}

/**
 * Registriert ein Element je Zeile. antds `Input`/`Button` reichen den Ref über `composeRef` weiter: der
 * ruft den Rückruf beim Abbau mit `null` und übergeht dessen Aufräumfunktion — deshalb beides.
 */
export function merke<T>(karte: Map<string, T>, id: string, el: T | null): () => void {
  if (el) karte.set(id, el); else karte.delete(id);
  return () => { if (karte.get(id) === el) karte.delete(id); };
}

export interface ZeilenProps {
  zeile: GliederungsZeile; gewaehlt: boolean; aktiv: boolean;
  /** Einträge nur für die Zeile mit offenem Menü (sonst dieselbe leere Liste). */
  menue: MenuProps["items"]; menueOffen: boolean; offenBei: OffenesFeld | null; einheitenOffen: boolean;
  /** Nur gelesen, solange ein Feld der Zeile offen ist — dann rendert sie ohnehin bei jeder Änderung neu. */
  inhalt: PlanInhalt;
  verbindungen: PlanInhalt["verbindungen"]; symbole: Symbolsatz; zeichenIndex: readonly ZeichenIndexEintrag[];
  /** Die Zeichen des Plans als Zeichenkette (sortiert, je Zeile eins): ein Array wäre je Rendern neu. */
  planZeichen: string;
  befehle: RefObject<ZeilenBefehle | null>; register: ZeilenRegister;
}

/**
 * Entscheidung 2: gleiche Stelle (unveränderte Stellen bleiben dasselbe Objekt, `gueltig`), gleiche Lage,
 * gleicher Ansichtszustand. Eine Zeile mit offenem Feld, Menü oder offenen Einheiten zeigt Planweites
 * (Optionen, Einheitenliste) und rendert immer neu. Vom Symbolvorrat zählt nur das eigene Zeichen.
 */
function gleicheZeile(a: ZeilenProps, b: ZeilenProps): boolean {
  if (a.menueOffen || b.menueOffen || a.offenBei !== null || b.offenBei !== null || a.einheitenOffen || b.einheitenOffen) return false;
  const zeichen = b.zeile.stelle.zeichen;
  return a.zeile.stelle === b.zeile.stelle && a.zeile.ebene === b.zeile.ebene && a.zeile.seite === b.zeile.seite
    && titelVon(a.zeile.eltern) === titelVon(b.zeile.eltern)
    && a.gewaehlt === b.gewaehlt && a.aktiv === b.aktiv
    && a.verbindungen === b.verbindungen && a.planZeichen === b.planZeichen
    && (zeichen === null || Boolean(a.symbole[zeichen]) === Boolean(b.symbole[zeichen]))
    && a.befehle === b.befehle && a.register === b.register;
}

/**
 * EINE ZEILE DER GLIEDERUNG (Umsetzungsplan Phase 3, Entscheidungen 4, 10, 11, 13–15): Zeichen kompakt,
 * Titel, Verbindung, Einheiten als Zähler, Aktionen-Menü. Alles Verhalten kommt über `befehle`; `aktiv`
 * steuert den Roving Tabindex. Verbindung und Einheiten (`.kp-g-neben`) blendet CSS am Telefon außer an
 * der gewählten Zeile aus.
 */
function ZeileInnen(p: ZeilenProps) {
  const { zeile, befehle, register } = p;
  const s = zeile.stelle;
  const id = s.id;
  const lage = zeile.seite ? `Seitenstelle ${zeile.seite} von ${titelVon(zeile.eltern)}` : zeile.eltern ? `unter ${titelVon(zeile.eltern)}` : "oberste Ebene";
  const tab = p.aktiv ? 0 : -1;
  const n = s.einheiten.length;
  const aendere: Aendere = (op, schluessel) => befehle.current!.aendere(op, schluessel);
  return (
    <li data-zeile={id} className="kp-g-zeile" aria-current={p.gewaehlt ? "true" : undefined} style={{ "--ebene": zeile.ebene } as CSSProperties}>
      <div className="kp-g-haupt">
        {zeile.seite ? <span className="kp-chip" data-seite={zeile.seite}>{`Seitenstelle ${zeile.seite}`}</span> : null}
        <ZeichenKnopf stelle={s} index={p.zeichenIndex} symbole={p.symbole} ladeSymbole={(k) => befehle.current!.ladeSymbole(k)}
          planZeichen={p.planZeichen === "" ? [] : p.planZeichen.split("\n")} aendere={aendere} tabIndex={tab}
          offen={p.offenBei === "zeichen"} onOffen={(o) => befehle.current!.offen(id, "zeichen", o)} onFertig={() => befehle.current!.fertig(id, "zeichen")}
          knopfRef={(el) => merke(register.zeichen, id, el)} />
        <Input ref={(r) => merke(register.felder, id, r?.input ?? null)} name="titel" className="kp-g-titel" tabIndex={tab} value={s.titel} maxLength={LAENGE.titel}
          placeholder="(ohne Titel)" enterKeyHint="enter" aria-label={`Titel, Ebene ${zeile.ebene + 1}, ${lage}`}
          onFocus={() => befehle.current!.fokus(id)} onBlur={(e) => befehle.current!.verlassen(e, id)}
          onChange={(e) => befehle.current!.titel(id, e.target.value)} onKeyDown={(e) => befehle.current!.taste(e, zeile)}
          onPaste={(e) => befehle.current!.einfuegen(e, id)} />
        <div className="kp-g-neben">
          <VerbindungFeld inhalt={p.inhalt} stelle={s} aendere={(op, k) => befehle.current!.aendereVerbindung(id)(op, k)} aktiv={p.aktiv}
            offen={p.offenBei === "verbindung"} onOffen={(o) => befehle.current!.offen(id, "verbindung", o)} onFertig={() => befehle.current!.fertig(id, "verbindung")}
            feldRef={(r) => merke(register.selects, id, r)} />
          <Button tabIndex={tab} aria-expanded={p.einheitenOffen} aria-controls={`kp-g-einheiten-${id}`} onClick={() => befehle.current!.einheiten(id)}>
            {n === 1 ? "1 Einheit" : `${n} Einheiten`}
          </Button>
        </div>
        <Dropdown trigger={["click"]} onOpenChange={(o) => befehle.current!.menue(id, o)}
          menu={{ items: p.menue, onClick: ({ key }) => befehle.current!.aktion(zeile, key as ZeilenAktion) }}
          popupRender={(m) => <div data-zeile-portal={id}>{m}</div>}>
          <Button ref={(el) => merke(register.aktionen, id, el)} tabIndex={tab} aria-label={`Aktionen für ${titelVon(s)}`}>⋯</Button>
        </Dropdown>
      </div>
      {p.einheitenOffen ? (
        <div id={`kp-g-einheiten-${id}`} className="kp-g-einheiten">
          <EinheitenListe key={`einheiten:${id}`} inhalt={p.inhalt} stelle={s} aendere={aendere} fokus={KEIN_FOKUS} />
        </div>
      ) : null}
    </li>
  );
}

export const GliederungZeile = memo(ZeileInnen, gleicheZeile);

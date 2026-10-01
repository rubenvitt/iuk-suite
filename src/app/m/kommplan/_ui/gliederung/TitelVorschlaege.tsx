"use client";

import { Button } from "antd";
import { vergleichsform, type BibStelle } from "../../_lib/bibliothek/typen";
import { stelleVorschlaege } from "../../_lib/plan/bibliothek";
import type { Stelle } from "../../_lib/plan/schema";
import { useBibliothek } from "../editor/bibliothekKontext";

/**
 * TITELVORSCHLÄGE (Umsetzungsplan Phase 4, Entscheidung 14) — ohne den Tippfluss zu stören: kein Popup, keine
 * Taste außer Alt+Enter (beim Aufrufer). Die Knöpfe verhindern `mousedown`, damit der Fokus im Titel bleibt —
 * sonst verwürfe das Verlassen eine eben angelegte, unberührte Zeile (Phase 3, Entscheidung 8). Einzeilig,
 * waagerecht scrollbar, und der Streifen steht IMMER (sobald die Bibliothek Stellen hat), mit Mindesthöhe einer
 * Knopfzeile: erschiene er erst ab dem zweiten Zeichen, sprängen die Zeilen darunter beim Tippen (Review Phase 4).
 * Die Beschriftung ist kurz und steht auch am Telefon — ohne sie läse sich ein Vorschlag wie das eigene Feld; der
 * Tastenhinweis steht HINTER den Vorschlägen und nur ab 768 px. `tabStopps`: im Flyin erreicht Tab die Vorschläge
 * (Weg ohne Zeiger zum 2. und 3.); in der Gliederung gehört Tab dem Einrücken.
 * Liest als EINZIGE Komponente der Zeile den Kontext; die übrigen Zeilen bleiben `memo`.
 */
export function TitelVorschlaege({ stelle, onWahl, tabStopps = false }: { stelle: Stelle; onWahl: (b: BibStelle) => void; tabStopps?: boolean }) {
  const { aktiv, bib } = useBibliothek();
  if (!aktiv || bib.stellen.length === 0) return null;
  const vorschlaege = stelleVorschlaege(bib.stellen, stelle);
  const leer = vergleichsform(stelle.titel).length < 2 ? "Titel tippen" : "kein passender Eintrag";
  return (
    <div className="kp-g-vorschlaege" role="group" aria-label="Vorschläge aus der Bibliothek">
      <span className="kp-hilfe">{vorschlaege.length > 0 ? "Aus Bibliothek:" : `Aus Bibliothek: ${leer}`}</span>
      {vorschlaege.map((b, i) => (
        <Button key={b.id} data-vorschlag={b.id} tabIndex={tabStopps ? undefined : -1} aria-keyshortcuts={i === 0 ? "Alt+Enter" : undefined}
          onMouseDown={(e) => e.preventDefault()} onClick={() => onWahl(b)}>
          {b.leiter ? `${b.titel} · ${b.leiter}` : b.titel}
        </Button>
      ))}
      {vorschlaege.length > 0 ? <span className="kp-hilfe kp-vorschlag-hinweis">Alt+Enter nimmt den ersten</span> : null}
    </div>
  );
}

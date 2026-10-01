"use client";

import { Button } from "antd";
import type { BibStelle } from "../../_lib/bibliothek/typen";
import { stelleVorschlaege } from "../../_lib/plan/bibliothek";
import type { Stelle } from "../../_lib/plan/schema";
import { useBibliothek } from "../editor/bibliothekKontext";

/**
 * TITELVORSCHLÄGE (Umsetzungsplan Phase 4, Entscheidung 14) — ohne den Tippfluss zu stören: kein Popup, keine
 * Taste außer Alt+Enter (beim Aufrufer). Die Knöpfe verhindern `mousedown`, damit der Fokus im Titel bleibt —
 * sonst verwürfe das Verlassen eine eben angelegte, unberührte Zeile (Phase 3, Entscheidung 8). Einzeilig,
 * waagerecht scrollbar, feste Höhe: die Zeilen darunter springen beim Tippen nicht. `tabStopps`: im Flyin
 * erreicht Tab die Vorschläge (Weg ohne Zeiger zum 2. und 3.); in der Gliederung gehört Tab dem Einrücken.
 * Liest als EINZIGE Komponente der Zeile den Kontext; die übrigen Zeilen bleiben `memo`.
 */
export function TitelVorschlaege({ stelle, onWahl, tabStopps = false }: { stelle: Stelle; onWahl: (b: BibStelle) => void; tabStopps?: boolean }) {
  const { aktiv, bib } = useBibliothek();
  const vorschlaege = aktiv ? stelleVorschlaege(bib.stellen, stelle) : [];
  if (vorschlaege.length === 0) return null;
  return (
    <div className="kp-g-vorschlaege" role="group" aria-label="Vorschläge aus der Bibliothek">
      <span className="kp-hilfe kp-vorschlag-hinweis">Aus Bibliothek (Alt+Enter nimmt den ersten):</span>
      {vorschlaege.map((b) => (
        <Button key={b.id} data-vorschlag={b.id} tabIndex={tabStopps ? undefined : -1} onMouseDown={(e) => e.preventDefault()} onClick={() => onWahl(b)}>
          {b.leiter ? `${b.titel} · ${b.leiter}` : b.titel}
        </Button>
      ))}
    </div>
  );
}

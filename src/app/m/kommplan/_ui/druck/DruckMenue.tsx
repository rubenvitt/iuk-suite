"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Dropdown, Space, type MenuProps } from "antd";

export type DruckFormatKurz = "a4" | "a3";
export interface DruckWahl { format: DruckFormatKurz; svg: boolean }
export const DRUCKFORMATE: readonly { key: DruckFormatKurz; label: string }[] = [
  { key: "a4", label: "A4 quer" },
  { key: "a3", label: "A3 quer" },
];
/** Das Ziel einer Wahl unter `basis` (`/p/<id>` oder `/t/<token>`); `svg` öffnet die Druckseite ohne Druckdialog (Task 12). */
export const druckZiel = (basis: string, w: DruckWahl): string => `${basis}/druck/${w.format}${w.svg ? "?export=svg" : ""}`;

/** Pfeil als Inline-SVG (Falle 7: keine @ant-design/icons) — Schmuck; der Knopf heißt über aria-label. */
function Pfeil() {
  return (
    <svg aria-hidden="true" focusable="false" width="10" height="10" viewBox="0 0 10 10" className="kp-druckmenue-pfeil">
      <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * „DRUCKEN" ALS GETEILTER KNOPF (Umsetzungsplan Phase 5, Entscheidung 12; ersetzt Phase-2-Entscheidung 20): der
 * Hauptknopf druckt A4 quer mit einem Klick, der Pfeil öffnet die Formate. `Space.Compact` statt des in antd 6
 * veralteten `Dropdown.Button`. `autoFocus` am Dropdown: per Enter am Pfeil steht der Fokus danach im Menü, die
 * Pfeiltasten wählen. Mit `basis` (Pfad ohne `/druck/…`) öffnet die Wahl die Druckroute in einem neuen Tab —
 * Betrachter und Token-Ansicht. KEINE Anker im Menü: rc-menu aktiviert einen Punkt per Enter nur über `onClick`,
 * ein `<a>` im Label bliebe für die Tastatur tot. Mit `onWahl` entscheidet der Aufrufer: der Editor speichert erst
 * und öffnet das Fenster synchron im Klick (Phase-2-Entscheidung 12). Intern (`mitSvg`) zusätzlich die SVG-Dateien ohne Druckdialog (Entscheidung 15).
 */
export function DruckMenue({ basis, onWahl, mitSvg = false }: { basis?: string; onWahl?: (w: DruckWahl) => void; mitSvg?: boolean }) {
  const items: MenuProps["items"] = [
    ...DRUCKFORMATE.map((f) => ({ key: f.key, label: f.label })),
    ...(mitSvg ? [{ type: "group" as const, label: "SVG-Dateien", children: DRUCKFORMATE.map((f) => ({ key: `${f.key}-svg`, label: `SVG – ${f.label}` })) }] : []),
  ];
  const waehle = (w: DruckWahl) => {
    if (basis) window.open(druckZiel(basis, w), "_blank", "noopener");
    else onWahl?.(w);
  };
  const [offen, setOffen] = useState(false);
  const pfeil = useRef<HTMLButtonElement>(null);
  // Escape gibt den Fokus an den Pfeil zurück (Review Phase 5): rc-dropdown will das selbst, aber schließt das Popup
  // vorher anderswo, fällt sein Fensterhorcher mit dem Effekt weg — der Fokus lag dann auf body, und der nächste Tab
  // begann oben auf der Seite. Eigener Horcher in der Capture-Phase, Fokus im nächsten Frame, NACH dem Schließen.
  // Nur bei Escape: ein Klick daneben lässt den Fokus, wo er hinwollte.
  useEffect(() => {
    if (!offen) return;
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOffen(false);
      requestAnimationFrame(() => pfeil.current?.focus());
    };
    window.addEventListener("keydown", beiTaste, true);
    return () => window.removeEventListener("keydown", beiTaste, true);
  }, [offen]);
  return (
    <Space.Compact className="kp-druckmenue">
      <Button onClick={() => waehle({ format: "a4", svg: false })}>Drucken</Button>
      <Dropdown trigger={["click"]} autoFocus open={offen} onOpenChange={setOffen}
        menu={{ items, onClick: ({ key }) => { setOffen(false); const [format, art] = key.split("-"); waehle({ format: format as DruckFormatKurz, svg: art === "svg" }); } }}>
        <Button ref={pfeil} aria-label="Weitere Druckformate" aria-haspopup="menu"><Pfeil /></Button>
      </Dropdown>
    </Space.Compact>
  );
}

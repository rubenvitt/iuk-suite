"use client";

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
 * und öffnet das Fenster synchron im Klick (Phase-2-Entscheidung 12).
 */
export function DruckMenue({ basis, onWahl }: { basis?: string; onWahl?: (w: DruckWahl) => void }) {
  const items: MenuProps["items"] = DRUCKFORMATE.map((f) => ({ key: f.key, label: f.label }));
  const waehle = (w: DruckWahl) => {
    if (basis) window.open(druckZiel(basis, w), "_blank", "noopener");
    else onWahl?.(w);
  };
  return (
    <Space.Compact className="kp-druckmenue">
      <Button onClick={() => waehle({ format: "a4", svg: false })}>Drucken</Button>
      <Dropdown trigger={["click"]} autoFocus menu={{ items, onClick: ({ key }) => waehle({ format: key as DruckFormatKurz, svg: false }) }}>
        <Button aria-label="Weitere Druckformate" aria-haspopup="menu"><Pfeil /></Button>
      </Dropdown>
    </Space.Compact>
  );
}

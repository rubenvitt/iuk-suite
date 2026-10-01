"use client";

import { useEffect } from "react";
import { Button } from "antd";

/**
 * Druckanstoß wie beim Aushang (`feedback/(print)/aushang/[groupId]/Drucken.tsx`): beim Öffnen
 * drucken, dazu ein Knopf, falls der Dialog abgebrochen wurde. Gewartet wird auf die Schrift:
 * die Karten sind mit Arimo-Metriken gesetzt, ein Ersatzschnitt liefe aus ihnen heraus. `automatisch={false}` auf dem SVG-Weg (`?export=svg`, Phase 5, Entscheidung 15).
 */
export function Drucken({ automatisch = true }: { automatisch?: boolean }) {
  useEffect(() => {
    if (!automatisch) return;
    let abgebrochen = false;
    void document.fonts.ready.then(() => { if (!abgebrochen) window.print(); });
    return () => { abgebrochen = true; };
  }, [automatisch]);
  return (
    <div className="noprint kp-druck-knopf">
      <Button onClick={() => window.print()}>Drucken</Button>
    </div>
  );
}

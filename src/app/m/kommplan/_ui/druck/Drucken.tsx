"use client";

import { useEffect } from "react";
import { Button } from "antd";

/**
 * Druckanstoß wie beim Aushang (`feedback/(print)/aushang/[groupId]/Drucken.tsx`): beim Öffnen
 * drucken, dazu ein Knopf, falls der Dialog abgebrochen wurde. Gewartet wird auf die Schrift:
 * die Karten sind mit Arimo-Metriken gesetzt, ein Ersatzschnitt liefe aus ihnen heraus.
 */
export function Drucken() {
  useEffect(() => {
    let abgebrochen = false;
    void document.fonts.ready.then(() => { if (!abgebrochen) window.print(); });
    return () => { abgebrochen = true; };
  }, []);
  return (
    <div className="noprint kp-druck-knopf">
      <Button onClick={() => window.print()}>Drucken</Button>
    </div>
  );
}

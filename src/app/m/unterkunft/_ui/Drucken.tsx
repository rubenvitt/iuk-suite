"use client";

import { useEffect } from "react";
import { Button } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import d from "./druck.module.css";

/**
 * Öffnet den Druckdialog, sobald die Schrift geladen ist, und behält einen Knopf, falls er abgebrochen
 * wurde (Vorbild `schichtplan/_ui/Druckansicht.tsx`). Das Blatt selbst rendert der Server.
 */
export function Drucken({ sofort }: { sofort: boolean }) {
  useEffect(() => {
    if (!sofort) return;
    let abgebrochen = false;
    void document.fonts.ready.then(() => { if (!abgebrochen) window.print(); });
    return () => { abgebrochen = true; };
  }, [sofort]);
  return (
    <div className={d.knopf}>
      <Button type="primary" icon={<Icons8Ikone name="print" groesse={16} />} onClick={() => window.print()}>Drucken</Button>
    </div>
  );
}

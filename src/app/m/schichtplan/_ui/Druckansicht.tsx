"use client";

import { useEffect } from "react";
import { Button } from "antd";
import type { PlanHelfer, PlanungDTO } from "../_lib/typen";
import b from "./blatt.module.css";
import { Blaetter, type Sicht } from "./Blaetter";

/**
 * Die Druckansicht ohne Hülle (Vorbild `kommplan/_ui/druck/Drucken.tsx`): öffnet den Druckdialog,
 * sobald die Schrift geladen ist, und behält einen Knopf, falls er abgebrochen wurde.
 */
export function Druckansicht({ planung, helfer, sicht, auswahl, jetzt }: {
  planung: PlanungDTO; helfer: PlanHelfer[]; sicht: Sicht; auswahl: string | null; jetzt: number;
}) {
  useEffect(() => {
    let abgebrochen = false;
    void document.fonts.ready.then(() => { if (!abgebrochen) window.print(); });
    return () => { abgebrochen = true; };
  }, []);
  return (
    <main className={b.druckSeite}>
      <div className={b.knopf}><Button type="primary" onClick={() => window.print()}>Drucken</Button></div>
      <Blaetter p={planung} helfer={helfer} sicht={sicht} auswahl={auswahl} jetzt={jetzt} />
    </main>
  );
}

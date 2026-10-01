"use client";

import { useState } from "react";
import { Button } from "antd";
import { eigenstaendigesSvg } from "./svgExport";

/**
 * „SVG HERUNTERLADEN" JE BLATT (Entscheidung 15). Die Schrift (≈ 110 KB Base64) kommt erst beim Klick per
 * dynamischem `import()` — `grenze.test.ts` hält fest, dass sie in keinem anderen Bündel landet. Der Name kommt
 * fertig vom Server (`svgDateiname`).
 */
export function SvgHerunterladen({ nummer, von, dateiname }: { nummer: number; von: number; dateiname: string }) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  async function lade() {
    setLaeuft(true);
    setFehler(null);
    try {
      const blatt = document.querySelector<SVGSVGElement>(`svg.kp-blatt[data-blatt="${nummer}"]`);
      const vorrat = document.querySelector("svg.kp-symbole");
      if (!blatt || !vorrat) throw new Error("Blatt oder Vorrat fehlt");
      const { default: schrift } = await import("../../_lib/zeichen/schrift.generiert.json");
      const text = eigenstaendigesSvg(blatt, [vorrat], schrift.arimoVariable);
      const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = dateiname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setFehler("Die SVG-Datei ließ sich nicht erstellen. Lade die Seite neu und versuche es noch einmal.");
    } finally {
      setLaeuft(false);
    }
  }
  return (
    <>
      <Button onClick={() => void lade()} loading={laeuft}>{`SVG herunterladen (Blatt ${nummer} von ${von})`}</Button>
      {fehler ? <p role="status">{fehler}</p> : null}
    </>
  );
}

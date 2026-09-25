"use client";

import s from "./ansichten.module.css";

/**
 * Band für Test-Blöcke (`umgebung: "test"`). Absichtlich ohne Schließknopf: Wer Testdaten vor
 * sich hat, soll das nicht wegklicken können. `role="status"` meldet es dem Screenreader einmal.
 */
export function Testband({ text }: { text: string }) {
  return (
    <div role="status" className={`${s.wurzel} ${s.testband}`}>
      <span>{text}</span>
    </div>
  );
}

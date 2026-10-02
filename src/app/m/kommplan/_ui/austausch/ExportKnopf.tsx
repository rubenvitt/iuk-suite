"use client";

import { useState } from "react";
import { Button } from "antd";
import { exportiere } from "./herunterladen";

/**
 * „Exportieren" an der Planansicht (Betrachter, Editor): legt die `.kommplan.json` des gespeicherten Stands ab
 * (`_lib/austausch.ts`). `tu` ersetzt den Export (der Editor speichert zuerst — exportiert wird immer, was der
 * Server hat); ohne `tu` exportiert der Knopf `planId` — so geht er auch aus einer Server Component.
 */
export function ExportKnopf({ planId, tu }: { planId?: string; tu?: () => Promise<string | null> }) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  async function los() {
    setLaeuft(true); setFehler(null);
    const f = tu ? await tu() : planId ? await exportiere(planId) : null;
    setLaeuft(false); setFehler(f);
  }
  return (
    <>
      <Button onClick={() => void los()} loading={laeuft}>Exportieren</Button>
      {fehler ? <span className="kp-feldfehler" role="alert">{fehler}</span> : null}
    </>
  );
}

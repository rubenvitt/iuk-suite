"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "antd";
import { stelleWiederHerAction } from "../../../_actions/verwaltung";
import { NETZFEHLER, type EinfachErgebnis } from "../../../_lib/ergebnis";


/**
 * „Wiederherstellen" am archivierten Plan (Entscheidung 10) — danach öffnet die Seite neu im Editor. Eine Laufsperre
 * (synchron per Ref, sichtbar per `loading`): ein zweiter Klick vor der Antwort träfe keinen archivierten Plan mehr
 * und überschriebe den Erfolg mit „Diesen Plan gibt es nicht mehr." (Review Phase 4). Ein Netzfehler wird gemeldet.
 */
export function Wiederherstellen({ id }: { id: string }) {
  const router = useRouter();
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const sperre = useRef(false);
  async function stelleHer() {
    if (sperre.current) return;
    sperre.current = true;
    setLaeuft(true);
    setFehler(null);
    const r = await stelleWiederHerAction(id).catch((): EinfachErgebnis => ({ ok: false, fehler: NETZFEHLER }));
    if (r.ok) { router.refresh(); return; } // bleibt gesperrt, bis die Seite als Editor neu steht
    sperre.current = false;
    setLaeuft(false);
    setFehler(r.fehler);
  }
  return (
    <>
      <Button onClick={() => void stelleHer()} loading={laeuft}>Wiederherstellen</Button>
      {fehler ? <p className="kp-feldfehler" role="status">{fehler}</p> : null}
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "antd";
import { stelleWiederHerAction } from "../../../_actions/verwaltung";

/** „Wiederherstellen" am archivierten Plan (Entscheidung 10) — danach öffnet die Seite neu im Editor. */
export function Wiederherstellen({ id }: { id: string }) {
  const router = useRouter();
  const [fehler, setFehler] = useState<string | null>(null);
  return (
    <>
      <Button onClick={() => void stelleWiederHerAction(id).then((r) => { if (r.ok) router.refresh(); else setFehler(r.fehler); })}>Wiederherstellen</Button>
      {fehler ? <p className="kp-feldfehler" role="status">{fehler}</p> : null}
    </>
  );
}

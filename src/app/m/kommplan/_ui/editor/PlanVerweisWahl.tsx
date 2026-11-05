"use client";

import { useId, useState } from "react";
import { Select } from "antd";
import { aendereStelle } from "../../_lib/plan/operationen";
import type { Stelle } from "../../_lib/plan/schema";
import { verweisAuf, type PlanZiel } from "../../_lib/plan/verweis";
import type { Aendere } from "./aendere";

/** „Verweis auf Plan" (IDA-355): ein anderer Plan, auf den die Karte zeigt; leeren entfernt den Verweis. */
export function PlanVerweisWahl({ stelle, ziele, aendere }: { stelle: Stelle; ziele: readonly PlanZiel[]; aendere: Aendere }) {
  const basis = useId();
  const [fehler, setFehler] = useState<string | null>(null);
  const jetzt = stelle.planVerweis;
  const optionen = ziele.map((z) => ({ value: z.id, label: [z.titel.trim() || "(ohne Titel)", z.zusatz].filter(Boolean).join(" · ") }));
  // Ein Ziel, das nicht mehr zur Wahl steht (archiviert, nicht mehr sichtbar), bleibt mit seinem gespeicherten Titel sichtbar.
  if (jetzt && !ziele.some((z) => z.id === jetzt.id)) optionen.unshift({ value: jetzt.id, label: jetzt.titel.trim() || "(ohne Titel)" });
  const setze = (id: string | undefined) => {
    const ziel = id === undefined ? null : ziele.find((z) => z.id === id);
    if (ziel === undefined) return; // das gespeicherte, nicht mehr wählbare Ziel bleibt
    setFehler(aendere((p) => aendereStelle(p, stelle.id, { planVerweis: ziel === null ? undefined : verweisAuf(ziel) })));
  };
  return (
    <fieldset className="kp-abschnitt" data-planverweis-wahl="">
      <legend>Verweis auf Plan</legend>
      <label className="kp-feldname" htmlFor={`${basis}-plan`}>Plan</label>
      <Select id={`${basis}-plan`} showSearch allowClear optionFilterProp="label" value={jetzt?.id}
        placeholder="Kein Verweis" options={optionen} onChange={(v: string | undefined) => setze(v)} />
      {fehler ? <p className="kp-feldfehler" role="status">{fehler}</p> : null}
    </fieldset>
  );
}

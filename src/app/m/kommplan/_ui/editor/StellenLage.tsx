"use client";

import { useId, useState } from "react";
import { Radio, Select } from "antd";
import { baueBaum, nachkommen } from "../../_lib/plan/baum";
import { haengeUm, moeglicheEltern } from "../../_lib/plan/operationen";
import type { Lage, PlanInhalt, Stelle } from "../../_lib/plan/schema";
import type { Aendere } from "./aendere";

const OBERSTE = "~oberste"; // „~" ist in IDs nicht erlaubt, kollidiert also nie

/** „Untersteht / Lage" (Spec §6.4): darüber läuft das Umhängen; Ziele, die einen Zyklus bildeten, stehen gar nicht erst zur Wahl. */
export function StellenLage({ inhalt, stelle, aendere }: { inhalt: PlanInhalt; stelle: Stelle; aendere: Aendere }) {
  const basis = useId();
  const [fehler, setFehler] = useState<string | null>(null);
  const hatNachkommen = nachkommen(baueBaum(inhalt), stelle.id).length > 0;
  const grund = stelle.eltern === null ? "Eine Stelle der obersten Ebene steht immer darunter."
    : hatNachkommen ? "Eine Stelle mit Unter- oder Seitenstellen kann nicht seitlich stehen." : null;
  const setze = (eltern: string | null, lage: Lage) => setFehler(aendere((p) => haengeUm(p, stelle.id, { eltern, lage })));
  return (
    <fieldset className="kp-abschnitt">
      <legend>Untersteht</legend>
      <label className="kp-feldname" htmlFor={`${basis}-eltern`}>Elternstelle</label>
      <Select id={`${basis}-eltern`} showSearch optionFilterProp="label" value={stelle.eltern ?? OBERSTE}
        onChange={(v: string) => setze(v === OBERSTE ? null : v, v === OBERSTE ? "unter" : stelle.lage)}
        options={[{ value: OBERSTE, label: "— oberste Ebene —" },
          ...moeglicheEltern(inhalt, stelle.id).map((x) => ({ value: x.id, label: x.titel.trim() || "(ohne Titel)" }))]} />
      <span id={`${basis}-lage`} className="kp-hilfe">Lage zur Elternstelle</span>
      <Radio.Group aria-labelledby={`${basis}-lage`} optionType="button" value={stelle.lage}
        onChange={(e) => setze(stelle.eltern, e.target.value as Lage)}
        options={[
          { value: "unter", label: "darunter" },
          { value: "links", label: "links daneben", disabled: grund !== null },
          { value: "rechts", label: "rechts daneben", disabled: grund !== null },
        ]} />
      {grund ? <p className="kp-hilfe">{grund}</p> : null}
      {fehler ? <p className="kp-feldfehler" role="status">{fehler}</p> : null}
    </fieldset>
  );
}

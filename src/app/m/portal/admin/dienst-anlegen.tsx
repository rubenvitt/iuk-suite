"use client";

import { useRef, useState } from "react";
import { Button } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import type { GruppenOption } from "@/app/m/portal/_lib/gruppen";
import { DienstFlyin } from "@/app/m/portal/admin/dienst-flyin";

/**
 * „Dienst anlegen" im Seitenkopf (IDA-391). Das Formular stand bis dahin unter der Tabelle — bei
 * zwanzig Diensten außer Sicht, und es fragte nach einer Kennung, die niemand kennen muss.
 */
export function DienstAnlegen({
  gruppen,
  kategorien,
  gruppenNichtAbrufbar = false,
}: {
  gruppen: GruppenOption[];
  kategorien: string[];
  gruppenNichtAbrufbar?: boolean;
}) {
  const [offen, setOffen] = useState(false);
  const knopf = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={knopf} type="primary" icon={<Icons8Ikone name="plus" groesse={18} />} onClick={() => setOffen(true)}>
        Dienst anlegen
      </Button>
      <DienstFlyin
        offen={offen}
        gruppen={gruppen}
        kategorien={kategorien}
        gruppenNichtAbrufbar={gruppenNichtAbrufbar}
        ausloeser={knopf}
        onSchliessen={() => setOffen(false)}
      />
    </>
  );
}

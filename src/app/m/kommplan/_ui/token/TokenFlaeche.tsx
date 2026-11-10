"use client";

import { useId, useState } from "react";
import { Segmented } from "antd";
import type { PlanInhalt } from "../../_lib/plan/schema";
import { Betrachter } from "../betrachter/Betrachter";
import { Gliederungsliste } from "../betrachter/Gliederungsliste";
import type { Symbolsatz } from "../zeichnung/Symbole";

type Ansicht = "liste" | "diagramm";

/**
 * DIE FLÄCHE DER TOKEN-ANSICHT MIT ZWEI ANSICHTEN (IDA-390): Liste und Diagramm, beide montiert, wie im Editor
 * (`Editor.tsx`, `data-editoransicht`). Ohne Wahl entscheidet CSS am Suite-Breakpoint (`token.css`): am Telefon die
 * Liste, ab 768 px das Diagramm — nie JavaScript im Rendern, sonst zeigte das erste Bild die falsche. Der Umschalter
 * steht auf beiden Breiten: am Schreibtisch ist die Liste der schnellere Weg zu einer Nummer.
 *
 * Ohne Wahl stehen ZWEI Umschalter im DOM, je einer pro Breite, jeder mit dem dort sichtbaren Wert (wie
 * `Kopfleiste.tsx`); eigener `name` je Umschalter, sonst teilten sich zwei Radiogruppen ein „checked".
 */
export function TokenFlaeche({ inhalt, symbole, titel, schrift, schriftKlasse }: {
  inhalt: PlanInhalt; symbole: Symbolsatz; titel: string; schrift: string; schriftKlasse: string;
}) {
  const [ansicht, setAnsicht] = useState<Ansicht | null>(null);
  const basis = useId();
  const umschalter = (wert: Ansicht, klasse?: string) => (
    <Segmented<Ansicht> className={klasse} name={`${basis}-${klasse ?? "ansicht"}`} aria-label="Ansicht" value={wert} onChange={setAnsicht}
      options={[{ value: "liste", label: "Liste" }, { value: "diagramm", label: "Diagramm" }]} />
  );
  return (
    <div className="kp-token-ansicht" data-tokenansicht={ansicht ?? "auto"}>
      <div className="kp-token-umschalter">
        {ansicht === null ? <>{umschalter("diagramm", "kp-token-nur-breit")}{umschalter("liste", "kp-token-nur-schmal")}</> : umschalter(ansicht)}
      </div>
      <div className="kp-token-liste">
        <Gliederungsliste inhalt={inhalt} />
      </div>
      <div className={`kp-token-diagramm ${schriftKlasse}`}>
        <Betrachter inhalt={inhalt} symbole={symbole} titel={titel} schrift={schrift} />
      </div>
    </div>
  );
}

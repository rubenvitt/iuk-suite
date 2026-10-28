"use client";

import { Input, Radio } from "antd";
import { SPACE } from "@/core/theme/tokens";
import type { Sicht, Sichtzahlen } from "../../_lib/stammdaten/vorschausicht";

/**
 * Die Leiste über der Vorschau eines Abgleichs: Sicht (Änderungen, nicht übernommen, alle) mit
 * Anzahl und eine Suche. Die Regel dahinter steht in `_lib/stammdaten/vorschausicht.ts`.
 *
 * Die Anzahl steht im Knopf, nicht in einem Satz darüber: so liest man sie, wo man umschaltet,
 * und eine Sicht ohne Zeilen ist schon vor dem Klick als leer erkennbar.
 *
 * Knopfgruppe statt `Segmented`: die bricht nicht um und lief auf dem Telefon (390 px) über die
 * Schublade hinaus; die Knöpfe einer `Radio.Group` sind Inline-Elemente und brechen um.
 */
export function Vorschaufilter({
  sicht,
  zahlen,
  onSicht,
  suche,
  onSuche,
  platzhalter,
}: {
  sicht: Sicht;
  zahlen: Sichtzahlen;
  onSicht: (s: Sicht) => void;
  suche: string;
  onSuche: (s: string) => void;
  platzhalter: string;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE.sm, alignItems: "center" }}>
      <Radio.Group
        aria-label="Welche Zeilen die Vorschau zeigt"
        optionType="button"
        value={sicht}
        onChange={(e) => onSicht(e.target.value as Sicht)}
        options={[
          { value: "aenderungen", label: `Änderungen · ${zahlen.aenderungen}` },
          { value: "nicht", label: `Nicht übernommen · ${zahlen.nicht}` },
          { value: "alle", label: `Alle · ${zahlen.alle}` },
        ]}
      />
      <Input
        style={{ flex: "1 1 12rem", minWidth: 0 }}
        value={suche}
        onChange={(e) => onSuche(e.target.value)}
        placeholder={platzhalter}
        aria-label={platzhalter}
        allowClear
      />
    </div>
  );
}

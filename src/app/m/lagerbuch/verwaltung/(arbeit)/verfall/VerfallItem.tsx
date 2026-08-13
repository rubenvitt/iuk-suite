import type { ReactNode } from "react";
import { SPACE } from "@/core/theme/tokens";
import { ampelTon } from "../../../_lib/format";
import type { Ampel } from "../../../_lib/domain/verfall";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Plakette } from "../../../_ui/Plakette";
import s from "../../../_ui/verwaltung.module.css";

/** Eine Handlager-Zeile. RSC: sie bedient nichts, sie zeigt nur. */
export function VerfallItem({
  artikelName,
  chargenNr,
  verfall,
  ampel,
  text,
  rest,
  einheit,
  aktion,
}: {
  artikelName: string;
  chargenNr: string;
  verfall: string;
  ampel: Ampel;
  text: string;
  rest: number;
  einheit: string;
  aktion?: ReactNode;
}) {
  return (
    <li
      role="listitem"
      style={{
        display: "flex",
        alignItems: "center",
        gap: SPACE.md,
        padding: `${SPACE.md}px 0`,
        borderBlockEnd: "1px solid var(--lb-linie)",
      }}
    >
      <Plakette verfall={verfall} ampel={ampel} statusText={text} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...SCHRIFT.text, fontWeight: 600 }}>{artikelName}</div>
        <div
          style={{
            display: "flex",
            // 6 liegt nicht auf der SPACE-Skala; bleibt Literal.
            gap: 6,
            flexWrap: "wrap",
            marginBlockStart: SPACE.xs,
          }}
        >
          <span className={s.fach}>{chargenNr}</span>
          <Chip ton={ampelTon(ampel)}>{text}</Chip>
          <span style={SCHRIFT.neben}>Rest {rest} {einheit}</span>
        </div>
      </div>
      {aktion}
    </li>
  );
}

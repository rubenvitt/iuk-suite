import type { ReactNode } from "react";
import { SPACE } from "@/core/theme/tokens";
import { ampelTon } from "../../../_lib/format";
import type { Ampel } from "../../../_lib/domain/verfall";
import type { VerfallOrt } from "../../../_lib/lesepfade/verfall";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Plakette } from "../../../_ui/Plakette";
import s from "../../../_ui/verwaltung.module.css";

/**
 * Eine Handlager-Zeile. RSC: sie bedient nichts, sie zeigt nur.
 *
 * ⚠️ DER LIEGEPLATZ IST KEIN SCHMUCK, SONDERN DIE ERSTE HAELFTE DES TICKETS
 * (DRK-339). Wer eine abgelaufene Charge aus dem Regal nimmt, musste bis
 * hierher erst in der Artikelschublade nachsehen, in welchem Schrank sie
 * liegt — die Arbeitsliste selbst sagte es nicht.
 *
 * ⚠️ KEIN antd-`Tooltip` FUER DEN ZUGANGSHINWEIS, und das ist kein Vergessen:
 * diese Zeile ist eine Server Component, `Tooltip` waere eine Client-Insel
 * mitten darin. Der Hinweis steht als natives `title` am Chip (Ruling A15,
 * `Chip.tsx`) und das Zeichen `info` sagt, dass es einen gibt.
 */
export function VerfallItem({
  artikelName,
  chargenNr,
  verfall,
  ampel,
  text,
  rest,
  einheit,
  orte,
  aktion,
}: {
  artikelName: string;
  chargenNr: string;
  verfall: string;
  ampel: Ampel;
  text: string;
  rest: number;
  einheit: string;
  orte: VerfallOrt[];
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
          {/* ⚠️ DIE SUMME NUR, WENN SIE ETWAS HINZUFUEGT (DRK-339). Bei EINEM
              Liegeplatz steht dieselbe Zahl zweimal nebeneinander — der Chip
              daneben nennt sie bereits, und zwar mit dem Ort dazu. */}
          {orte.length > 1 ? (
            <span style={SCHRIFT.neben}>Rest {rest} {einheit}</span>
          ) : null}
          {orte.map((ort) => (
            <Chip
              key={ort.id}
              ton="grau"
              zeichen={ort.zugangshinweis ? "info" : undefined}
              title={ort.zugangshinweis ?? undefined}
            >
              {ort.name}: {ort.menge} {einheit}
            </Chip>
          ))}
        </div>
      </div>
      {aktion}
    </li>
  );
}

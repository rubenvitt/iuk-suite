import { SECHSECK } from "../../_lib/layout/masse";
import { LEGENDE } from "../../_lib/layout/papier";
import { sechseckForm } from "../../_lib/layout/sechseck";
import type { VerbindungsArt } from "../../_lib/plan/schema";
import { VERBINDUNG_PIKTOGRAMM } from "../../_lib/zeichen/grundlagen";
import { FARBE, STRICH } from "./farben";
import { sechseckPunkte } from "./Sechseck";
import { symbolId } from "./Symbole";

export const LEGENDEN_SYMBOL = { breite: LEGENDE.symbolBreite, hoehe: 3.5 } as const;

/** Das kleine Sechseck einer Legendenzeile (Form und Piktogramm der Art) — auf dem Blatt und im Betrachter dasselbe. */
export function LegendenSymbol({ art }: { art: VerbindungsArt }) {
  const form = sechseckForm(art);
  return (
    <>
      <polygon points={sechseckPunkte(form, LEGENDEN_SYMBOL.breite, LEGENDEN_SYMBOL.hoehe)} fill={FARBE.papier} stroke={FARBE.tinte}
        strokeWidth={STRICH.duenn} strokeDasharray={form === "mobil" ? "1 0.6" : undefined} />
      <use href={`#${symbolId(VERBINDUNG_PIKTOGRAMM[art])}`} x={SECHSECK.spitze / 2 + 0.5} y={0.5} width={LEGENDEN_SYMBOL.breite - SECHSECK.spitze - 1} height={2.5} />
    </>
  );
}

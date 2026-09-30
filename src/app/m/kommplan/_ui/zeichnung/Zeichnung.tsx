import type { ReactNode } from "react";
import type { KarteL, Zeichnungsdaten } from "../../_lib/layout/typen";
import { FARBE, STRICH } from "./farben";
import { Abzeichen, Einheit, Karte } from "./Karte";
import { Sechseck } from "./Sechseck";
import { SymbolDefs, type Symbolsatz } from "./Symbole";

export function ZeichnungInhalt({ daten, zusatz }: { daten: Zeichnungsdaten; zusatz?: (k: KarteL) => ReactNode }) {
  return (
    <g>
      <g fill="none" stroke={FARBE.tinte} strokeLinecap="square">
        {daten.linien.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} strokeWidth={l.duenn ? STRICH.duenn : STRICH.linie} data-netz={l.netz} />
        ))}
      </g>
      {daten.sechsecke.map((s, i) => <Sechseck key={i} s={s} />)}
      {daten.karten.map((k) => <Karte key={k.id} k={k} zusatz={zusatz} />)}
      {daten.einheiten.map((e) => <Einheit key={e.id} e={e} />)}
      {daten.abzeichen.map((a) => <Abzeichen key={a.stelleId} a={a} />)}
    </g>
  );
}

export function Zeichnung({
  daten, symbole, titel, schrift, kopfStil, zusatz, mitDefs = true,
}: {
  daten: Zeichnungsdaten; symbole: Symbolsatz; titel: string; schrift?: string; kopfStil?: string;
  zusatz?: (k: KarteL) => ReactNode; mitDefs?: boolean;
}) {
  const b = Math.max(daten.breite, 1), h = Math.max(daten.hoehe, 1);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${b} ${h}`} width={`${b}mm`} height={`${h}mm`} role="img" aria-label={titel}
      style={{ fontFamily: schrift, background: FARBE.papier }}>
      {kopfStil ? <style>{kopfStil}</style> : null}
      {mitDefs ? <SymbolDefs symbole={symbole} /> : null}
      <ZeichnungInhalt daten={daten} zusatz={zusatz} />
    </svg>
  );
}

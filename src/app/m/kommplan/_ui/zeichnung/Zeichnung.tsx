import type { ReactNode } from "react";
import type { KarteL, Zeichnungsdaten } from "../../_lib/layout/typen";
import { FARBE, STRICH } from "./farben";
import { Abzeichen, Einheit, Karte } from "./Karte";
import { Sechseck } from "./Sechseck";
import { SymbolDefs, type Symbolsatz } from "./Symbole";

export function ZeichnungInhalt({ daten, zusatz, gleitend = false, linienSchluessel }: {
  daten: Zeichnungsdaten; zusatz?: (k: KarteL) => ReactNode; gleitend?: boolean; linienSchluessel?: string;
}) {
  // Sechseck-Schlüssel: Netz + Verbindung, dazu das n-te Vorkommen JE PAAR — nicht der globale Index,
  // sonst verschöbe ein neues Sechseck davor die Schlüssel aller späteren, die dann neu eingehängt
  // würden und sprängen statt zu gleiten. Das Paar ist fast immer eindeutig (`sammler.ts`: Kanäle
  // tragen das Netz `<stelle>#kanal`).
  const vorkommen = new Map<string, number>();
  const sechseckSchluessel = daten.sechsecke.map((s) => {
    const paar = `${s.netz}:${s.verbindungId}`;
    const n = vorkommen.get(paar) ?? 0;
    vorkommen.set(paar, n + 1);
    return `${paar}:${n}`;
  });
  return (
    <g>
      {/* Linien haben keine stabile Identität (Netz + Index): im Editor werden sie nach dem Gleiten
          neu eingeblendet — der Schlüssel wechselt nur bei strukturellen Änderungen (Editor.tsx). */}
      <g key={gleitend ? linienSchluessel : undefined} className={gleitend ? "kp-nachziehen" : undefined}
        fill="none" stroke={FARBE.tinte} strokeLinecap="square">
        {daten.linien.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} strokeWidth={l.duenn ? STRICH.duenn : STRICH.linie} data-netz={l.netz} />
        ))}
      </g>
      {daten.sechsecke.map((s, i) => <Sechseck key={sechseckSchluessel[i]} s={s} gleitend={gleitend} />)}
      {daten.karten.map((k) => <Karte key={k.id} k={k} zusatz={zusatz} gleitend={gleitend} />)}
      {daten.einheiten.map((e) => <Einheit key={e.id} e={e} gleitend={gleitend} />)}
      {daten.abzeichen.map((a) => <Abzeichen key={a.stelleId} a={a} gleitend={gleitend} />)}
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

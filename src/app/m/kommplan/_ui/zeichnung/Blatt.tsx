import { BLATT, PAPIER, PT_IN_MM } from "../../_lib/layout/masse";
import { LEGENDE, zeichenflaeche } from "../../_lib/layout/papier";
import { textBreite } from "../../_lib/layout/text";
import type { Blatt } from "../../_lib/layout/typen";
import { FARBE, STRICH } from "./farben";
import { LegendenSymbol } from "./LegendenSymbol";
import { SymbolDefs, type Symbolsatz } from "./Symbole";
import { ZeichnungInhalt } from "./Zeichnung";

/** Die vom Aufrufer formatierten Rahmentexte — der Renderer kennt weder Uhr noch Zeitzone. */
export interface Rahmen { titel: string; untertitel: string | null; stand: string; bearbeiter: string; vermerkVsNfD: boolean; organisation: string }

const pt = (p: number) => p * PT_IN_MM;

export function Blattansicht({ blatt, rahmen, symbole, schrift, kopfStil, mitDefs = true }: {
  blatt: Blatt; rahmen: Rahmen; symbole: Symbolsatz; schrift?: string; kopfStil?: string; mitDefs?: boolean;
}) {
  const p = PAPIER["a4-quer"];
  const f = zeichenflaeche("a4-quer", blatt.legendeZeilen.length);
  const rechts = p.breite - BLATT.randX;
  const kopfY = BLATT.randOben;
  const fussY = p.hoehe - BLATT.randUnten - 2;
  const legendeOben = f.y + f.hoehe + BLATT.legendeRand / 2;
  const leer = blatt.zeichnung.karten.length === 0;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="kp-blatt" data-blatt={blatt.nummer} width={`${p.breite}mm`} height={`${p.hoehe}mm`}
      viewBox={`0 0 ${p.breite} ${p.hoehe}`} role="img" aria-label={`${rahmen.titel}, Blatt ${blatt.nummer} von ${blatt.von}`}
      style={{ fontFamily: schrift, background: FARBE.papier }}>
      {kopfStil ? <style>{kopfStil}</style> : null}
      {mitDefs ? <SymbolDefs symbole={symbole} /> : null}
      {/* Kopf */}
      <text x={BLATT.randX} y={kopfY + 6} fontSize={pt(14)} fontWeight={700}>{rahmen.titel}</text>
      {rahmen.untertitel ? <text x={BLATT.randX} y={kopfY + 11.5} fontSize={pt(9)}>{rahmen.untertitel}</text> : null}
      <text x={rechts - 9} y={kopfY + 6} fontSize={pt(9)} fontWeight={700} textAnchor="end">{rahmen.organisation}</text>
      <g aria-hidden="true" fill={FARBE.marke}>
        <rect x={rechts - 6} y={kopfY + 3} width={6} height={2} />
        <rect x={rechts - 4} y={kopfY + 1} width={2} height={6} />
      </g>
      <line x1={BLATT.randX} y1={kopfY + BLATT.kopf - 1} x2={rechts} y2={kopfY + BLATT.kopf - 1} stroke={FARBE.tinte} strokeWidth={STRICH.duenn} />
      {/* Zeichnung */}
      {leer ? (
        <text x={p.breite / 2} y={f.y + f.hoehe / 2} fontSize={pt(12)} textAnchor="middle">Dieser Plan hat noch keine Stellen.</text>
      ) : (
        <g transform={`translate(${blatt.ursprung.x} ${blatt.ursprung.y}) scale(${blatt.massstab})`}>
          <ZeichnungInhalt daten={blatt.zeichnung} />
        </g>
      )}
      {/* Legende */}
      {blatt.legendeZeilen.map((zeile, zi) => {
        let x = BLATT.randX;
        const y = legendeOben + zi * BLATT.legendeZeile;
        return (
          <g key={zi} data-legende-zeile={zi}>
            {zeile.map((e, ei) => {
              const hx = x;
              x += LEGENDE.symbolBreite + LEGENDE.symbolLuft + textBreite(e.text, LEGENDE.schrift, false) + LEGENDE.eintragLuft;
              return (
                <g key={ei} transform={`translate(${hx} ${y})`}>
                  <LegendenSymbol art={e.art} />
                  <text x={LEGENDE.symbolBreite + LEGENDE.symbolLuft} y={2.9} fontSize={pt(LEGENDE.schrift)}>{e.text}</text>
                </g>
              );
            })}
          </g>
        );
      })}
      {/* Fuß */}
      {rahmen.vermerkVsNfD ? <text x={BLATT.randX} y={fussY} fontSize={pt(8)}>VS – nur für den Dienstgebrauch</text> : null}
      <text x={p.breite / 2} y={fussY} fontSize={pt(8)} textAnchor="middle">
        {`${rahmen.stand} · ${rahmen.bearbeiter}${blatt.unterMindestschrift ? " · Schrift unter 6 pt" : ""}`}
      </text>
      <text x={rechts} y={fussY} fontSize={pt(8)} textAnchor="end">{`Blatt ${blatt.nummer} von ${blatt.von}`}</text>
    </svg>
  );
}

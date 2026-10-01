import { BLATT, LOGO_BOX, PAPIER, PT_IN_MM } from "../../_lib/layout/masse";
import { LEGENDE, kopflinieY, legendeObenY, qrBox, zeichenflaeche } from "../../_lib/layout/papier";
import { kuerze, textBreite } from "../../_lib/layout/text";
import type { Blatt, Papierformat } from "../../_lib/layout/typen";
import type { QrGrafik } from "../../_lib/qrGrafik";
import { FARBE, STRICH } from "./farben";
import { LegendenSymbol } from "./LegendenSymbol";
import { SymbolDefs, type Symbolsatz } from "./Symbole";
import { ZeichnungInhalt } from "./Zeichnung";

const pt = (p: number) => p * PT_IN_MM;

/** Die vom Aufrufer formatierten Rahmentexte — der Renderer kennt weder Uhr noch Zeitzone. Organisation und
 *  Logo kommen aus dem Briefkopf (Spec §4.4), nie aus dem Code; `null` = die Stelle bleibt leer. */
export interface Rahmen {
  titel: string; untertitel: string | null; stand: string; bearbeiter: string; vermerkVsNfD: boolean;
  organisation: string | null; logo: { href: string } | null;
  /** QR „Aktuelle Fassung“ (Phase 5, Entscheidung 11); nur, wenn er tatsächlich gedruckt wird. */
  qr?: QrGrafik | null;
}

export const LOGO_ID = "kp-logo";
/**
 * Das Logo EINMAL je Dokument (Umsetzungsplan Phase 4, Entscheidung 6): als `<image>` mit `data:`-URI —
 * keine Bildroute, und ein SVG-Logo führt im Bildkontext nie Skript aus. Jedes Blatt verweist per `<use>`
 * darauf; die Druckseite stellt es mit den Symbolen in ein gemeinsames `<defs>` (`Druckblaetter`).
 * `meet` hält das Seitenverhältnis in der festen Box, rechtsbündig.
 */
export function LogoDefs({ logo }: { logo: Rahmen["logo"] }) {
  return logo ? <image id={LOGO_ID} width={LOGO_BOX.breite} height={LOGO_BOX.hoehe} preserveAspectRatio="xMaxYMid meet" href={logo.href} /> : null;
}

/** Höchstbreite des Organisationsnamens im Kopf (mm) — ein langer Vereinsname drückt den Titel nicht weg. */
export const ORGANISATION_MAX = 80;
const TITEL_PT = { start: 14, min: 10 } as const;

/**
 * Der Plantitel im Kopf (bis 200 Zeichen) passt in `platz` mm: erst in halben Punkten bis 10 pt kleiner (wie
 * die Kartentitel in `karte.ts`), dann mit „…" gekürzt. Nie läuft er in Organisation oder Logo-Box (Kritik).
 */
export function kopfTitel(titel: string, platz: number): { text: string; groesse: number } {
  for (let g: number = TITEL_PT.start; g >= TITEL_PT.min; g -= 0.5) if (textBreite(titel, g, true) <= platz) return { text: titel, groesse: g };
  return { text: kuerze(titel, platz, TITEL_PT.min, true).text, groesse: TITEL_PT.min };
}

export function BlattKopf({ rahmen, breite }: { rahmen: Rahmen; breite: number }) {
  const rechts = breite - BLATT.randX;
  const kopfY = BLATT.randOben;
  const logoX = rechts - LOGO_BOX.breite;
  const orgRechts = rahmen.logo ? logoX - LOGO_BOX.luft : rechts;
  const org = rahmen.organisation ? kuerze(rahmen.organisation, ORGANISATION_MAX, 9, true).text : null;
  const belegtAb = org ? orgRechts - textBreite(org, 9, true) : rahmen.logo ? logoX : rechts;
  const titel = kopfTitel(rahmen.titel, belegtAb - LOGO_BOX.luft - BLATT.randX);
  return (
    <g data-kopf="">
      <text x={BLATT.randX} y={kopfY + 6} fontSize={pt(titel.groesse)} fontWeight={700}>{titel.text}</text>
      {rahmen.untertitel ? <text x={BLATT.randX} y={kopfY + 11.5} fontSize={pt(9)}>{rahmen.untertitel}</text> : null}
      {rahmen.logo ? <use href={`#${LOGO_ID}`} x={logoX} y={kopfY} data-logo="" /> : null}
      {org ? (
        <text x={orgRechts} y={kopfY + 6} fontSize={pt(9)} fontWeight={700} textAnchor="end" data-organisation="">{org}</text>
      ) : null}
      <line x1={BLATT.randX} y1={kopflinieY()} x2={rechts} y2={kopflinieY()} stroke={FARBE.tinte} strokeWidth={STRICH.duenn} />
    </g>
  );
}

/** QR „Aktuelle Fassung" unten rechts (Entscheidung 11). `data-qr-ziel` trägt die URL — dieselbe, die der Code trägt. */
function QrAufBlatt({ qr, format }: { qr: QrGrafik; format: Papierformat }) {
  const b = qrBox(format);
  return (
    <g data-qr="" data-qr-ziel={qr.ziel}>
      <text x={b.x + b.kante / 2} y={b.y - 1} fontSize={pt(7)} textAnchor="middle">Aktuelle Fassung</text>
      <svg x={b.x} y={b.y} width={b.kante} height={b.kante} viewBox={`0 0 ${qr.module} ${qr.module}`} shapeRendering="crispEdges">
        <rect width={qr.module} height={qr.module} fill="#ffffff" />
        <path d={qr.pfad} stroke="#000000" />
      </svg>
    </g>
  );
}

export function Blattansicht({ blatt, rahmen, symbole, schrift, kopfStil, mitDefs = true, format = "a4-quer" }: {
  blatt: Blatt; rahmen: Rahmen; symbole: Symbolsatz; schrift?: string; kopfStil?: string; mitDefs?: boolean; format?: Papierformat;
}) {
  const p = PAPIER[format];
  const f = zeichenflaeche(format, blatt.legendeZeilen.length, Boolean(rahmen.qr));
  const rechts = p.breite - BLATT.randX;
  const fussY = p.hoehe - BLATT.randUnten - 2;
  const legendeOben = legendeObenY(format, blatt.legendeZeilen.length);
  const leer = blatt.zeichnung.karten.length === 0;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="kp-blatt" data-blatt={blatt.nummer} width={`${p.breite}mm`} height={`${p.hoehe}mm`}
      viewBox={`0 0 ${p.breite} ${p.hoehe}`} role="img" aria-label={`${rahmen.titel}, Blatt ${blatt.nummer} von ${blatt.von}`}
      style={{ fontFamily: schrift, background: FARBE.papier }}>
      {kopfStil ? <style>{kopfStil}</style> : null}
      {mitDefs ? <SymbolDefs symbole={symbole} /> : null}
      {mitDefs && rahmen.logo ? <defs><LogoDefs logo={rahmen.logo} /></defs> : null}
      <BlattKopf rahmen={rahmen} breite={p.breite} />
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
      {rahmen.qr ? <QrAufBlatt qr={rahmen.qr} format={format} /> : null}
      {/* Fuß */}
      {rahmen.vermerkVsNfD ? <text x={BLATT.randX} y={fussY} fontSize={pt(8)}>VS – nur für den Dienstgebrauch</text> : null}
      <text x={p.breite / 2} y={fussY} fontSize={pt(8)} textAnchor="middle">
        {`${rahmen.stand} · ${rahmen.bearbeiter}${blatt.unterMindestschrift ? " · Schrift unter 6 pt" : ""}`}
      </text>
      <text x={rechts} y={fussY} fontSize={pt(8)} textAnchor="end">{`Blatt ${blatt.nummer} von ${blatt.von}`}</text>
    </svg>
  );
}

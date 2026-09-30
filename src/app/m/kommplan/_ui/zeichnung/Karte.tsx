import type { ReactNode } from "react";
import { EINHEIT, KARTE } from "../../_lib/layout/masse";
import type { AbzeichenL, EinheitL, KarteL } from "../../_lib/layout/typen";
import { KONTAKT_PIKTOGRAMM } from "../../_lib/zeichen/grundlagen";
import { FARBE, STRICH } from "./farben";
import { symbolId } from "./Symbole";
import { Text } from "./Text";

export function Karte({ k, zusatz }: { k: KarteL; zusatz?: (k: KarteL) => ReactNode }) {
  const tinte = k.art === "anker" ? FARBE.anker : FARBE.tinte;
  const rahmen = k.hervorheben ? STRICH.hervor : STRICH.karte;
  const trenner = (y: number, key?: number) => <line key={key} x1={0} y1={y} x2={k.breite} y2={y} stroke={tinte} strokeWidth={STRICH.karte} />;
  return (
    <g transform={`translate(${k.x} ${k.y})`} data-karte={k.id} data-art={k.art}>
      {/* Nur Tooltip, nie gedruckt: der Platzhalter steht nicht auf dem Papier (Abweichung 15). */}
      <title>{k.titelVoll === "" ? "(ohne Titel)" : k.titelVoll}</title>
      <rect width={k.breite} height={k.hoehe} fill={FARBE.papier} stroke={tinte} strokeWidth={rahmen} />
      {k.hervorheben ? <rect x={rahmen / 2} y={rahmen / 2} width={k.breite - rahmen} height={k.kopfHoehe - rahmen} fill={FARBE.hervor} /> : null}
      {k.zeichen ? (
        <use href={`#${symbolId(k.zeichen)}`} x={KARTE.rand} y={KARTE.rand} width={KARTE.zeichen} height={KARTE.zeichen} opacity={k.art === "anker" ? 0.45 : 1} />
      ) : null}
      {k.titel.map((z, i) => <Text key={i} z={z} farbe={tinte} />)}
      {k.leiter ? <Text z={k.leiter} farbe={tinte} /> : null}
      {k.kontakte.length > 0 || k.verweis ? trenner(k.kopfHoehe) : null}
      {k.kontakte.length > 0 ? (
        <line x1={KARTE.piktoSpalte} y1={k.kopfHoehe} x2={KARTE.piktoSpalte} y2={k.hoehe} stroke={tinte} strokeWidth={STRICH.karte} />
      ) : null}
      {k.kontakte.map((z, i) => (
        <g key={i} data-kontakt={z.art}>
          {i > 0 ? trenner(z.y) : null}
          <use
            href={`#${symbolId(KONTAKT_PIKTOGRAMM[z.art])}`}
            x={(KARTE.piktoSpalte - KARTE.piktoGroesse) / 2} y={z.y + (z.hoehe - KARTE.piktoGroesse) / 2}
            width={KARTE.piktoGroesse} height={KARTE.piktoGroesse}
          />
          {z.zeilen.map((t, j) => <Text key={j} z={t} farbe={tinte} />)}
        </g>
      ))}
      {k.verweis ? <Text z={k.verweis} farbe={tinte} /> : null}
      {zusatz?.(k)}
    </g>
  );
}

export function Einheit({ e }: { e: EinheitL }) {
  return (
    <g transform={`translate(${e.x} ${e.y})`} data-einheit={e.id}>
      <title>{e.voll}</title>
      <rect width={e.breite} height={e.hoehe} fill={FARBE.papier} stroke={FARBE.tinte} strokeWidth={STRICH.karte} />
      {e.zeichen ? <use href={`#${symbolId(e.zeichen)}`} x={KARTE.rand} y={(e.hoehe - EINHEIT.zeichen) / 2} width={EINHEIT.zeichen} height={EINHEIT.zeichen} /> : null}
      <Text z={e.text} />
    </g>
  );
}

export function Abzeichen({ a }: { a: AbzeichenL }) {
  return (
    <g transform={`translate(${a.x} ${a.y})`} data-abzeichen={a.stelleId}>
      <rect width={a.breite} height={a.hoehe} rx={a.hoehe / 2} fill={FARBE.abzeichen} stroke={FARBE.tinte} strokeWidth={STRICH.karte} />
      <Text z={a.text} />
    </g>
  );
}

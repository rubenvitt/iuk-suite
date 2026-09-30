import { SECHSECK } from "../../_lib/layout/masse";
import type { SechseckForm, SechseckL } from "../../_lib/layout/typen";
import { FARBE, STRICH } from "./farben";
import { symbolId } from "./Symbole";
import { Text } from "./Text";

export function sechseckPunkte(form: SechseckForm, b: number, h: number): string {
  if (form === "leitung") {
    const f = SECHSECK.fase;
    return `${f},0 ${b - f},0 ${b},${f} ${b},${h - f} ${b - f},${h} ${f},${h} 0,${h - f} 0,${f}`;
  }
  const s = SECHSECK.spitze;
  return `0,${h / 2} ${s},0 ${b - s},0 ${b},${h / 2} ${b - s},${h} ${s},${h}`;
}

export function Sechseck({ s }: { s: SechseckL }) {
  return (
    <g transform={`translate(${s.x} ${s.y})`} data-sechseck={s.verbindungId}>
      <title>{s.voll}</title>
      <polygon
        points={sechseckPunkte(s.form, s.breite, s.hoehe)} fill={FARBE.papier} stroke={FARBE.tinte}
        strokeWidth={STRICH.linie} strokeDasharray={s.form === "mobil" ? "1 0.6" : undefined}
      />
      <use href={`#${symbolId(s.piktogramm)}`} x={SECHSECK.spitze} y={(s.hoehe - SECHSECK.piktoHoehe) / 2} width={SECHSECK.piktoBreite} height={SECHSECK.piktoHoehe} />
      <Text z={s.beschriftung} />
    </g>
  );
}

import { PT_IN_MM } from "../../_lib/layout/masse";
import type { TextZeile } from "../../_lib/layout/typen";
import { FARBE } from "./farben";

const ANKER = { start: "start", mitte: "middle", ende: "end" } as const;

export function Text({ z, farbe = FARBE.tinte }: { z: TextZeile; farbe?: string }) {
  return (
    <text x={z.x} y={z.y} fontSize={z.groesse * PT_IN_MM} fontWeight={z.fett ? 700 : 400} textAnchor={ANKER[z.anker]} fill={farbe}>
      {z.text}
    </text>
  );
}

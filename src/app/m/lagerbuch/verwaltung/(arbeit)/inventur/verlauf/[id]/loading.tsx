import { SeiteLaedt } from "@/core/shell/SeiteLaedt";

/**
 * DRK-201 — die Ladegrenze dieser Detailroute. Die Begruendung, warum es sie
 * seit dem 19.09.2026 gibt und was sie in `next dev` NICHT beweist, steht
 * einmal am Bauteil (`core/shell/SeiteLaedt.tsx`) und nicht siebenmal hier.
 *
 * ⚠️ EINE EBENE TIEFER ALS DIE SECHS ANDEREN, und genau deshalb fehlte sie im
 * ersten Wurf (Codex-Review zu PR #210, P2): der Verlauf liegt unter
 * `inventur/`, nicht unmittelbar unter `(arbeit)/`. Wer die Detailrouten von
 * Hand aufzaehlt statt den Baum zu lesen, uebersieht sie — der Riegel in
 * `error.test.tsx` sucht deshalb rekursiv.
 */
export default function Laedt() {
  return <SeiteLaedt />;
}

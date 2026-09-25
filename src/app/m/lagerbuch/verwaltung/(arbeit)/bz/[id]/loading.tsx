import { SeiteLaedt } from "@/core/shell/SeiteLaedt";

/**
 * DRK-201 — die Ladegrenze dieser Detailroute. Die Begruendung, warum es sie
 * seit dem 19.09.2026 gibt und was sie in `next dev` NICHT beweist, steht
 * einmal am Bauteil (`core/shell/SeiteLaedt.tsx`) und nicht sechsmal hier.
 */
export default function Laedt() {
  return <SeiteLaedt />;
}

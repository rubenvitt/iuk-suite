"use client";

import { usePathname, useRouter } from "next/navigation";
import { Segmented } from "antd";

/**
 * DAS ZEITFENSTER DES TRENDS (Entwurf §3.3, Client-Insel laut §4.13).
 *
 * „6 / 12 / 24 Monate" schreibt `?monate=` und lässt den SERVER neu rechnen: das
 * Fenster entscheidet, welche Abende in die Kurve kommen, und diese Auswahl ist
 * eine Datenfrage, keine Ansichtsfrage. Damit ist die Auswahl außerdem teilbar
 * (ein Link auf „letzte 24 Monate") und übersteht ein Neuladen.
 *
 * `router.replace` und nicht `push`: die Zurück-Taste soll die Seite verlassen und
 * nicht durch drei Zeitfenster zurücklaufen.
 *
 * WARUM CLIENT: `Segmented` bringt `onChange` mit — eine Funktions-Prop, die eine
 * Server Component nicht übergeben kann (§4.13, Falle 2).
 */

export type MonatsSegmentProps = {
  /** Das aktive Fenster in Monaten — vom Server bereits auf 6/12/24 geklemmt. */
  monate: number;
};

/** Die drei Fenster aus §3.3. Mehr Auswahl wäre eine Entscheidung ohne Anlass. */
export const MONATS_FENSTER = [6, 12, 24] as const;

export function MonatsSegment({ monate }: MonatsSegmentProps) {
  const router = useRouter();
  const pfad = usePathname();

  return (
    <Segmented
      value={monate}
      onChange={(wert) => router.replace(`${pfad}?monate=${wert}`)}
      options={MONATS_FENSTER.map((m) => ({ value: m, label: `${m} Monate` }))}
    />
  );
}

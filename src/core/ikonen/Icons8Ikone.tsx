import type { CSSProperties } from "react";

import { ICONS8, type Icons8Name } from "./katalog";

/*
 * DIE EINE ZEICHENQUELLE DER SUITE: Icons8, Satz „Windows 11 Outline"
 * (`fluent-systems-regular`). Die Pfade liegen als Daten in `katalog.ts`; es gibt
 * kein Icon-Paket mehr in `package.json` (`@ant-design/icons`, `react-icons` sind
 * raus, `ikonen.test.ts` riegelt ab).
 *
 * KEIN "use client", KEIN Hook, KEIN Context: die Komponente ist eine reine
 * Funktion auf ein `<svg>`. Damit ist sie in Server Components wie in Client-Inseln
 * sicher — Falle 7 (`@ant-design/icons` wirft in RSC schon beim Import) gibt es mit
 * dieser Quelle nicht. Wer hier "use client" ergänzt, macht daraus Falle 6.
 *
 * GRÖSSE: ohne `groesse` misst das Zeichen `1em` und sitzt wie ein antd-Icon auf der
 * Grundlinie (`vertical-align: -0.125em`) — so passt es in `Button icon`, `Menu`,
 * `Input prefix` und Fließtext. Mit `groesse` gilt die Pixelzahl.
 *
 * `kraeftig` zieht die Kontur um die gefüllten Pfade nach und macht das Zeichen
 * dicker, ohne einen zweiten Satz zu laden (Stepper-Plus/-Minus im Lagerbuch).
 *
 * Bedeutung trägt immer der Text daneben: das Zeichen ist `aria-hidden`.
 */
export type { Icons8Name };

export function Icons8Ikone({
  name,
  groesse,
  kraeftig = false,
  className,
  style,
  ...daten
}: {
  name: Icons8Name;
  groesse?: number;
  kraeftig?: boolean;
  className?: string;
  style?: CSSProperties;
} & { [datenAttribut: `data-${string}`]: string | undefined }) {
  const zeichen = ICONS8[name];
  const mass = groesse ?? "1em";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={zeichen.viewBox}
      width={mass}
      height={mass}
      fill="currentColor"
      stroke={kraeftig ? "currentColor" : undefined}
      strokeWidth={kraeftig ? 1.6 : undefined}
      strokeLinejoin={kraeftig ? "round" : undefined}
      aria-hidden
      focusable="false"
      data-icons8={name}
      className={className}
      style={{ flex: "none", verticalAlign: groesse === undefined ? "-0.125em" : undefined, ...style }}
      {...daten}
    >
      {zeichen.pfade.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

"use client";

import { Icons8Ikone, type Icons8Name } from "@/core/ikonen/Icons8Ikone";

/**
 * Die fünf Zeichen der Kern-Ansichten, aufgelöst über den Icons8-Katalog der Suite
 * (`core/ikonen`, seit DRK-502; vorher Phosphor-Pfade aus der Vorlage). Kein Icon-Paket: der
 * Kern läuft auch in der Desktop-App, die `@/core/ikonen/Icons8Ikone` per Alias auflöst.
 * Immer `aria-hidden` — die Bedeutung trägt der Text daneben.
 */
const ZEICHEN = {
  haken: "checkmark",
  warnung: "warning",
  verketten: "link",
  entketten: "broken-link",
  schluessel: "key",
} as const satisfies Record<string, Icons8Name>;

export type Zeichenname = keyof typeof ZEICHEN;

export function Zeichen({ name, groesse }: { name: Zeichenname; groesse: number }) {
  return <Icons8Ikone name={ZEICHEN[name]} groesse={groesse} />;
}

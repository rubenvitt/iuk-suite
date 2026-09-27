import { zeitFormat } from "@/core/zeit";

/**
 * DAS HINTERGRUNDBILD DER ANMELDESEITE — je Modus und zu Anlässen eine
 * Sonderausgabe.
 *
 * Gewählt wird auf dem Server, in `login/page.tsx`, und als Prop gereicht:
 * so steht das richtige Bild schon im ersten HTML, und es gibt keinen
 * Hydrationsunterschied zwischen Server- und Browseruhr. Der Kalendertag gilt
 * in der Suite-Zone (`core/zeit`), nicht in der Zone des Servers.
 *
 * Die Pfade liegen unter `/login/…`, weil `/login` in `core/routing.ts` auf der
 * PASSTHROUGH-Liste steht — an der Wurzel schriebe der Proxy sie auf einem
 * Modul-Host auf `/m/<modul>/…` um (404).
 *
 * Eine Sonderausgabe gilt für BEIDE Modi: die Motive sind Nachtbilder und
 * tragen die weiße Schrift auf der Bildfläche in hell wie dunkel.
 */
export type Hintergrund = {
  /** Bild im Hellmodus. */
  hell: string;
  /** Bild im Dunkelmodus. */
  dunkel: string;
};

export const HINTERGRUND_STANDARD: Hintergrund = {
  hell: "/login/tag.jpg",
  dunkel: "/login/nacht.jpg",
};

type Anlass = {
  name: string;
  bild: string;
  /** Erster und letzter Tag (inklusive) im Jahr `jahr`, als `[monat, tag]`. */
  zeitraum: (jahr: number) => { von: [number, number]; bis: [number, number] };
};

/**
 * Bewusst großzügig um den eigentlichen Tag herum: eine Sonderausgabe, die nur
 * am Tag selbst gilt, sieht kaum jemand. Weihnachten reicht über den
 * Jahreswechsel bis Heilige Drei Könige; `zeitraum` beschreibt deshalb das
 * Fenster, das im Jahr `jahr` BEGINNT, und die Prüfung sieht auch ins Vorjahr.
 */
export const ANLAESSE: readonly Anlass[] = [
  { name: "halloween", bild: "/login/halloween.jpg", zeitraum: () => ({ von: [10, 17], bis: [11, 3] }) },
  { name: "weihnachten", bild: "/login/weihnachten.jpg", zeitraum: () => ({ von: [11, 25], bis: [13, 6] }) },
];

const KALENDERTAG = zeitFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });

/** Tagesnummer eines Kalendertags; Monat 13 ist der Januar des Folgejahres. */
function tagesnummer(jahr: number, monat: number, tag: number): number {
  return Date.UTC(jahr, monat - 1, tag) / 86_400_000;
}

/** Der Anlass, in dessen Zeitraum `jetzt` (in der Suite-Zone) fällt, sonst `null`. */
export function anlassAm(jetzt: Date): string | null {
  const [jahr, monat, tag] = KALENDERTAG.format(jetzt).split("-").map(Number);
  const heute = tagesnummer(jahr, monat, tag);
  for (const anlass of ANLAESSE) {
    for (const beginnjahr of [jahr - 1, jahr]) {
      const { von, bis } = anlass.zeitraum(beginnjahr);
      if (heute >= tagesnummer(beginnjahr, ...von) && heute <= tagesnummer(beginnjahr, ...bis)) {
        return anlass.name;
      }
    }
  }
  return null;
}

export function hintergrundAm(jetzt: Date): Hintergrund {
  const name = anlassAm(jetzt);
  const anlass = ANLAESSE.find((a) => a.name === name);
  return anlass ? { hell: anlass.bild, dunkel: anlass.bild } : HINTERGRUND_STANDARD;
}

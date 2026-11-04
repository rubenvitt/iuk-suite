import {
  istViel,
  mitVerwaltungAmModul,
  ordneAlle,
  persoenlich,
  type Auswahl,
  type GeordneterEintrag,
} from "@/core/shell/launcherAuswahl";
import type { LauncherEintrag } from "@/core/shell/types";

/**
 * DIE ZWEITE EBENE DES MENÜS — „Alle Apps" (IDA-347, Etappe 2). Rein, ohne `"use client"`
 * (Falle 6), und gebaut aus genau den Bausteinen, die schon Portal-Startseite und
 * App-Umschalter ordnen (`launcherAuswahl.ts`, IDA-338): dieselbe Schwelle, dieselben
 * gemerkten Listen, dieselben Bereiche. Eine eigene Ordnung hier liefe der Portal-Startseite davon.
 *
 * Wer wenige Einträge sieht, bekommt sie nach Bereichen. Ab `VIELE_EINTRAEGE_AB` stehen oben
 * „Angeheftet" und „Zuletzt", und darunter nur noch, was dort NICHT steht — eine App zweimal in
 * derselben Liste wäre Rauschen.
 */
export interface AppGruppe {
  titel: string;
  eintraege: GeordneterEintrag[];
}

export function appEbene(
  eintraege: readonly LauncherEintrag[],
  auswahl: Auswahl,
  bereiche: readonly string[],
): AppGruppe[] {
  const geordnet = mitVerwaltungAmModul(eintraege);
  const gruppen: AppGruppe[] = [];
  let gezeigt = new Set<string>();
  if (istViel(eintraege)) {
    const eigene = persoenlich(geordnet, auswahl);
    if (eigene.angeheftet.length) gruppen.push({ titel: "Angeheftet", eintraege: eigene.angeheftet });
    if (eigene.zuletzt.length) gruppen.push({ titel: "Zuletzt", eintraege: eigene.zuletzt });
    gezeigt = new Set([...eigene.angeheftet, ...eigene.zuletzt].map((e) => e.key));
  }
  const rest = geordnet.filter((e) => !gezeigt.has(e.key));
  const alle = ordneAlle(rest, bereiche);
  for (const [titel, liste] of [...alle.apps, ...alle.dienste]) gruppen.push({ titel, eintraege: liste });
  return gruppen;
}

import { aktiverEintrag } from "@/core/shell/SuiteNav";
import { PROFIL_PFAD } from "@/core/shell/profil";
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * DIE SEITE, DIE DER ORT-KNOPF AM TELEFON NENNT (IDA-391) — oder `null`, dann steht dort nur die App.
 *
 * Nicht `aktiverEintrag` allein: dessen Wurzel-Fallback markiert „Übersicht“ auf jeder Seite, die
 * nicht in der Navigation steht. In der Leiste ist das eine schwache, wahre Aussage („dieser
 * Bereich“); im Kopf hieß es „Portal / Übersicht“, während man auf dem Profil stand. Deshalb:
 *
 * 1. ein genauer Treffer der Navigation;
 * 2. sonst der längste Eintrag, unter dem der Pfad liegt (`/artikel/7` → „Artikel“);
 * 3. sonst die Profilseite, die die Hülle selbst verlinkt;
 * 4. sonst nichts — lieber nur die App als eine falsche Seite.
 */
export function ortSeite(pfad: string, nav: readonly SuiteNavItem[], mitProfil: boolean): string | null {
  const aktiv = aktiverEintrag(pfad, [...nav]);
  if (aktiv?.genau) return nav.find((e) => e.key === aktiv.schluessel)?.title ?? null;
  const darunter = nav
    .filter((e) => e.href !== "/" && pfad.startsWith(`${e.href.replace(/\/$/, "")}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (darunter) return darunter.title;
  if (mitProfil && (pfad === PROFIL_PFAD || pfad.startsWith(`${PROFIL_PFAD}/`))) return "Profil";
  return null;
}

/**
 * DIE SUITEWEITE SUCHE IM PORTAL (IDA-301).
 *
 * Das Portal hält KEINEN Index und liest KEINE Moduldatenbank. Es fragt jedes Modul, das eine
 * `suiteSuche` veröffentlicht, und zeigt, was zurückkommt. Ob die Sitzung etwas sehen darf, entscheidet
 * das Modul selbst (`null` = nicht zeigen). Vertrag: `core/suche`.
 *
 * Nicht dabei, mit Absicht:
 * - einsatzbuch: die Einsatzdaten sind Ende-zu-Ende verschlüsselt, der Server kann sie nicht lesen.
 * - helfer: Personaldaten; das Modul setzt für jede seiner Seiten `no-store` und `noindex`
 *   (`VERTRAULICHE_ANSICHTEN`), die Portalseite trüge sie nicht.
 *
 * Wer ein Modul aufnimmt, legt dort `_lib/suiteSuche.ts` an und ergänzt die Liste unten.
 */
import type { Session } from "next-auth";
import { getModule } from "@/core/registry";
import { moduleUrl } from "@/core/shell/moduleUrl";
import type { Icons8Name } from "@/core/ikonen/katalog";
import type { SuchMerkmal, SuiteSuche } from "@/core/suche";
import { suiteSuche as fahrzeugeSuche } from "@/app/m/fahrzeuge/_lib/suiteSuche";
import { suiteSuche as lagerbuchSuche } from "@/app/m/lagerbuch/_lib/suiteSuche";
import { suiteSuche as radioSuche } from "@/app/m/radio/_lib/suiteSuche";

/** Reihenfolge = Reihenfolge auf der Seite. */
export const SUCHMODULE: readonly { modul: string; suche: SuiteSuche }[] = [
  { modul: "radio", suche: radioSuche },
  { modul: "fahrzeuge", suche: fahrzeugeSuche },
  { modul: "lagerbuch", suche: lagerbuchSuche },
];

/** Ein Treffer, fertig für die Seite: mit vollständiger Adresse statt Modulpfad. */
export interface PortalTreffer {
  id: string;
  art: string;
  titel: string;
  merkmale: SuchMerkmal[];
  href: string;
}

export type ModulErgebnis =
  | { modul: string; titel: string; icon: Icons8Name; zustand: "treffer"; treffer: PortalTreffer[]; mehr: boolean }
  | { modul: string; titel: string; icon: Icons8Name; zustand: "fehler" };

/**
 * Fragt jedes Modul. Module, die die Sitzung nicht durchsuchen darf, fehlen im Ergebnis ganz; Module
 * ohne Treffer ebenso. Wirft ein Modul, steht es mit `fehler` da, damit die übrigen Treffer bleiben.
 * Ein Modul ohne erreichbare Adresse (`moduleUrl` = null) fehlt ebenfalls: ein Treffer ohne Link
 * führte nirgendwohin.
 */
export function sucheUeberall(
  begriff: string,
  sitzung: Session | null,
  module: readonly { modul: string; suche: SuiteSuche }[] = SUCHMODULE,
  urlFuer: (modul: string) => string | null = moduleUrl,
): ModulErgebnis[] {
  const ergebnisse: ModulErgebnis[] = [];
  for (const { modul, suche } of module) {
    const def = getModule(modul);
    const kopf = { modul, titel: def.title, icon: def.icon };
    const basis = urlFuer(modul);
    if (!basis) continue;
    let antwort;
    try {
      antwort = suche(begriff, sitzung);
    } catch (fehler) {
      console.error(`[suche] ${modul}:`, fehler);
      ergebnisse.push({ ...kopf, zustand: "fehler" });
      continue;
    }
    if (!antwort || antwort.treffer.length === 0) continue;
    ergebnisse.push({
      ...kopf,
      zustand: "treffer",
      mehr: antwort.mehr,
      treffer: antwort.treffer.map((t) => ({ id: t.id, art: t.art, titel: t.titel, merkmale: t.merkmale, href: `${basis}${t.pfad}` })),
    });
  }
  return ergebnisse;
}

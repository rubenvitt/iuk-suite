import { getVisibleServicesForUser } from "@/app/m/portal/_lib/services";
import type { Service } from "@/app/m/portal/_db/schema";
import type { LauncherEintrag } from "@/core/shell/types";

/**
 * DIE EINE FUNKTION, DIE DAS PORTAL FÜR `core/shell` VERÖFFENTLICHT.
 *
 * `docs/design/README.md` hält fest, dass Modul-Interna kein API sind
 * (`payloadToSvg` durfte nicht quer importiert werden). Der Launcher liegt aber
 * in `core/shell` und läuft auf jeder Seite jedes angemeldeten Moduls, während
 * die Dienste in DIESER Datenbank stehen. Statt `core` das Schema sehen zu
 * lassen, veröffentlicht das Modul genau eine Funktion — dieselbe Bauform, die
 * `core/bootstrap.ts` mit `seedPortal` schon nutzt.
 *
 * KEIN `"use client"`: `core/shell/launcherEintraege.ts` ist ein Server-Modul und
 * bekäme sonst eine Client-Referenz statt der Funktion (`docs/design/README.md`,
 * Falle 6).
 *
 * `launcherEintraege.test.ts` hält mit einem Quelltext-Scan fest, dass
 * `core/shell` aus diesem Modul NUR diese Datei importiert.
 */
export const ABSCHNITT_WEITERE = "Weitere Dienste";

/**
 * Rein, damit sie ohne Datenbank prüfbar ist — der lesende Wrapper darunter
 * bleibt so dünn, dass an ihm nichts mehr schiefgehen kann.
 */
export function dienstZuEintrag(dienst: Service): LauncherEintrag {
  return {
    key: `dienst:${dienst.id}`,
    title: dienst.name,
    beschreibung: dienst.description.trim() || undefined,
    iconUrl: dienst.iconUrl,
    href: dienst.url,
    abschnitt: dienst.category?.trim() || ABSCHNITT_WEITERE,
    extern: dienst.openInNewTab,
  };
}

/**
 * TRY/CATCH MIT ABSICHT, NICHT VERGESSEN. `launcherEintraege()` läuft ÜBER
 * `SuiteHeader` auf JEDER Seite JEDES angemeldeten Moduls — lagerbuch, files,
 * feedback, qr, gamma, nicht nur portal. Vor dem Navigations-Umbau war die
 * Modulliste der Kopfzeile synchron und rein aus der Registry; ein Problem der
 * Portal-Datenbank brach nur das Portal. Ein Wurf von hier hätte seitdem eine
 * andere Reichweite als ein Fehler im Portal selbst — dieselbe Überlegung wie
 * bei `lagerbuchBootFehler()` in `core/bootstrap.ts` (die dort NIE wirft, weil
 * sie sonst portal, qr, feedback und files mitnähme). `SQLITE_BUSY` unter
 * einem gleichzeitigen Schreiber, ein falsches `DATA_DIR`, eine volle Platte
 * oder eine beschädigte Datei dürfen also höchstens das Portal treffen, nie
 * jede angemeldete Route der Suite. Bei einem Fehler fällt der Launcher auf
 * „nur Module" zurück (`[]`), statt die Seite zu zerlegen — geloggt, damit der
 * Fehler nicht still verschwindet (Bauform wie `app/m/files/_lib/storage.ts`).
 */
export async function dienstEintraege(groups: string[] | null): Promise<LauncherEintrag[]> {
  try {
    const dienste = await getVisibleServicesForUser(groups ?? []);
    return dienste.map(dienstZuEintrag);
  } catch (fehler) {
    console.error("[portal][launcher] Dienste nicht ladbar, Launcher faellt auf Module zurueck:", fehler);
    return [];
  }
}

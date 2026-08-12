import { getVisibleServicesForUser } from "@/app/m/portal/_lib/services";
import type { Service } from "@/app/m/portal/_db/schema";
import type { LauncherEintrag } from "@/core/shell/types";

/**
 * DIE EINE FUNKTION, DIE DAS PORTAL FUER `core/shell` VEROEFFENTLICHT.
 *
 * `docs/design/README.md` haelt fest, dass Modul-Interna kein API sind
 * (`payloadToSvg` durfte nicht quer importiert werden). Der Launcher liegt aber
 * in `core/shell` und laeuft auf jeder Seite jedes angemeldeten Moduls, waehrend
 * die Dienste in DIESER Datenbank stehen. Statt `core` das Schema sehen zu
 * lassen, veroeffentlicht das Modul genau eine Funktion — dieselbe Bauform, die
 * `core/bootstrap.ts` mit `seedPortal` schon nutzt.
 *
 * KEIN `"use client"`: `core/shell/launcherEintraege.ts` ist ein Server-Modul und
 * bekaeme sonst eine Client-Referenz statt der Funktion (`docs/design/README.md`,
 * Falle 6).
 *
 * `launcherEintraege.test.ts` haelt mit einem Quelltext-Scan fest, dass
 * `core/shell` aus diesem Modul NUR diese Datei importiert.
 */
export const ABSCHNITT_WEITERE = "Weitere Dienste";

/**
 * Rein, damit sie ohne Datenbank pruefbar ist — der lesende Wrapper darunter
 * bleibt so duenn, dass an ihm nichts mehr schiefgehen kann.
 */
export function dienstZuEintrag(dienst: Service): LauncherEintrag {
  return {
    key: `dienst:${dienst.id}`,
    title: dienst.name,
    beschreibung: dienst.description.trim() || undefined,
    iconUrl: dienst.iconUrl,
    href: dienst.url,
    abschnitt: dienst.category?.trim() ? dienst.category : ABSCHNITT_WEITERE,
    extern: dienst.openInNewTab,
  };
}

export async function dienstEintraege(groups: string[] | null): Promise<LauncherEintrag[]> {
  const dienste = await getVisibleServicesForUser(groups ?? []);
  return dienste.map(dienstZuEintrag);
}

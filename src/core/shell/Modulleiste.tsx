"use client";

import { NavListe } from "@/core/shell/SuiteNav";
import type { SuiteNavItem } from "@/core/shell/types";
import s from "./shell.module.css";

/**
 * DIE MODULNAVIGATION ALS SEITENLEISTE — für Module, deren Einträge Abschnitte
 * tragen.
 *
 * Die Lagerbuch-Verwaltung hatte fünfzehn gleichrangige Einträge in einer
 * umbrechenden Zeile; „BZ-Kontrolle" stand dabei zweizeilig zwischen „Checks"
 * und „Sauerstoff". Eine Zeile skaliert bis etwa fünf Ziele, danach ist sie
 * eine Aufzählung ohne Ordnung.
 *
 * INZWISCHEN SIND ES 21 EINTRÄGE, und damit war auch die Leiste zu lang: rund
 * 1120px, auf einem 900px-Schirm also etwa 300px Scrollweg. Deshalb hält
 * `NavListe` ab `NAV_LANG_AB_EINTRAEGEN` ein Filterfeld und aufklappbare
 * Abschnitte bereit. ⚠️ DIESE DATEI ENTSCHEIDET DAS NICHT — sie reicht nur
 * durch. Die Schwelle steht an genau einer Stelle (`navFilter.ts`), damit
 * Leiste und Drawer nicht verschieden urteilen können.
 *
 * Client-Komponente, weil die Aktivmarkierung `usePathname()` braucht — das
 * steht seit dem Filter in `NavListe` selbst. `aktiverEintrag` ist unverändert:
 * es bekommt die flache Liste, die Gruppierung ist reine Darstellung.
 *
 * KEIN antd `Menu`: das brächte eigene Aktivlogik, eigenes Markup und
 * zusätzliches Client-Bündel, um eine Funktion zu ersetzen, die geprüft ist
 * und deren drei Fallen (Rewrite, Wurzel-Fallback, `page` vs. `true`) an
 * `aktiverEintrag` ausgeschrieben stehen. Das gilt nach dem Aufklappen
 * unverändert — antds `Menu` brächte mit `inline`/`SubMenu` zwar Aufklappen
 * mit, aber auch seine eigene Vorstellung davon, was ein aktiver Eintrag ist,
 * und die drei Fallen wären dann seine statt unsere.
 */
export function Modulleiste({ nav, modulKey }: { nav: SuiteNavItem[]; modulKey: string }) {
  if (nav.length === 0) return null;
  return (
    <nav aria-label="Modulnavigation" data-testid="modulleiste" className={s.modulleiste}>
      <NavListe nav={nav} modulKey={modulKey} />
    </nav>
  );
}

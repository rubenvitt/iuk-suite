"use client";

import { usePathname } from "next/navigation";

import { navGruppen } from "@/core/shell/SuiteNav";
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
 * Client-Komponente, weil die Aktivmarkierung `usePathname()` braucht — dieselbe
 * Begründung wie bei `Modulnav`. `aktiverEintrag` selbst ist unverändert: es
 * bekommt die flache Liste, die Gruppierung ist reine Darstellung.
 *
 * KEIN antd `Menu`: das brächte eigene Aktivlogik, eigenes Markup und
 * zusätzliches Client-Bündel, um eine Funktion zu ersetzen, die geprüft ist
 * und deren drei Fallen (Rewrite, Wurzel-Fallback, `page` vs. `true`) an
 * `aktiverEintrag` ausgeschrieben stehen.
 */
export function Modulleiste({ nav }: { nav: SuiteNavItem[] }) {
  const pfad = usePathname();
  if (nav.length === 0) return null;
  return (
    <nav aria-label="Modulnavigation" data-testid="modulleiste" className={s.modulleiste}>
      {navGruppen(nav, pfad)}
    </nav>
  );
}

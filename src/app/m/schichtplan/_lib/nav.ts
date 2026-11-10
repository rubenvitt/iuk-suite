import type { SuiteNavItem } from "@/core/shell/types";

/** Eine Planung ist eine eigene Seite unter `/p/<id>`; ihre Ansichten wechseln dort als Reiter, nicht in der Leiste. */
export const SCHICHTPLAN_NAV: SuiteNavItem[] = [
  { key: "planungen", title: "Planungen", href: "/", ikon: "uebersicht", auffang: true },
];

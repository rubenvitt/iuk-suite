import type { SuiteNavItem } from "@/core/shell/types";
import type { Rechte } from "./zugang";

/**
 * Die Navigation hängt an den Rechten (`_lib/zugang.ts`): wer keine Gruppe verwaltet, sieht nur die Geräte und
 * prüft von dort aus; „Gruppen“ nur für Admins. Dieselben Prädikate riegeln die Seiten.
 */
export function wartungNav(r: Rechte): SuiteNavItem[] {
  if (!r.admin && r.gruppen.length === 0) return [{ key: "geraete", title: "Geräte", href: "/geraete", ikon: "geraete" }];
  return [
    { key: "uebersicht", title: "Übersicht", href: "/", ikon: "uebersicht" },
    { key: "geraete", title: "Geräte", href: "/geraete", ikon: "geraete", abschnitt: "Bestand" },
    { key: "pruefungen", title: "Prüfungen und Wartungen", href: "/pruefungen", ikon: "journal", abschnitt: "Bestand" },
    { key: "maengel", title: "Mängel", href: "/maengel", ikon: "maengel", abschnitt: "Bestand" },
    { key: "arten", title: "Gerätearten und Checklisten", href: "/arten", ikon: "katalog", abschnitt: "Einrichten" },
    { key: "etiketten", title: "QR-Etiketten", href: "/etiketten", ikon: "etiketten", abschnitt: "Einrichten" },
    ...(r.admin ? [{ key: "gruppen", title: "Gruppen", href: "/gruppen", ikon: "teilnehmer" as const, abschnitt: "Einrichten" }] : []),
  ];
}

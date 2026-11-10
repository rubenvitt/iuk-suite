import type { SuiteNavItem } from "@/core/shell/types";
import type { Rechte } from "./zugang";

/** Die Navigation hängt an den Rechten (`_lib/zugang.ts`): Lagerorte und Helfer-Links nur für Admins. */
export function verpflegungNav(r: Rechte): SuiteNavItem[] {
  return [
    { key: "uebersicht", title: "Übersicht", href: "/", ikon: "uebersicht" },
    { key: "bestand", title: "Bestand", href: "/bestand", ikon: "artikel", abschnitt: "Lager" },
    { key: "mhd", title: "MHD-Kontrolle", href: "/mhd", ikon: "verfall", abschnitt: "Lager" },
    { key: "buchungen", title: "Buchungen", href: "/buchungen", ikon: "journal", abschnitt: "Lager" },
    { key: "telefon", title: "Buchen am Telefon", href: "/h", ikon: "entnahme", abschnitt: "Lager" },
    { key: "artikel", title: "Artikel", href: "/artikel", ikon: "katalog", abschnitt: "Einrichten" },
    ...(r.admin ? [
      { key: "orte", title: "Lagerorte", href: "/orte", ikon: "lagerorte" as const, abschnitt: "Einrichten" },
      { key: "links", title: "Zugangscodes", href: "/links", ikon: "tokens" as const, abschnitt: "Einrichten" },
    ] : []),
  ];
}

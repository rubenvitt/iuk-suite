import type { SuiteNavItem } from "@/core/shell/types";
import type { Rechte } from "./zugang";

/**
 * Die Navigation hängt an den Rechten (`_lib/zugang.ts`): Lagerorte, Helfer-Links und Etiketten nur für Admins. Die
 * MHD-Kontrolle ist seit IDA-382 eine Stufe des Bestands (`_lib/bestand.ts`).
 */
export function verpflegungNav(r: Rechte): SuiteNavItem[] {
  return [
    { key: "uebersicht", title: "Übersicht", href: "/", ikon: "uebersicht" },
    { key: "bestand", title: "Bestand", href: "/bestand", ikon: "artikel", abschnitt: "Lager" },
    { key: "buchungen", title: "Buchungen", href: "/buchungen", ikon: "journal", abschnitt: "Lager" },
    { key: "telefon", title: "Buchen am Telefon", href: "/h", ikon: "entnahme", abschnitt: "Lager" },
    { key: "artikel", title: "Artikel", href: "/artikel", ikon: "katalog", abschnitt: "Einrichten" },
    ...(r.admin ? [
      { key: "orte", title: "Lagerorte", href: "/orte", ikon: "lagerorte" as const, abschnitt: "Einrichten" },
      { key: "links", title: "Helfer-Links", href: "/links", ikon: "tokens" as const, abschnitt: "Einrichten" },
      // IDA-382: ohne eigenen Eintrag markierte die Seitenleiste auf den Etiketten „Übersicht“.
      { key: "etiketten", title: "Ortsetiketten", href: "/etiketten", ikon: "ortsetiketten" as const, abschnitt: "Einrichten" },
    ] : []),
  ];
}

import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Navigation der Leitung. Ein Event liegt unter `/events/<id>`, ein Projekt unter `/projekte/<id>`: so
 * markiert die Seitenleiste „Events“ bzw. „Projekte“ (IDA-398). Die Vermietung ist ein eigener Abschnitt: heute nur die Bar (IDA-315).
 */
export const GEMEINSCHAFT_NAV: SuiteNavItem[] = [
  { key: "uebersicht", title: "Übersicht", href: "/", ikon: "uebersicht" },
  { key: "kalender", title: "Kalender", href: "/kalender", ikon: "kalender" },
  { key: "events", title: "Events", href: "/events", ikon: "events" },
  { key: "projekte", title: "Projekte", href: "/projekte", ikon: "projekte" },
  { key: "mitglieder", title: "Mitglieder", href: "/mitglieder", ikon: "teilnehmer" },
  { key: "belegung", title: "Belegung", href: "/vermietung", ikon: "belegung", abschnitt: "Vermietung · Bar" },
  { key: "anfragen", title: "Anfragen", href: "/vermietung/anfragen", ikon: "anfragen", abschnitt: "Vermietung · Bar" },
  { key: "sperrzeiten", title: "Sperrzeiten", href: "/vermietung/sperrzeiten", ikon: "sperrzeiten", abschnitt: "Vermietung · Bar" },
  { key: "mietvertrag", title: "Verträge", href: "/vermietung/mietvertrag", ikon: "mietvertrag", abschnitt: "Vermietung · Bar" },
];

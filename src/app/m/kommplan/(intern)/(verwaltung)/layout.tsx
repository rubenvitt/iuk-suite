import { headers } from "next/headers";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { pruefeKommplanBearbeiten, requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";

/**
 * VERWALTUNG (Bibliothek, Einstellungen; Umsetzungsplan Phase 4, Entscheidung 16): Host, Zugang UND
 * Bearbeitungsrecht oberhalb jeder künftigen `loading.tsx` (Falle 23). Die Seiten prüfen selbst noch
 * einmal — Layouts und Seiten rendern parallel, ein Layout ist kein Vorab-Riegel.
 */
export default async function VerwaltungLayout({ children }: { children: React.ReactNode }) {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  pruefeKommplanBearbeiten(viewer);
  return children;
}

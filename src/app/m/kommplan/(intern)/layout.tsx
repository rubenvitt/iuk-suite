import { headers } from "next/headers";
import { requireKommplanHost } from "../_lib/host";
import { requireKommplanZugang } from "../_lib/zugang";

/**
 * Host und Zugang OBERHALB jeder künftigen loading.tsx (Falle 23) — sonst wäre ein notFound() ein
 * HTTP 200. Das objektbezogene 404 eines Plans (unbekannt, archiviert) hält `p/[id]/layout.tsx`
 * aus demselben Grund. Ohne Hülle, weil die Druckroute darunter keine haben darf; Liste und
 * Betrachter setzen sie selbst (`_ui/Huelle.tsx`). Jede Seite ruft die Riegel noch einmal — Layouts
 * und Seiten rendern parallel, ein Layout ist kein Vorab-Riegel.
 */
export default async function KommplanInternLayout({ children }: { children: React.ReactNode }) {
  requireKommplanHost(await headers());
  await requireKommplanZugang();
  return children;
}

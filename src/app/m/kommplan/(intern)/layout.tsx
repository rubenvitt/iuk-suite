import { headers } from "next/headers";
import { getDb } from "../_db/client";
import { requireKommplanHost } from "../_lib/host";
import { merkePerson } from "../_lib/mitglieder";
import { personAus, requireKommplanZugang } from "../_lib/zugang";

/**
 * Host und Zugang OBERHALB jeder künftigen loading.tsx (Falle 23) — sonst wäre ein notFound() ein
 * HTTP 200. Das 404 eines unbekannten Plans hält `p/[id]/layout.tsx` aus demselben Grund (archiviert
 * ist seit Phase 4 nur lesbar, kein 404). Ohne Hülle, weil die Druckroute darunter keine haben darf;
 * Liste und Betrachter setzen sie selbst (`_ui/Huelle.tsx`). Jede Seite ruft die Riegel noch einmal — Layouts
 * und Seiten rendern parallel, ein Layout ist kein Vorab-Riegel. Wer hier mit Zugang ankommt, wird als bekannte
 * Person gemerkt — die Quelle der Einladungs-Suche (`_lib/mitglieder.ts`, `merkePerson`).
 */
export default async function KommplanInternLayout({ children }: { children: React.ReactNode }) {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  merkePerson(getDb(), personAus(viewer).nutzer, viewer.name);
  return children;
}

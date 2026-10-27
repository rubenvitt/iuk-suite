import { headers } from "next/headers";
import { Shell } from "@/core/shell/Shell";
import { requireLagemonitorHost } from "../_lib/host";
import { requireLagemonitorVerwaltung } from "../_lib/zugang";

/**
 * Verwaltung des Lagemonitors: Host zuerst, dann Verwaltungsrecht. Die Seite ruft beide Riegel noch einmal.
 * Ohne Modulnavigation: es gibt genau eine Seite (Vorbild `kommplan/_ui/Huelle.tsx`).
 */
export default async function LagemonitorVerwaltungLayout({ children }: { children: React.ReactNode }) {
  requireLagemonitorHost(await headers());
  await requireLagemonitorVerwaltung();
  return (
    <Shell variant="full" moduleKey="lagemonitor">
      {children}
    </Shell>
  );
}

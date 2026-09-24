import { headers } from "next/headers";
import { Shell } from "@/core/shell/Shell";
import { requireEinsatzbuchHost } from "../_lib/host";
import { requireEinsatzbuchZugang } from "../_lib/zugang";

/**
 * Verwaltung des Einsatzbuchs: Host zuerst, dann Gruppe (beide Riegel werfen in `_lib/`).
 * Jede Seite darunter ruft die Riegel noch einmal — eine Route Group ist keine
 * Sicherheitsgrenze. Die Navigation kommt mit Stufe 2 (`_lib/nav.ts`).
 */
export default async function EinsatzbuchVerwaltungLayout({ children }: { children: React.ReactNode }) {
  requireEinsatzbuchHost(await headers());
  await requireEinsatzbuchZugang();
  return (
    <Shell variant="full" moduleKey="einsatzbuch">
      {children}
    </Shell>
  );
}

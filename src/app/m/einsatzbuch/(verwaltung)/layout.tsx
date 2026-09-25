import { headers } from "next/headers";
import { Shell } from "@/core/shell/Shell";
import { requireEinsatzbuchHost } from "../_lib/host";
import { requireEinsatzbuchZugang } from "../_lib/zugang";
import { EINSATZBUCH_NAV } from "../_lib/nav";

/**
 * Verwaltung des Einsatzbuchs: Host zuerst, dann Gruppe (beide Riegel werfen in `_lib/`).
 * Jede Seite darunter ruft die Riegel noch einmal — eine Route Group ist keine
 * Sicherheitsgrenze.
 */
export default async function EinsatzbuchVerwaltungLayout({ children }: { children: React.ReactNode }) {
  requireEinsatzbuchHost(await headers());
  await requireEinsatzbuchZugang();
  return (
    <Shell variant="full" moduleKey="einsatzbuch" nav={EINSATZBUCH_NAV}>
      {children}
    </Shell>
  );
}

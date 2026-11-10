import { headers } from "next/headers";
import { Shell } from "@/core/shell/Shell";
import { requireLagemonitorHost } from "../_lib/host";
import { LAGEMONITOR_NAV } from "../_lib/nav";
import { requireLagemonitorVerwaltung } from "../_lib/zugang";

/**
 * Verwaltung des Lagemonitors: Host zuerst, dann Verwaltungsrecht. Die Seite ruft beide Riegel noch einmal.
 * Zwei Seiten seit IDA-396: „Meldungen" (Start) und „Einrichtung".
 */
export default async function LagemonitorVerwaltungLayout({ children }: { children: React.ReactNode }) {
  requireLagemonitorHost(await headers());
  await requireLagemonitorVerwaltung();
  return (
    <Shell variant="full" moduleKey="lagemonitor" nav={LAGEMONITOR_NAV}>
      {children}
    </Shell>
  );
}

import { headers } from "next/headers";
import { Shell } from "@/core/shell/Shell";
import { requireFahrzeugeHost } from "../_lib/host";
import { requireFahrzeugeZugang } from "../_lib/zugang";
import { FAHRZEUGE_NAV } from "../_lib/nav";

/**
 * Fahrzeugverwaltung: Host zuerst, dann Gruppe (beide Riegel werfen in `_lib/`). Jede Seite darunter
 * ruft die Riegel noch einmal — eine Route Group ist keine Sicherheitsgrenze.
 */
export default async function FahrzeugeVerwaltungLayout({ children }: { children: React.ReactNode }) {
  requireFahrzeugeHost(await headers());
  await requireFahrzeugeZugang();
  return (
    <Shell variant="full" moduleKey="fahrzeuge" nav={FAHRZEUGE_NAV}>
      {children}
    </Shell>
  );
}

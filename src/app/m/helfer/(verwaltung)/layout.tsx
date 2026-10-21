import { headers } from "next/headers";
import { Shell } from "@/core/shell/Shell";
import { requireHelferHost } from "../_lib/host";
import { requireHelferZugang } from "../_lib/zugang";
import { HELFER_NAV } from "../_lib/nav";

/**
 * Verwaltung des Helferverzeichnisses: Host zuerst, dann Gruppe (beide Riegel werfen in `_lib/`).
 * Jede Seite darunter ruft die Riegel noch einmal — eine Route Group ist keine Sicherheitsgrenze.
 */
export default async function HelferVerwaltungLayout({ children }: { children: React.ReactNode }) {
  requireHelferHost(await headers());
  await requireHelferZugang();
  return (
    <Shell variant="full" moduleKey="helfer" nav={HELFER_NAV}>
      {children}
    </Shell>
  );
}

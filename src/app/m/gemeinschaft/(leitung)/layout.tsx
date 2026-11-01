import { headers } from "next/headers";
import { Shell } from "@/core/shell/Shell";
import { requireGemeinschaftHost } from "../_lib/host";
import { GEMEINSCHAFT_NAV } from "../_lib/nav";
import { requireLeitung } from "../_lib/zugang";

/**
 * Alles der Leitung: Host zuerst, dann Leitungsrecht, oberhalb jeder `loading.tsx` (Falle 23). Jede Seite
 * ruft beide Riegel noch einmal — eine Route Group ist keine Sicherheitsgrenze.
 */
export default async function GemeinschaftLeitungLayout({ children }: { children: React.ReactNode }) {
  requireGemeinschaftHost(await headers());
  await requireLeitung();
  return <Shell variant="full" moduleKey="gemeinschaft" nav={GEMEINSCHAFT_NAV}>{children}</Shell>;
}

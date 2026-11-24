import { headers } from "next/headers";
import { Shell } from "@/core/shell/Shell";
import { requireVeranstaltungenHost } from "../_lib/host";
import { VERANSTALTUNGEN_NAV } from "../_lib/nav";
import { requireVeranstaltungenZugang } from "../_lib/zugang";

/** Host und Zugang oberhalb jeder künftigen `loading.tsx` (Falle 23); die Seite ruft die Riegel noch einmal. */
export default async function VeranstaltungenInternLayout({ children }: { children: React.ReactNode }) {
  requireVeranstaltungenHost(await headers());
  await requireVeranstaltungenZugang();
  return <Shell variant="full" moduleKey="veranstaltungen" nav={VERANSTALTUNGEN_NAV}>{children}</Shell>;
}

import { headers } from "next/headers";
import { requireLagerbuchHost } from "../../_lib/host";
import { LAGERBUCH_NAV } from "../../_lib/nav";
import { requireLagerbuchAdmin } from "../../_lib/zugang";
import { VerwaltungsRahmen } from "../../_ui/VerwaltungsRahmen";

/**
 * Der aeussere Host-Riegel laeuft vor dem Personen-Riegel. So verraet ein
 * anonymer Aufruf auf einem fremden Host die Verwaltungsroute nicht ueber
 * einen vorgeschalteten Login-Umweg.
 *
 * `requireLagerbuchAdmin` behaelt seinen eigenen Host-Riegel: Server Actions
 * rufen die Funktion ohne dieses Layout auf und brauchen denselben Backstop.
 */
export default async function LagerbuchArbeitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const kopf = await headers();
  requireLagerbuchHost(kopf);
  await requireLagerbuchAdmin();

  return <VerwaltungsRahmen nav={LAGERBUCH_NAV}>{children}</VerwaltungsRahmen>;
}

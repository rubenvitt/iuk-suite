import { headers } from "next/headers";
import { requireUnterkunftHost } from "./_lib/host";
import { requireUnterkunftSitzung } from "./_lib/zugang";
import { Unterkunftsrechner } from "./_ui/Unterkunftsrechner";

/** Der Rechner. Alles Weitere läuft im Browser: keine Datenbank, kein Endpunkt (IDA-322). */
export default async function UnterkunftStart() {
  requireUnterkunftHost(await headers());
  await requireUnterkunftSitzung();
  return <Unterkunftsrechner />;
}

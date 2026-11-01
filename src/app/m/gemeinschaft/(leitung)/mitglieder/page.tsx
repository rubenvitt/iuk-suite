import { headers } from "next/headers";
import { getDb } from "../../_db/client";
import { requireGemeinschaftHost } from "../../_lib/host";
import { linkBasisAus, listeMitglieder } from "../../_lib/mitglieder";
import { requireLeitung } from "../../_lib/zugang";
import { MitgliederVerwaltung } from "../../_ui/mitglieder/MitgliederVerwaltung";

export const dynamic = "force-dynamic";

/** Mitglieder ohne Konto, je mit persönlichem Link (IDA-320). Nur die Leitung; Riegel hier noch einmal. */
export default async function MitgliederSeite() {
  const kopf = await headers();
  requireGemeinschaftHost(kopf);
  await requireLeitung();
  return <MitgliederVerwaltung zeilen={listeMitglieder(getDb())} basis={linkBasisAus(kopf)} />;
}

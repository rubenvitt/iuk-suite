import { headers } from "next/headers";
import { requireGemeinschaftHost } from "../_lib/host";
import { requireLeitung } from "../_lib/zugang";

/** Platzhalter der Übersicht; wird durch die eigentliche Übersicht ersetzt. */
export default async function GemeinschaftUebersicht() {
  requireGemeinschaftHost(await headers());
  await requireLeitung();
  return <p>Übersicht</p>;
}

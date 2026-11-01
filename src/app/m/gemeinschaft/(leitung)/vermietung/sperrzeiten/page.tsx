import type { Metadata } from "next";
import { headers } from "next/headers";
import { getDb } from "../../../_db/client";
import { requireGemeinschaftHost } from "../../../_lib/host";
import { ladeAnfragen, ladeSperrzeiten } from "../../../_lib/vermietung";
import { tagInZone } from "../../../_lib/zeit";
import { requireLeitung } from "../../../_lib/zugang";
import { Sperrzeitenliste } from "../../../_ui/vermietung/Sperrzeitenliste";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sperrzeiten der Bar" };

/** Sperrzeiten der Bar, eigene und aus Events mit „Bar belegen“. */
export default async function SperrzeitenSeite() {
  requireGemeinschaftHost(await headers());
  await requireLeitung();
  const db = getDb();
  return <Sperrzeitenliste anfragen={ladeAnfragen(db)} sperren={ladeSperrzeiten(db)} heute={tagInZone(new Date().getTime())} />;
}

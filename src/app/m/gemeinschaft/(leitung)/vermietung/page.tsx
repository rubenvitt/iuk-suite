import type { Metadata } from "next";
import { headers } from "next/headers";
import { getDb } from "../../_db/client";
import { barAnfrageLink } from "../../_lib/barLink";
import { requireGemeinschaftHost } from "../../_lib/host";
import { ladeAnfragen, ladeSperrzeiten } from "../../_lib/vermietung";
import { tagInZone } from "../../_lib/zeit";
import { requireLeitung } from "../../_lib/zugang";
import { Belegungsansicht } from "../../_ui/vermietung/Belegungsansicht";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Belegung der Bar" };

/** Belegung der Bar: Monatskalender mit Anfragen, Zusagen und Sperrzeiten (auch aus Events). */
export default async function BelegungSeite() {
  const kopf = await headers();
  requireGemeinschaftHost(kopf);
  await requireLeitung();
  const db = getDb();
  return <Belegungsansicht anfragen={ladeAnfragen(db)} sperren={ladeSperrzeiten(db)} heute={tagInZone(new Date().getTime())} barLink={barAnfrageLink(kopf)} />;
}

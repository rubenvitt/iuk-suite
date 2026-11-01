import type { Metadata } from "next";
import { headers } from "next/headers";
import { getDb } from "../../../_db/client";
import { requireGemeinschaftHost } from "../../../_lib/host";
import { ladeAnfragen, ladeSperrzeiten } from "../../../_lib/vermietung";
import { requireLeitung } from "../../../_lib/zugang";
import { Anfragenliste } from "../../../_ui/vermietung/Anfragenliste";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Anfragen an die Bar" };

/** Anfragen an die Bar; `?id=<id>` öffnet den Eintrag (die Kennung wird gegen die geladene Liste aufgelöst). */
export default async function AnfragenSeite({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  requireGemeinschaftHost(await headers());
  await requireLeitung();
  const { id } = await searchParams;
  const db = getDb();
  return <Anfragenliste anfragen={ladeAnfragen(db)} sperren={ladeSperrzeiten(db)} startId={typeof id === "string" ? id : null} />;
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Seite } from "@/core/seite/Seite";
import { getDb } from "../../../../../_db/client";
import { requireGemeinschaftHost } from "../../../../../_lib/host";
import { ladeDokument } from "../../../../../_lib/vermietung";
import { idSchema } from "../../../../../_lib/vermietungEingabe";
import { istDokumentart } from "../../../../../_lib/vermietungTypen";
import { requireLeitung } from "../../../../../_lib/zugang";
import { Dokumentfueller } from "../../../../../_ui/vermietung/Dokumentfueller";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dokument der Vermietung" };

/** Ein Dokument einer Zusage ausfüllen, unterschreiben, freigeben (IDA-354). Die Kennung wird gegen die Datenbank aufgelöst. */
export default async function DokumentSeite({ params }: { params: Promise<{ id: string; art: string }> }) {
  requireGemeinschaftHost(await headers());
  await requireLeitung();
  const { id, art } = await params;
  if (!idSchema.safeParse(id).success || !istDokumentart(art)) notFound();
  const d = ladeDokument(getDb(), id, art);
  if (!d) notFound();
  return (
    <Seite typ="formular">
      <Dokumentfueller key={d.version} d={d} />
    </Seite>
  );
}

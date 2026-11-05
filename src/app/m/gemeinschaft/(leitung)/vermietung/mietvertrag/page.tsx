import type { Metadata } from "next";
import { headers } from "next/headers";
import { Seite } from "@/core/seite/Seite";
import { getDb } from "../../../_db/client";
import { requireGemeinschaftHost } from "../../../_lib/host";
import { ladeVorlagenInfo } from "../../../_lib/vermietung";
import { requireLeitung } from "../../../_lib/zugang";
import { Vorlagenverwaltung } from "../../../_ui/vermietung/Vorlagenverwaltung";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verträge der Bar" };

/** Die Vorlagen der Bar (Mietvertrag, Übergabe, Rückgabe) und ihre Felder (IDA-343, IDA-354). */
export default async function VertraegeSeite() {
  requireGemeinschaftHost(await headers());
  await requireLeitung();
  return (
    <Seite typ="uebersicht">
      <Vorlagenverwaltung vorlagen={ladeVorlagenInfo(getDb())} />
    </Seite>
  );
}

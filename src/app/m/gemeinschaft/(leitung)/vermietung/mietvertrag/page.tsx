import type { Metadata } from "next";
import { headers } from "next/headers";
import { Seite } from "@/core/seite/Seite";
import { getDb } from "../../../_db/client";
import { requireGemeinschaftHost } from "../../../_lib/host";
import { ladeVorlageInfo } from "../../../_lib/vermietung";
import { requireLeitung } from "../../../_lib/zugang";
import { Vorlagenverwaltung } from "../../../_ui/vermietung/Vorlagenverwaltung";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mietvertrag der Bar" };

/** Die Vertragsvorlage der Bar und ihr Unterschriftenfeld (IDA-343). */
export default async function MietvertragSeite() {
  requireGemeinschaftHost(await headers());
  await requireLeitung();
  return (
    <Seite typ="formular">
      <Vorlagenverwaltung vorlage={ladeVorlageInfo(getDb())} />
    </Seite>
  );
}

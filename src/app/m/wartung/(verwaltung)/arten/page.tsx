import { getDb } from "../../_db/client";
import { ladeArten, ladePruefarten } from "../../_lib/daten";
import { requireVerwalter } from "../../_lib/zugang";
import { ArtenVerwaltung } from "../../_ui/ArtenVerwaltung";

export const dynamic = "force-dynamic";

/** Gerätearten gelten für alle Gruppen; pflegen darf sie jeder Verwalter (Entscheidung an IDA-307). */
export default async function ArtenSeite() {
  await requireVerwalter();
  const db = getDb();
  return <ArtenVerwaltung arten={ladeArten(db)} katalog={ladePruefarten(db)} />;
}

export const metadata = { title: "Gerätearten und Checklisten" };

import { getDb } from "../../_db/client";
import { stufeAus } from "../../_lib/bestand";
import { ladeSicht } from "../../_lib/daten";
import { heute } from "../../_lib/heute";
import { requireZugang } from "../../_lib/zugang";
import { BestandListe } from "../../_ui/BestandListe";

export const dynamic = "force-dynamic";

/** Bestand je Artikel mit seinen Chargen; `?stufe=` ist die MHD-Kontrolle und das Ziel der Kennzahlen (IDA-382). */
export default async function BestandSeite({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireZugang("/bestand");
  const q = await searchParams;
  const tag = heute();
  const { artikel, orte, chargen } = ladeSicht(getDb(), tag);
  return <BestandListe artikel={artikel} chargen={chargen} orte={orte.filter((o) => o.aktiv)} heute={tag} start={stufeAus(q.stufe)} />;
}

export const metadata = { title: "Bestand" };

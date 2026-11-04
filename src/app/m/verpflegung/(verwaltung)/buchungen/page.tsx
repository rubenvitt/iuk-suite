import { getDb } from "../../_db/client";
import { ladeBuchungen } from "../../_lib/daten";
import { requireZugang } from "../../_lib/zugang";
import { BuchungenListe } from "../../_ui/BuchungenListe";

export const dynamic = "force-dynamic";

export default async function BuchungenSeite() {
  await requireZugang("/buchungen");
  return <BuchungenListe zeilen={ladeBuchungen(getDb(), 2000)} />;
}

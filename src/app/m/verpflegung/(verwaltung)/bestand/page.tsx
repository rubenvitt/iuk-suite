import { getDb } from "../../_db/client";
import { ladeSicht } from "../../_lib/daten";
import { heute } from "../../_lib/heute";
import { requireZugang } from "../../_lib/zugang";
import { ChargenListe } from "../../_ui/ChargenListe";

export const dynamic = "force-dynamic";

export default async function BestandSeite() {
  await requireZugang("/bestand");
  return <ChargenListe titel="Bestand" chargen={ladeSicht(getDb(), heute()).chargen} />;
}

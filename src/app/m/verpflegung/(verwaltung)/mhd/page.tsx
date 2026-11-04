import { getDb } from "../../_db/client";
import { ladeSicht } from "../../_lib/daten";
import { heute } from "../../_lib/heute";
import { requireZugang } from "../../_lib/zugang";
import { ChargenListe } from "../../_ui/ChargenListe";

export const dynamic = "force-dynamic";

/** Die MHD-Kontrolle: alles, was rot oder gelb ist. Ziel des Eintrags in „Was steht an“ (`_lib/faelligkeiten.ts`). */
export default async function MhdSeite() {
  await requireZugang("/mhd");
  return <ChargenListe titel="MHD-Kontrolle" chargen={ladeSicht(getDb(), heute()).chargen} kontrolle />;
}

export const metadata = { title: "MHD-Kontrolle" };

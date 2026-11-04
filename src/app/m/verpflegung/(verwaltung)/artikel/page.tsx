import { getDb } from "../../_db/client";
import { bestandJeArtikel, ladeSicht } from "../../_lib/daten";
import { heute } from "../../_lib/heute";
import { requireZugang } from "../../_lib/zugang";
import { ArtikelVerwaltung } from "../../_ui/ArtikelVerwaltung";

export const dynamic = "force-dynamic";

export default async function ArtikelSeite() {
  await requireZugang("/artikel");
  const { artikel, chargen } = ladeSicht(getDb(), heute());
  return <ArtikelVerwaltung artikel={artikel} bestand={Object.fromEntries(bestandJeArtikel(chargen))} />;
}

export const metadata = { title: "Artikel" };

import { headers } from "next/headers";
import { getDb } from "../../_db/client";
import { fahrzeugAuswahl, stammHelfer, tempAlsPlanHelfer } from "../../_lib/bestand";
import { allePlanungen } from "../../_lib/daten";
import { requireSchichtplanHost } from "../../_lib/host";
import { pruefe } from "../../_lib/pruefung";
import type { PlanungKurz } from "../../_lib/typen";
import { requireSchichtplanZugang } from "../../_lib/zugang";
import { Planungsliste } from "../../_ui/Planungsliste";

export const dynamic = "force-dynamic";

/** Alle Planungen mit Kennzahlen; die Prüfregeln laufen hier auf dem Server, im Editor live im Browser. */
export default async function SchichtplanStart() {
  requireSchichtplanHost(await headers());
  await requireSchichtplanZugang();
  const stamm = stammHelfer();
  const liste: PlanungKurz[] = allePlanungen(getDb()).map((p) => {
    const a = pruefe(p, [...stamm, ...tempAlsPlanHelfer(p.temporaere)]);
    return {
      id: p.id, name: p.name, art: p.art, ort: p.ort, von: p.von, bis: p.bis, einheiten: p.einheiten.length, schichten: p.schichten.length,
      soll: a.soll, ist: a.ist, offen: a.luecken.reduce((n, l) => n + l.fehlen, 0), konflikte: a.konflikte.length,
    };
  });
  return <Planungsliste liste={liste} fahrzeuge={fahrzeugAuswahl()} />;
}

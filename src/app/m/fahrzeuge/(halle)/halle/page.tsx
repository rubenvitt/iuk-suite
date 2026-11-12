import { headers } from "next/headers";
import { getDb } from "../../_db/client";
import { ladeAkten } from "../../_lib/akte/daten";
import { heute } from "../../_lib/akte/heute";
import { auswerten } from "../../_lib/akte/regeln";
import type { AkteMitStand } from "../../_lib/akte/typen";
import { requireFahrzeugeHost } from "../../_lib/host";
import { requireFahrzeugeZugang } from "../../_lib/zugang";
import { Hallentafel } from "../../_ui/akte/Hallentafel";

export const dynamic = "force-dynamic";

/**
 * Die Hallentafel (IDA-299), äußerer Pfad `/halle`. Nur lesend. Gerechnet wird bei jedem Abruf neu; die
 * Seite holt sich selbst etwa jede Minute frisch (`HallenUhr`), so wechselt auch der Tag ohne Zutun.
 */
export default async function HallentafelSeite() {
  requireFahrzeugeHost(await headers());
  await requireFahrzeugeZugang();
  const tag = heute();
  const liste: AkteMitStand[] = ladeAkten(getDb()).map((akte) => ({ akte, stand: auswerten(akte, tag) }));
  return <Hallentafel liste={liste} />;
}

export const metadata = { title: "Hallentafel" };

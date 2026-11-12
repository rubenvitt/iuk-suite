import { headers } from "next/headers";
import { Seite } from "@/core/seite/Seite";
import { getDb } from "../../_db/client";
import { ladeAkten } from "../../_lib/akte/daten";
import { heute } from "../../_lib/akte/heute";
import { auswerten } from "../../_lib/akte/regeln";
import type { AkteMitStand } from "../../_lib/akte/typen";
import { requireFahrzeugeHost } from "../../_lib/host";
import { requireFahrzeugeZugang } from "../../_lib/zugang";
import { Fahrzeugtafel } from "../../_ui/akte/Fahrzeugtafel";

export const dynamic = "force-dynamic";

/**
 * Die Fahrzeugtafel (IDA-299): alle Fahrzeuge im Dienst mit ihren Ständen. Gerechnet wird hier auf dem
 * Server, mit dem heutigen Tag der Suite-Zone; die Insel bekommt fertige, serialisierbare Akten (Falle 9).
 * Lesen darf, wer Zugang zum Modul hat. Die Riegel stehen hier noch einmal: eine Route Group ist keine
 * Sicherheitsgrenze.
 */
export default async function FahrzeugtafelSeite() {
  requireFahrzeugeHost(await headers());
  await requireFahrzeugeZugang();
  const tag = heute();
  const liste: AkteMitStand[] = ladeAkten(getDb()).map((akte) => ({ akte, stand: auswerten(akte, tag) }));
  return (
    <Seite typ="liste">
      <Fahrzeugtafel liste={liste} />
    </Seite>
  );
}

export const metadata = { title: "Fahrzeugtafel" };

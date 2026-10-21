import { getDb } from "../../../_db/client";
import { statistikDaten } from "../../../_lib/lesepfade/statistik";
import { zeitraumAus } from "../../../_lib/statistik/zeitraum";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { StatistikFlaeche } from "./StatistikFlaeche";

export const dynamic = "force-dynamic";

/**
 * IDA-261 — Verbrauch, Nachschub und Verfall ueber Monate.
 *
 * Der Zugang haengt am Layout von `(arbeit)` (Host- und Admin-Riegel); die
 * Seite selbst liest nur. Was „Verbrauch" heisst, steht im Kopf von
 * `_lib/lesepfade/statistik.ts`.
 */
export default async function StatistikSeite({
  searchParams,
}: {
  searchParams: Promise<{ monate?: string | string[] }>;
}) {
  const zeitraum = zeitraumAus((await searchParams).monate);
  return (
    <>
      <SeitenKopf
        titel="Statistik"
        beschreibung="Verbrauch, Nachschub an die Einheiten und Verfall. Gerechnet aus dem Journal."
      />
      <StatistikFlaeche daten={statistikDaten(getDb(), zeitraum)} zeitraum={zeitraum} />
    </>
  );
}

import { headers } from "next/headers";
import { zeitFormat } from "@/core/zeit";
import { DRUCK_PARAM, eingabeAusParam } from "../_lib/druckLink";
import { requireUnterkunftHost } from "../_lib/host";
import { rechne } from "../_lib/rechner";
import { requireUnterkunftSitzung } from "../_lib/zugang";
import { Druckblatt } from "../_ui/Druckblatt";
import { Drucken } from "../_ui/Drucken";
import d from "../_ui/druck.module.css";

export const dynamic = "force-dynamic";

const ERSTELLT = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Das Druckblatt, ohne Hülle: rechnet die Eingabe aus dem Link mit demselben Kern wie der Rechner. */
export default async function UnterkunftDruck({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  requireUnterkunftHost(await headers());
  await requireUnterkunftSitzung();
  const eingabe = eingabeAusParam((await searchParams)[DRUCK_PARAM]);
  return (
    <main className={d.seite}>
      {eingabe ? (
        <>
          <Drucken sofort />
          <Druckblatt eingabe={eingabe} er={rechne(eingabe)} erstellt={ERSTELLT.format(new Date())} />
        </>
      ) : (
        <p className={d.leer} role="status">Diese Berechnung lässt sich nicht lesen.</p>
      )}
    </main>
  );
}

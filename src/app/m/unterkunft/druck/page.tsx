import { headers } from "next/headers";
import { DruckTitel } from "@/core/druck/DruckTitel";
import { druckTitel } from "@/core/druck/titel";
import { zeitFormat } from "@/core/zeit";
import { DRUCK_PARAM, eingabeAusParam } from "../_lib/druckLink";
import { requireUnterkunftHost } from "../_lib/host";
import { rechne } from "../_lib/rechner";
import { requireUnterkunftSitzung } from "../_lib/zugang";
import { Druckblatt } from "../_ui/Druckblatt";
import { Drucken } from "../_ui/Drucken";
import d from "../_ui/druck.module.css";

export const dynamic = "force-dynamic";

const ZAHL = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const ERSTELLT = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Das Druckblatt, ohne Hülle: rechnet die Eingabe aus dem Link mit demselben Kern wie der Rechner. */
export default async function UnterkunftDruck({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  requireUnterkunftHost(await headers());
  await requireUnterkunftSitzung();
  const eingabe = eingabeAusParam((await searchParams)[DRUCK_PARAM]);
  const er = eingabe ? rechne(eingabe) : null;
  const jetzt = new Date();
  return (
    <main className={d.seite}>
      {eingabe && er ? (
        <>
          <DruckTitel titel={druckTitel(["Notunterkunft Bedarf", `${ZAHL.format(er.personen)} ${er.weg === "personen" ? "Personen" : "Plätze"}`], jetzt.getTime())} />
          <Drucken sofort />
          <Druckblatt eingabe={eingabe} er={er} erstellt={ERSTELLT.format(jetzt)} />
        </>
      ) : (
        <p className={d.leer} role="status">Diese Berechnung lässt sich nicht lesen.</p>
      )}
    </main>
  );
}

export const metadata = { title: "Druck" };

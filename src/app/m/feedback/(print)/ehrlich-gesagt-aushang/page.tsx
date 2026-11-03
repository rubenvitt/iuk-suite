import { headers } from "next/headers";
import { getDb } from "../../_db/client";
import { einwurfUrlAus } from "../../_lib/ehrlich/adresse";
import { kastenSecret } from "../../_lib/ehrlich/daten";
import { ladeLeserNamen, namensreihe } from "../../_lib/ehrlich/leser";
import { requireEhrlichLeser } from "../../_lib/ehrlich/zugang";
import { Drucken } from "../aushang/[groupId]/Drucken";

/** Der Aushang von „Ehrlich gesagt" (IDA-314) — gleiche Bauform wie der Dienstabend-Aushang (`druck.css`). */
export default async function EhrlichAushang() {
  await requireEhrlichLeser("/m/feedback/ehrlich-gesagt-aushang");
  const secret = kastenSecret(getDb());
  const url = einwurfUrlAus(await headers(), secret);
  const leser = await ladeLeserNamen();
  return (
    <main className="fb-aushang">
      <div className="fb-aushang-fahne" aria-hidden="true" />
      <h1 className="fb-aushang-frage">Ehrlich gesagt</h1>
      <p className="fb-aushang-gruppe">Was liegt dir auf dem Herzen?</p>
      <div className="fb-aushang-qr">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/k/${secret}/qr.png?w=1024`} alt="" />
      </div>
      <p className="fb-aushang-url">{url}</p>
      <p className="fb-aushang-zeile">Jederzeit · anonym oder mit Namen</p>
      <footer className="fb-aushang-fuss">
        <span>{leser.length > 0 ? `Es lesen nur: ${namensreihe(leser)}` : ""}</span>
        <span className="fb-aushang-wortzeichen">IDA</span>
      </footer>
      <Drucken />
    </main>
  );
}

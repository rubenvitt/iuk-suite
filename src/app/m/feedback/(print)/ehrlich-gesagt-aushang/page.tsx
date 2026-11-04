import { headers } from "next/headers";
import { getDb } from "../../_db/client";
import { einwurfUrlAus } from "../../_lib/ehrlich/adresse";
import { kastenSecret } from "../../_lib/ehrlich/daten";
import { requireEhrlichLeser } from "../../_lib/ehrlich/zugang";
import { Drucken } from "../aushang/[groupId]/Drucken";

/** Der Aushang von „Ehrlich gesagt" (IDA-314) — gleiche Bauform wie der Dienstabend-Aushang (`druck.css`). Ohne Lesernamen: die stehen nur online (Ruben 2026-11-04). */
export default async function EhrlichAushang() {
  await requireEhrlichLeser("/m/feedback/ehrlich-gesagt-aushang");
  const secret = kastenSecret(getDb());
  const url = einwurfUrlAus(await headers(), secret);
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
      <Drucken />
    </main>
  );
}

export const metadata = { title: "Aushang Ehrlich gesagt" };

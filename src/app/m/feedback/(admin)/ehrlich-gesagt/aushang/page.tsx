import "../../../_ui/ehrlich.css";
import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../../../_db/client";
import { einwurfUrlAus } from "../../../_lib/ehrlich/adresse";
import { kastenSecret } from "../../../_lib/ehrlich/daten";
import { ladeLeserNamen } from "../../../_lib/ehrlich/leser";
import { requireEhrlichLeser } from "../../../_lib/ehrlich/zugang";
import { EhrlichAushang } from "../../../_ui/EhrlichAushang";

/** QR-Code, Adresse und Lesende des Kastens; „Link neu erzeugen" macht gedruckte Aushänge ungültig. */
export default async function EhrlichAushangSeite() {
  await requireEhrlichLeser("/m/feedback/ehrlich-gesagt/aushang");
  const secret = kastenSecret(getDb());
  return (
    <div style={{ maxWidth: 820 }}>
      <Seitenkopf titel="QR-Code und Aushang" zurueck={{ titel: "Ehrlich gesagt", href: "/ehrlich-gesagt" }} />
      <EhrlichAushang url={einwurfUrlAus(await headers(), secret)} secret={secret} leser={await ladeLeserNamen()} />
    </div>
  );
}

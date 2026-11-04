import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { NEWSREADER_KLASSE } from "../f/[slugSecret]/Zustaende";
import { abholenPfad, istEhrlichEinstieg } from "../_lib/ehrlich/adresse";
import { einwerfenOeffentlichAktion } from "../_lib/ehrlich/aktionen";
import { ladeLeserNamen, namensreihe } from "../_lib/ehrlich/leser";
import { EHRLICH_THEMEN } from "../_lib/ehrlich/themen";
import { turnstileSiteKey } from "../_lib/ehrlich/turnstile";
import { Einwurf } from "./[secret]/Einwurf";

export const metadata: Metadata = { title: { absolute: "Ehrlich gesagt" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * DER ÖFFENTLICHE EINWURF (IDA-340, Entscheidung 2026-11-04): ohne Secret, nur über den Einstiegshost
 * (`SUITE_EINSTIEG_HOST_EHRLICH`, lokal `ehrlich-gesagt.localtest.me`). Auf jedem anderen Host 404, damit
 * `/k` auf dem Modulhost den Secret-Link nicht aushebelt. Gegen Bots: Honigtopf und Turnstile.
 */
export default async function OeffentlicherEinwurf() {
  const kopf = await headers();
  if (!istEhrlichEinstieg(kopf)) notFound();
  const leser = await ladeLeserNamen();
  return (
    <Einwurf
      aktion={einwerfenOeffentlichAktion}
      themen={[...EHRLICH_THEMEN]}
      leser={leser.length > 0 ? namensreihe(leser) : null}
      leserOder={leser.length > 0 ? namensreihe(leser, "oder") : null}
      schrift={NEWSREADER_KLASSE}
      abholen={abholenPfad(kopf)}
      turnstile={turnstileSiteKey()}
    />
  );
}

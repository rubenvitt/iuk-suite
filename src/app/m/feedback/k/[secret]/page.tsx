import type { Metadata } from "next";
import { headers } from "next/headers";
import { getDb } from "../../_db/client";
import { NEWSREADER_KLASSE } from "../../f/[slugSecret]/Zustaende";
import s from "../../f/[slugSecret]/zettel.module.css";
import { abholenPfad } from "../../_lib/ehrlich/adresse";
import { einwerfenAktion } from "../../_lib/ehrlich/aktionen";
import { istKastenSecret } from "../../_lib/ehrlich/daten";
import { ladeLeserNamen, namensreihe } from "../../_lib/ehrlich/leser";
import { EHRLICH_THEMEN } from "../../_lib/ehrlich/themen";
import { turnstileSiteKey } from "../../_lib/ehrlich/turnstile";
import { Blatt } from "../Blatt";
import { Einwurf } from "./Einwurf";

export const metadata: Metadata = { title: "Ehrlich gesagt", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * DER EINWURF VON „EHRLICH GESAGT" (IDA-314) — öffentlich, ohne Anmeldung, über den Link auf dem Aushang.
 * Ein falscher oder alter Link zeigt nur, dass er nicht gilt; ob es den Kasten gibt, verrät er nicht.
 */
export default async function EinwurfSeite({ params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  if (!istKastenSecret(getDb(), secret)) {
    return (
      <Blatt titel="Dieser Link gilt nicht mehr." schrift={NEWSREADER_KLASSE}>
        <div className={`${s.zustand} ${s.aufbau}`}>
          <p className={s.text}>Nimm den QR-Code vom aktuellen Aushang.</p>
        </div>
      </Blatt>
    );
  }
  const leser = await ladeLeserNamen();
  return (
    <Einwurf
      aktion={einwerfenAktion.bind(null, secret)}
      themen={[...EHRLICH_THEMEN]}
      leser={leser.length > 0 ? namensreihe(leser) : null}
      leserOder={leser.length > 0 ? namensreihe(leser, "oder") : null}
      schrift={NEWSREADER_KLASSE}
      abholen={abholenPfad(await headers())}
      turnstile={turnstileSiteKey()}
    />
  );
}

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "../_db/client";
import { requireLagerbuchHost } from "../_lib/host";
import { demoCheckDaten } from "../_lib/lesepfade/demo";
import { DEMO_PFAD } from "../_lib/demoCheck";
import { verfallSchwellen } from "../_lib/domain/verfall";
import { einWert } from "../_lib/suchparameter";
import { CheckArtWahl } from "../_ui/CheckArtWahl";
import { CheckFlow } from "../_ui/CheckFlow";
import s from "../_ui/helfer.module.css";

/**
 * DER DEMO-CHECK — IDA-224, voruebergehend fuer die Kommandositzung am
 * 20.10.2026 (Rueckbau: IDA-225). Kopf und Begruendung: `_lib/demoCheck.ts`.
 *
 * ⚠️ KEIN HELFER-ZUGANG. Die Seite ruft weder `requireHelferSitzung` noch
 * setzt sie ein Cookie: der QR-Code steht auf einer Folie vor vielen Leuten.
 * Sie zeigt ausschliesslich den Check des Demo-Fahrzeugs und fuehrt nirgends
 * sonst hin — deshalb der eigene Rahmen ohne Reiterleiste.
 *
 * Erst der Host, dann der Schalter; ist die Demo aus, gibt es 404. Kein
 * `loading.tsx` darueber (Falle 23), sonst waere das 404 ein HTTP 200.
 */
export const dynamic = "force-dynamic";

export default async function DemoSeite({
  searchParams,
}: {
  searchParams: Promise<{ art?: string | string[] }>;
}) {
  requireLagerbuchHost(await headers());
  const daten = demoCheckDaten(getDb());
  if (!daten) notFound();
  const art = einWert((await searchParams).art);

  return (
    <div className={s.rahmen}>
      <div className={s.streifen} data-rolle="lb-streifen" />
      <header className={s.kopf}>
        <div>
          <div className={s.marke}>
            LAGER<span className={s.markeAkzent}>BUCH</span>
          </div>
          <div className={s.etikett} data-rolle="demo-hinweis">Demo · es wird nichts gespeichert</div>
        </div>
      </header>
      <main className={s.inhalt}>
        {art === "kurz" || art === "voll" ? (
          <CheckFlow
            demo
            fahrzeug={daten.fahrzeug}
            art={art}
            soll={daten.soll}
            stichprobe={art === "kurz" ? daten.stichprobe : null}
            versiegelt={{}}
            plomben={[]}
            geraete={[]}
            flaschen={[]}
            verfall={{}}
            warn={verfallSchwellen()}
            andereEinheitErreichbar={false}
            kontoZugang={false}
            letzterCheckText={null}
          />
        ) : (
          <CheckArtWahl
            pfad={DEMO_PFAD}
            fahrzeug={daten.fahrzeug}
            gescannt={undefined}
            kurz={{
              positionen: Object.keys(daten.stichprobe).length,
              plomben: 0,
              abgedeckt: 0,
              gesamt: daten.soll.length,
            }}
            plombenGesamt={0}
            letzterCheckText={null}
          />
        )}
      </main>
    </div>
  );
}

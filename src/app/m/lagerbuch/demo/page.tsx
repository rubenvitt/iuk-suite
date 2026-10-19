import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "../_db/client";
import { requireLagerbuchHost } from "../_lib/host";
import { DEMO_PLOMBE_NUMMER, DEMO_TASCHE, demoCheckDaten } from "../_lib/lesepfade/demo";
import { plombenNummerNorm } from "../_lib/plombe";
import { DEMO_PFAD } from "../_lib/demoCheck";
import { verfallSchwellen } from "../_lib/domain/verfall";
import { einWert } from "../_lib/suchparameter";
import { ENTNAHMEBOX_NAME } from "../_lib/konstanten";
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
          <>
            {/*
              IDA-248: Die Plombe haengt im Ernstfall am Behaelter und traegt ihre
              Nummer. In der Demo gibt es keinen Behaelter — die Nummer steht
              deshalb hier, und wer sich vertippt, sieht den Weg „Plombe offen".
            */}
            <div className={`${s.karte} ${s.kartePad}`} data-rolle="demo-plombe">
              <p className={s.fussnote} style={{ margin: 0 }}>
                {art === "kurz" ? (
                  <>
                    <b>Für die Demo:</b> Auf der Plombe der {DEMO_TASCHE} steht <b>{DEMO_PLOMBE_NUMMER}</b>.
                    Tipp eine andere Nummer ein, und du zählst die Tasche mit.
                  </>
                ) : (
                  <>
                    <b>Für die Demo:</b> Am Ende setzt du eine neue Plombe auf die {DEMO_TASCHE} –
                    jede Nummer geht.
                  </>
                )}
              </p>
            </div>
            <CheckFlow
              demo
              fahrzeug={daten.fahrzeug}
              art={art}
              soll={daten.soll}
              stichprobe={art === "kurz" ? daten.stichprobe : null}
              versiegelt={art === "kurz" ? daten.versiegelt : {}}
              plomben={[{
                id: daten.plombe.id,
                bezeichnung: daten.plombe.bezeichnung,
                fachLabel: daten.plombe.fachLabel,
                // Wie `helfer/check/page.tsx`: nur der Kurzcheck vergleicht.
                erwartet: art === "kurz" ? plombenNummerNorm(daten.plombe.nummer) : null,
              }]}
              geraete={daten.geraete}
              flaschen={daten.flaschen}
              verfall={daten.verfall}
              warn={verfallSchwellen()}
              andereEinheitErreichbar={false}
              kontoZugang={false}
              letzterCheckText={daten.letzterCheckText}
              // IDA-247: die Demo zeigt den Vorschlag fuer die Kiste mit — gebucht
              // wird ohnehin nichts.
              entnahmebox={{ name: ENTNAHMEBOX_NAME }}
            />
          </>
        ) : (
          <CheckArtWahl
            pfad={DEMO_PFAD}
            fahrzeug={daten.fahrzeug}
            gescannt={undefined}
            kurz={{
              positionen: Object.keys(daten.stichprobe).length,
              plomben: 1,
              abgedeckt: 0,
              gesamt: daten.soll.length,
            }}
            plombenGesamt={1}
            letzterCheckText={daten.letzterCheckText}
          />
        )}
      </main>
    </div>
  );
}

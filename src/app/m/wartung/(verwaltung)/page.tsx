import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "antd";
import { Kennzahl, Kennzahlen } from "@/core/kennzahl/Kennzahl";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../_db/client";
import { gruppenAuswahl } from "../_lib/ansicht";
import { faelligeFristen, ladeGeraete, ladeGruppen, ladeMaengel } from "../_lib/daten";
import { STUFE_TEXT, WER_TEXT } from "../_lib/fristen";
import { geraeteHref, passtGeraet, zahlwort } from "../_lib/geraeteFilter";
import { heute } from "../_lib/heute";
import { istVerwalter, requireZugang } from "../_lib/zugang";
import { GruppenFilter } from "../_ui/GruppenFilter";
import { Kicker, ZustandChip } from "../_ui/teile";
import s from "../_ui/wartung.module.css";

export const dynamic = "force-dynamic";

/** Eine Kennzahl, die zu ihrer Liste führt; bei null kein Befund (kein Punkt). */
function Kpi({ zahl, text, farbe, href }: { zahl: number; text: string; farbe: "rot" | "gelb"; href: string }) {
  return <Kennzahl wert={zahl} label={text} ton={zahl === 0 ? undefined : farbe === "rot" ? "fehler" : "warnung"} href={href} />;
}

/** Übersicht der Verwalter: was fällig ist und was nicht einsatzbereit ist. Wer nichts verwaltet, prüft. */
export default async function Uebersicht({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rechte } = await requireZugang();
  if (!istVerwalter(rechte)) redirect("/geraete");
  const db = getDb();
  const auswahl = gruppenAuswahl(rechte, ladeGruppen(db), (await searchParams).gruppe);
  const geraete = ladeGeraete(db, { gruppen: auswahl.gruppen, heute: heute() });
  const faellig = faelligeFristen(geraete);
  const nichtOk = geraete.filter((g) => g.zustand !== "ok");
  const offen = ladeMaengel(db, { gruppen: auswahl.gruppen, offen: true }).length;
  const gruppe = auswahl.gewaehlt;
  // IDA-381: jede Kennzahl zählt mit dem Prädikat, mit dem ihre Liste filtert — und zählt Geräte, weil die
  // Liste Geräte zeigt (ein Gerät mit zwei überfälligen Fristen ist eine Zeile).
  const anzahl = (f: Parameters<typeof passtGeraet>[1]) => geraete.filter((g) => passtGeraet(g, f)).length;
  const ueber = anzahl({ frist: "ueberfaellig", zustand: null });
  const bald = anzahl({ frist: "bald", zustand: null });
  const defekt = anzahl({ frist: null, zustand: "defekt" });

  return (
    <>
      <Seitenkopf titel="Übersicht" aktionen={<GruppenFilter wahl={auswahl.wahl} gewaehlt={auswahl.gewaehlt} />} />
      <Kennzahlen aria-label="Lage">
        <Kpi zahl={ueber} text={`${zahlwort(ueber, "Gerät", "Geräte")} mit überfälliger Frist`} farbe="rot" href={geraeteHref({ gruppe, frist: "ueberfaellig" })} />
        <Kpi zahl={bald} text={`${zahlwort(bald, "Gerät", "Geräte")} bald fällig`} farbe="gelb" href={geraeteHref({ gruppe, frist: "bald" })} />
        <Kpi zahl={defekt} text={`${zahlwort(defekt, "Gerät", "Geräte")} nicht einsatzbereit`} farbe="rot" href={geraeteHref({ gruppe, zustand: "defekt" })} />
        <Kpi zahl={offen} text={zahlwort(offen, "Mangel offen", "Mängel offen")} farbe="gelb" href={gruppe ? `/maengel?gruppe=${gruppe}` : "/maengel"} />
      </Kennzahlen>
      <Card title="Was steht an">
        {faellig.length === 0 ? (
          <p className={s.neben} style={{ margin: 0 }}>Alles im Plan.</p>
        ) : (
          <ul className={s.zeilen} aria-label="Fällige Fristen">
            {faellig.map(({ geraet: g, frist: f }) => (
              <li key={g.id + f.vorlage.id}>
                <Link href={`/geraete/${g.id}`} className={s.zeile}>
                  {/* Wie „Was steht an“ im Portal (IDA-381): ohne Versalien, die Dringlichkeit als Wort. */}
                  <Kicker leise className={f.stufe === "ueberfaellig" ? s.kickerTinte : undefined}>
                    {STUFE_TEXT[f.stufe]} · {f.vorlage.name} · {g.gruppeName}
                  </Kicker>
                  <div><strong>{g.name}</strong> <span className={s.neben}>· {g.ort}</span></div>
                  <div className={s.neben}>{f.text}{f.vorlage.wer !== "intern" ? ` · ${WER_TEXT[f.vorlage.wer]}` : ""}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Nicht einsatzbereit oder mit Mangel">
        {nichtOk.length === 0 ? (
          <p className={s.neben} style={{ margin: 0 }}>Alle Geräte einsatzbereit.</p>
        ) : (
          <ul className={s.zeilen} aria-label="Nicht einsatzbereit oder mit Mangel">
            {nichtOk.map((g) => (
              <li key={g.id}>
                <Link href={`/geraete/${g.id}`} className={`${s.zeile} ${s.quer}`}>
                  <span><strong>{g.name}</strong> <span className={s.neben}>· {g.ort}</span></span>
                  <ZustandChip z={g.zustand} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

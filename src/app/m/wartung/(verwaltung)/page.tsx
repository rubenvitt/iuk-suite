import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../_db/client";
import { gruppenAuswahl } from "../_lib/ansicht";
import { faelligeFristen, ladeGeraete, ladeGruppen, ladeMaengel } from "../_lib/daten";
import { WER_TEXT } from "../_lib/fristen";
import { heute } from "../_lib/heute";
import { istVerwalter, requireAngemeldet } from "../_lib/zugang";
import { GruppenFilter } from "../_ui/GruppenFilter";
import { Kicker, ZustandChip } from "../_ui/teile";
import s from "../_ui/wartung.module.css";

export const dynamic = "force-dynamic";

function Kpi({ zahl, text, farbe, href }: { zahl: number; text: string; farbe: "rot" | "gelb"; href: string }) {
  const klasse = zahl === 0 ? "" : farbe === "rot" ? s.kpiRot : s.kpiGelb;
  return (
    <Link href={href} className={`${s.kpi} ${klasse}`}>
      <span className={s.kpiZahl}>{zahl}</span>
      <span className={s.neben}>{text}</span>
    </Link>
  );
}

/** Übersicht der Verwalter: was fällig ist und was nicht einsatzbereit ist. Wer nichts verwaltet, prüft. */
export default async function Uebersicht({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rechte } = await requireAngemeldet();
  if (!istVerwalter(rechte)) redirect("/geraete");
  const db = getDb();
  const auswahl = gruppenAuswahl(rechte, ladeGruppen(db), (await searchParams).gruppe);
  const geraete = ladeGeraete(db, { gruppen: auswahl.gruppen, heute: heute() });
  const faellig = faelligeFristen(geraete);
  const ueber = faellig.filter((z) => z.frist.stufe === "ueberfaellig").length;
  const nichtOk = geraete.filter((g) => g.zustand !== "ok");
  const offen = ladeMaengel(db, { gruppen: auswahl.gruppen, offen: true }).length;
  const q = auswahl.gewaehlt ? `?gruppe=${auswahl.gewaehlt}` : "";

  return (
    <>
      <Seitenkopf titel="Übersicht" aktionen={<GruppenFilter wahl={auswahl.wahl} gewaehlt={auswahl.gewaehlt} />} />
      <div className={s.kpis}>
        <Kpi zahl={ueber} text="Fristen überfällig" farbe="rot" href={`/geraete${q}`} />
        <Kpi zahl={faellig.length - ueber} text="Fristen in den nächsten 30 Tagen" farbe="gelb" href={`/geraete${q}`} />
        <Kpi zahl={geraete.filter((g) => g.zustand === "defekt").length} text="Geräte nicht einsatzbereit" farbe="rot" href={`/maengel${q}`} />
        <Kpi zahl={offen} text="Mängel offen" farbe="gelb" href={`/maengel${q}`} />
      </div>
      <Card title="Was steht an">
        {faellig.length === 0 ? (
          <p className={s.neben} style={{ margin: 0 }}>Alles im Plan.</p>
        ) : (
          <ul className={s.zeilen} aria-label="Fällige Fristen">
            {faellig.map(({ geraet: g, frist: f }) => (
              <li key={g.id + f.vorlage.id}>
                <Link href={`/geraete/${g.id}`} className={s.zeile}>
                  <Kicker className={f.stufe === "ueberfaellig" ? s.textRot : s.textGelb}>
                    {f.stufe === "ueberfaellig" ? "Überfällig" : "Bald"} · {f.vorlage.name} · {g.gruppeName}
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
          <ul className={s.zeilen} aria-label="Geräte mit Mangel">
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

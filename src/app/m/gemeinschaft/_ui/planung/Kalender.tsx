"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Calendar, Card } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { beginntAm, eintraegeAmTag, KALENDER_LEGENDE, type KalenderEintrag } from "../../_lib/kalenderTage";
import { kalendertagLang, zeitraumText } from "../../_lib/vorhabenTypen";
import { uhrInZone } from "../../_lib/zeit";
import { tagAusDayjs } from "./datum";
import { useTokensAmBody } from "./fokus";
import s from "./planung.module.css";

const MONAT = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
/** `November 2026` — ein Kalendermonat ohne Zone (Mitternacht UTC, CLAUDE.md „Zeitzone“, Ausnahme). */
const monatText = (d: Dayjs) => MONAT.format(Date.UTC(d.year(), d.month(), 1));

/**
 * Alles der Gemeinschaft auf einen Blick (POC `Kalender`): Events und die Belegung der Bar in einer
 * Monatsansicht, darunter die Liste des gewählten Tages. Die Seite lädt nur das Fenster um den Monat von
 * `heute`/`?tag=`; ein Wechsel in einen anderen Monat geht über die Adresse und lädt neu.
 *
 * Tage rechnen in der Suite-Zone (`eintraegeAmTag`); der `Dayjs` des Kalenders ist nur die Wanduhr.
 * Unter 768px stehen in den Zellen nur Punkte (CSS), die Tagesliste nennt alles mit 44px-Zielen.
 */
export function Kalender({ tag, heute, eintraege }: { tag: string; heute: string; eintraege: KalenderEintrag[] }) {
  useTokensAmBody();
  const router = useRouter();
  const [wert, setWert] = useState<Dayjs>(() => dayjs(tag));
  const gewaehlt = tagAusDayjs(wert);
  const tagesliste = eintraegeAmTag(eintraege, gewaehlt);

  function waehle(d: Dayjs) {
    setWert(d);
    if (tagAusDayjs(d).slice(0, 7) !== tag.slice(0, 7)) router.push(`/kalender?tag=${tagAusDayjs(d)}`, { scroll: false });
  }

  return (
    <div className={s.modul}>
      <Seitenkopf titel="Kalender" />
      <div className={s.legende}>
        {KALENDER_LEGENDE.map((l) => <span key={l.art}><i className={`${s.muster} ${s[l.art]}`} />{l.text}</span>)}
      </div>
      <Card>
        <Calendar
          value={wert}
          onSelect={(d) => waehle(d)}
          headerRender={({ value }) => (
            <div className={s.kalenderKopf}>
              <Button aria-label="Voriger Monat" icon={<Icons8Ikone name="chevron-left" groesse={18} />} onClick={() => waehle(value.subtract(1, "month").startOf("month"))} />
              <span className={s.kalenderMonat} aria-live="polite">{monatText(value)}</span>
              <Button aria-label="Nächster Monat" icon={<Icons8Ikone name="chevron-right" groesse={18} />} onClick={() => waehle(value.add(1, "month").startOf("month"))} />
              <Button onClick={() => waehle(dayjs(heute))}>Heute</Button>
            </div>
          )}
          cellRender={(d, info) => {
            if (info.type !== "date") return info.originNode;
            const iso = tagAusDayjs(d);
            const liste = eintraegeAmTag(eintraege, iso);
            if (liste.length === 0) return null;
            return (
              <div className={s.kalenderZelle}>
                {liste.map((e) => (
                  <Link key={`${e.art}-${e.id}`} href={e.href} className={`${s.eintrag} ${s[e.art]}`} title={`${e.titel} · ${zeitraumText(e.von, e.bis)}`}
                    data-kalender-eintrag={e.art} onClick={(ev) => ev.stopPropagation()}>
                    {beginntAm(e, iso) ? `${uhrInZone(e.von)} ` : "… "}{e.titel}
                  </Link>
                ))}
                <span className={s.punktReihe} aria-hidden="true">
                  {liste.map((e) => <i key={`${e.art}-${e.id}`} className={`${s.punkt} ${s[e.art]}`} />)}
                </span>
              </div>
            );
          }}
        />
      </Card>
      <Card title={kalendertagLang(gewaehlt)}>
        {tagesliste.length === 0 ? <p className={s.neben} style={{ margin: 0 }}>Nichts eingetragen.</p> : (
          <div className={s.tagesliste} data-tagesliste>
            {tagesliste.map((e) => (
              <Link key={`${e.art}-${e.id}`} href={e.href} className={`${s.eintrag} ${s[e.art]}`}>
                <b>{e.titel}</b> · {KALENDER_LEGENDE.find((l) => l.art === e.art)!.text}<br />{zeitraumText(e.von, e.bis)}
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

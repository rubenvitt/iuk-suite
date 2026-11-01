"use client";

import { useMemo, useState } from "react";
import { Button, Card } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { amTag, monatPlus, monatsRaster, monatVon, sichtbar, type Eintrag } from "../../_lib/belegung";
import { anfrageAlsEintrag, sperreAlsEintrag, type AnfrageDTO, type SperrzeitDTO } from "../../_lib/vermietungTypen";
import { monatText, tagText, zeitraumText, ZUSTAND_TEXT } from "../../_lib/vermietungText";
import { tagInZone, uhrInZone } from "../../_lib/zeit";
import { useEntscheidung } from "./Entscheidung";
import { Eintragsflyin } from "./Eintragsflyin";
import { useTokensAmBody } from "./teile";
import s from "./vermietung.module.css";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
/** So viele Einträge stehen in einer Zelle; der Rest als „+n“ (die Tagesliste zeigt alle). */
const JE_ZELLE = 3;

/**
 * Belegung der Bar für die Leitung: Monatskalender mit allen sichtbaren Einträgen (angefragt, zugesagt,
 * gesperrt), darunter die Liste des gewählten Tages; ein Eintrag öffnet das Flyin. Eigenes Raster statt antds
 * `Calendar`: der rechnet mit dayjs in der Gerätezone, die Belegung aber in der Suite-Zone.
 */
export function Belegungsansicht({ anfragen, sperren, heute }: { anfragen: AnfrageDTO[]; sperren: SperrzeitDTO[]; heute: string }) {
  useTokensAmBody();
  const entscheidung = useEntscheidung();
  const [tag, setTag] = useState(heute);
  const [monat, setMonat] = useState(monatVon(heute));
  const [offenId, setOffenId] = useState<string | null>(null);
  const alle = useMemo(() => [...anfragen.map(anfrageAlsEintrag), ...sperren.map(sperreAlsEintrag)], [anfragen, sperren]);
  const anzeigen = useMemo(() => alle.filter(sichtbar), [alle]);
  const offen = offenId ? alle.find((e) => e.id === offenId) ?? null : null;
  const zellen = monatsRaster(monat);
  const tagesliste = amTag(anzeigen, tag);

  const beginn = (e: Eintrag, d: string) => (tagInZone(e.von) === d ? `${uhrInZone(e.von)} ` : "… ");

  return (
    <div className={s.modul}>
      <Seitenkopf titel="Belegung" beschreibung="Tag oder Eintrag antippen öffnet die Einzelheiten. Für Externe ohne Anmeldung steht im Kalender nur „frei“ oder „belegt“." />
      <div className={s.legende} aria-hidden="true">
        <span><i className={s.muster} />frei</span>
        <span><i className={`${s.muster} ${s.angefragt}`} />angefragt</span>
        <span><i className={`${s.muster} ${s.zugesagt}`} />zugesagt</span>
        <span><i className={`${s.muster} ${s.gesperrt}`} />gesperrt</span>
      </div>
      <div className={s.monatKopf}>
        <Button aria-label="Vorheriger Monat" icon={<Icons8Ikone name="chevron-left" groesse={18} />} onClick={() => setMonat(monatPlus(monat, -1))} />
        <span className={s.monatTitel} aria-live="polite">{monatText(monat)}</span>
        <div className={s.zeile}>
          <Button onClick={() => { setMonat(monatVon(heute)); setTag(heute); }}>Heute</Button>
          <Button aria-label="Nächster Monat" icon={<Icons8Ikone name="chevron-right" groesse={18} />} onClick={() => setMonat(monatPlus(monat, 1))} />
        </div>
      </div>
      <div className={s.raster}>
        {WOCHENTAGE.map((w) => <div key={w} className={s.wt}>{w}</div>)}
        {zellen.map((d, i) => {
          if (!d) return <div key={`l${i}`} className={`${s.zelle} ${s.aussen}`} aria-hidden="true" />;
          const liste = amTag(anzeigen, d);
          return (
            <div key={d} data-tag={d} className={[s.zelle, d === tag && s.gewaehlt, d === heute && s.heute].filter(Boolean).join(" ")} onClick={() => setTag(d)}>
              <button type="button" className={s.tagnummer} aria-label={`${tagText(d)}, ${liste.length ? `${liste.length} Einträge` : "frei"}`} aria-pressed={d === tag} onClick={(ev) => { ev.stopPropagation(); setTag(d); }}>
                {Number(d.slice(8))}
              </button>
              {liste.slice(0, JE_ZELLE).map((e) => (
                <button key={e.id} type="button" className={`${s.eintrag} ${s[e.zustand]}`} title={`${e.titel} · ${zeitraumText(e.von, e.bis)}`}
                  aria-label={`${ZUSTAND_TEXT[e.zustand]}: ${e.titel}`} onClick={(ev) => { ev.stopPropagation(); setTag(d); setOffenId(e.id); }}>
                  {beginn(e, d)}{e.titel}
                </button>
              ))}
              {liste.length > JE_ZELLE ? <span className={s.mehr}>+{liste.length - JE_ZELLE}</span> : null}
            </div>
          );
        })}
      </div>
      <Card title={tagText(tag, true)}>
        {tagesliste.length === 0 ? <span className={s.neben}>Nichts eingetragen, die Bar ist frei.</span> : (
          <div className={s.tagesliste} data-testid="tagesliste">
            {tagesliste.map((e) => (
              <button key={e.id} type="button" className={`${s.tageszeile} ${s[e.zustand]}`} onClick={() => setOffenId(e.id)}>
                <span><b>{e.titel}</b> · {ZUSTAND_TEXT[e.zustand]}</span>
                <span className={s.neben}>{zeitraumText(e.von, e.bis)}</span>
              </button>
            ))}
          </div>
        )}
      </Card>
      <Eintragsflyin eintrag={offen} anfragen={anfragen} eintraege={alle} schliessen={() => setOffenId(null)} entscheidung={entscheidung} />
      {entscheidung.dialog}
    </div>
  );
}

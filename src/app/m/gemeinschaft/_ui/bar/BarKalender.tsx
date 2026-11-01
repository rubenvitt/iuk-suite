"use client";

import { useState } from "react";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { amTag, monatPlus, monatsRaster, monatVon, type Belegt } from "../../_lib/belegung";
import { monatText, tagText } from "../../_lib/vermietungText";
import s from "./bar.module.css";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/**
 * Der öffentliche Monatskalender: je Tag nur „frei“ oder „belegt“. Vergangene Tage sind aus, zurückblättern geht
 * bis zum laufenden Monat. Ein Tag antippen wählt ihn; was belegt ist, zeigt die Seite darunter.
 */
export function BarKalender({ belegt, heute, gewaehlt, waehle }: {
  belegt: readonly Belegt[]; heute: string; gewaehlt: string | null; waehle: (tag: string) => void;
}) {
  const [monat, setMonat] = useState(monatVon(gewaehlt ?? heute));
  const zellen = monatsRaster(monat);
  return (
    <div>
      <div className={s.monatKopf}>
        <button type="button" className={s.rund} aria-label="Vorheriger Monat" disabled={monat <= monatVon(heute)} onClick={() => setMonat(monatPlus(monat, -1))}>
          <Icons8Ikone name="chevron-left" groesse={20} />
        </button>
        <span aria-live="polite">{monatText(monat)}</span>
        <button type="button" className={s.rund} aria-label="Nächster Monat" onClick={() => setMonat(monatPlus(monat, 1))}>
          <Icons8Ikone name="chevron-right" groesse={20} />
        </button>
      </div>
      <div className={s.wochentage} aria-hidden="true">{WOCHENTAGE.map((w) => <div key={w}>{w}</div>)}</div>
      <div className={s.tage}>
        {zellen.map((tag, i) => {
          if (!tag) return <div key={`l${i}`} className={`${s.tag} ${s.leer}`} />;
          const vergangen = tag < heute;
          const istBelegt = !vergangen && amTag(belegt, tag).length > 0;
          const kl = [s.tag, vergangen && s.vergangen, istBelegt && s.belegt, tag === heute && s.heute, tag === gewaehlt && s.gewaehlt].filter(Boolean).join(" ");
          return (
            <button key={tag} type="button" className={kl} disabled={vergangen} data-tag={tag} aria-pressed={tag === gewaehlt}
              aria-label={`${tagText(tag)}, ${istBelegt ? "teilweise oder ganz belegt" : "frei"}`} onClick={() => waehle(tag)}>
              <span>{Number(tag.slice(8))}</span>
              {istBelegt ? <span className={s.punkt}>belegt</span> : null}
            </button>
          );
        })}
      </div>
      <div className={s.legende} aria-hidden="true">
        <span><i />frei</span>
        <span><i className={s.schraffur} />belegt</span>
      </div>
    </div>
  );
}

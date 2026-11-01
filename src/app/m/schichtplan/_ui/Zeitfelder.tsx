"use client";

import { useSyncExternalStore } from "react";
import { DatePicker, TimePicker } from "antd";
import deDE from "antd/es/date-picker/locale/de_DE";
import type { Dayjs } from "dayjs";
import "dayjs/locale/de";
import { enterUebernimmtNurDasFeld } from "@/core/formular/enter";
import { WAEHLER_IM_BILD } from "@/core/theme/waehlerImBild";
import { RASTER_MIN } from "../_lib/typen";
import { rasten } from "../_lib/zeit";
import { alsDayjs, ausDayjs } from "./datum";
import s from "./schichtplan.module.css";

export interface Zeitraum { von: number | null; bis: number | null }

/** Auf dem Telefon kein Tippen ins Feld: die Bildschirmtastatur verdeckt sonst das Auswahlfenster. */
const GROB = "(pointer: coarse)";
function abonniere(melden: () => void): () => void {
  const abfrage = window.matchMedia(GROB);
  abfrage.addEventListener("change", melden);
  return () => abfrage.removeEventListener("change", melden);
}
function useBeruehrung(): boolean {
  return useSyncExternalStore(abonniere, () => window.matchMedia(GROB).matches, () => false);
}

/** Tag aus dem Datumsfeld, Uhrzeit aus dem Zeitfeld — als Wanduhr in der Suite-Zone, gerastet. */
function verbinde(tag: Dayjs, uhr: Dayjs): number {
  return rasten(ausDayjs(tag.hour(uhr.hour()).minute(uhr.minute()).second(0).millisecond(0)));
}

/**
 * Beginn und Ende als je ein Datums- und ein Uhrzeitfeld statt eines Bereichswählers mit
 * Zeitspalten: der passt auf dem Telefon nicht in die Breite (Ruben, 01.11.2026). Wer den Beginn
 * verschiebt, verschiebt das Ende mit, die Dauer bleibt.
 */
export function Zeitfelder({ wert, onChange, ohneLeeren }: {
  wert: Zeitraum; onChange: (w: Zeitraum) => void; ohneLeeren?: boolean;
}) {
  const beruehrung = useBeruehrung();
  const von = wert.von === null ? null : alsDayjs(wert.von);
  const bis = wert.bis === null ? null : alsDayjs(wert.bis);

  const setzeBeginn = (tag: Dayjs | null, uhr: Dayjs | null) => {
    if (!tag) { if (!ohneLeeren) onChange({ von: null, bis: wert.bis }); return; }
    const neu = verbinde(tag, uhr ?? tag.hour(8).minute(0));
    const dauer = wert.von !== null && wert.bis !== null ? wert.bis - wert.von : null;
    onChange({ von: neu, bis: dauer !== null ? neu + dauer : wert.bis });
  };
  const setzeEnde = (tag: Dayjs | null, uhr: Dayjs | null) => {
    if (!tag) { if (!ohneLeeren) onChange({ von: wert.von, bis: null }); return; }
    onChange({ von: wert.von, bis: verbinde(tag, uhr ?? von ?? tag.hour(8).minute(0)) });
  };

  const gemeinsam = {
    popupAlign: WAEHLER_IM_BILD,
    locale: deDE,
    inputReadOnly: beruehrung,
    allowClear: !ohneLeeren,
    onKeyDown: enterUebernimmtNurDasFeld,
    style: { width: "100%" },
  };
  const uhrzeit = { format: "HH:mm", minuteStep: RASTER_MIN, needConfirm: false, showNow: false, allowClear: false } as const;

  return (
    <div className={s.zeitfelder}>
      <span className={s.zeitfeldTitel}>Beginn</span>
      <DatePicker {...gemeinsam} popupAlign={WAEHLER_IM_BILD} aria-label="Beginn Datum" placeholder="Datum" format={["DD.MM.YYYY", "D.M.YYYY"]}
        value={von} onChange={(t: Dayjs | null) => setzeBeginn(t, von)} />
      <TimePicker {...gemeinsam} {...uhrzeit} popupAlign={WAEHLER_IM_BILD} aria-label="Beginn Uhrzeit" placeholder="Uhrzeit"
        value={von} disabled={!von} onChange={(u: Dayjs | null) => { if (von && u) setzeBeginn(von, u); }} />
      <span className={s.zeitfeldTitel}>Ende</span>
      <DatePicker {...gemeinsam} popupAlign={WAEHLER_IM_BILD} aria-label="Ende Datum" placeholder="Datum" format={["DD.MM.YYYY", "D.M.YYYY"]}
        value={bis} onChange={(t: Dayjs | null) => setzeEnde(t, bis)} />
      <TimePicker {...gemeinsam} {...uhrzeit} popupAlign={WAEHLER_IM_BILD} aria-label="Ende Uhrzeit" placeholder="Uhrzeit"
        value={bis} disabled={!bis} onChange={(u: Dayjs | null) => { if (bis && u) setzeEnde(bis, u); }} />
    </div>
  );
}

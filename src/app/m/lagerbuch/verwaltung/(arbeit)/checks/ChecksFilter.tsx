"use client";

import { Button, DatePicker, Flex, Select } from "antd";
import dayjs from "dayjs";
import { SPACE } from "@/core/theme/tokens";
import { einheitenartLabel, einheitLabels, type Einheitenart } from "../../../_lib/konstanten";
import { SCHRIFT } from "../../../_lib/schrift";
import { useUrlFilter } from "../../../_ui/useUrlFilter";
import s from "../../../_ui/verwaltung.module.css";

export type FahrzeugOption = {
  value: string;
  label: string;
  keywords: string;
};

/**
 * Das Auswahlfeld findet Einheiten über Namen, Kennzeichen — und die ART
 * (DRK-309): „tasche" findet jede Tasche, auch wenn ihr Name das Wort nicht
 * trägt.
 */
export function fahrzeugFilter(
  eingabe: string,
  option?: FahrzeugOption,
): boolean {
  const suchtext = `${option?.label ?? ""} ${option?.keywords ?? ""}`
    .toLocaleLowerCase("de-DE");
  return suchtext.includes(eingabe.trim().toLocaleLowerCase("de-DE"));
}

export function ChecksFilter({
  fz,
  von,
  bis,
  fahrzeuge,
  hinweise,
}: {
  fz: string;
  von: string;
  bis: string;
  fahrzeuge: {
    id: string; name: string; kennung: string | null;
    /**
     * DRK-309 — Pflichtfeld, kein Optional: ein `einheitenart?` waere in einer
     * vergessenen Aufrufstelle still `undefined`, und die Suche nach „tasche"
     * fande dort nichts, ohne dass ein Tor es meldete.
     */
    einheitenart: Einheitenart | null;
  }[];
  hinweise: string[];
}) {
  const setzen = useUrlFilter();
  const schreibe = (teil: Partial<{ fz: string; von: string; bis: string }>) => {
    setzen({ fz, von, bis, ...teil });
  };
  const hatFilter = Boolean(fz || von || bis || hinweise.length > 0);
  // ⚠️ Wo auch die Art nicht trennt, trennt die ID (Reviewrunde 16):
  // zwei Taschen duerfen gleich heissen und beide ohne Kennung sein.
  const einheitBeschriftung = einheitLabels(fahrzeuge);

  return (
    <Flex vertical gap={SPACE.sm} style={{ marginBlockEnd: SPACE.md }}>
      <Flex gap={SPACE.md} wrap align="center">
        <Select<string, FahrzeugOption>
          showSearch
          allowClear
          filterOption={fahrzeugFilter}
          value={fz || undefined}
          onChange={(wert) => schreibe({ fz: wert ?? "" })}
          placeholder="Alle Einheiten"
          aria-label="Einheit"
          style={{ minWidth: 220 }}
          options={fahrzeuge.map((fahrzeug) => ({
            value: fahrzeug.id,
            /*
             * ⚠️ DIE ART STEHT IM LABEL UND IN DEN SUCHWORTEN (DRK-309,
             * Reviewrunde 8 — die Runden 2 und 4 haben je die Haelfte
             * geliefert).
             *
             * Runde 2 trug sie in die Suchworte: ohne sie fand „tasche" nur
             * Einheiten, die das Wort zufaellig im Namen tragen. Sichtbar stand
             * sie damals bewusst NICHT, mit der Begruendung „der Name
             * unterscheidet die Eintraege bereits" — und die faellt mit
             * derselben Messung wie bei den uebrigen Zielwahlen:
             * `lagerorte.name` traegt keinen Eindeutigkeitsschluessel. Zwei
             * Einheiten duerfen „Bereitschaft 1" heissen, und dann waehlt man
             * hier eine verborgene ID und sieht die Geschichte der anderen.
             *
             * ⚠️ DIESE STELLE IST DIE LETZTE, DIE NOCH FEHLTE — Artikelschublade,
             * Zugangs-Codes und die fuenf Standortfelder tragen die Form schon.
             * Dass sie uebrig blieb, lag an der Begruendung oben: sie las sich
             * wie eine Entscheidung und war eine Annahme.
             */
            label: einheitBeschriftung.get(fahrzeug.id)!.label,
            keywords: [fahrzeug.kennung, einheitenartLabel(fahrzeug.einheitenart)]
              .filter(Boolean).join(" "),
          }))}
          virtual={false}
        />
        <DatePicker
          value={von ? dayjs(von) : null}
          format="YYYY-MM-DD"
          aria-label="Zeitraum von"
          disabledDate={(datum) => (bis ? datum.isAfter(dayjs(bis)) : false)}
          onChange={(datum) => schreibe({
            von: datum ? datum.format("YYYY-MM-DD") : "",
          })}
        />
        <DatePicker
          value={bis ? dayjs(bis) : null}
          format="YYYY-MM-DD"
          aria-label="Zeitraum bis"
          disabledDate={(datum) => (von ? datum.isBefore(dayjs(von)) : false)}
          onChange={(datum) => schreibe({
            bis: datum ? datum.format("YYYY-MM-DD") : "",
          })}
        />
        {hatFilter ? (
          <Button onClick={() => setzen({})}>Zurücksetzen</Button>
        ) : null}
      </Flex>
      {hinweise.map((hinweis, index) => (
        <div
          key={`${index}:${hinweis}`}
          className={s.infobox}
          style={SCHRIFT.neben}
          data-rolle="filterhinweis"
        >
          {hinweis}
        </div>
      ))}
    </Flex>
  );
}

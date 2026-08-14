"use client";

import { Button, DatePicker, Flex, Select } from "antd";
import dayjs from "dayjs";
import { SPACE } from "@/core/theme/tokens";
import { SCHRIFT } from "../../../_lib/schrift";
import { useUrlFilter } from "../../../_ui/useUrlFilter";
import s from "../../../_ui/verwaltung.module.css";

export type FahrzeugOption = {
  value: string;
  label: string;
  keywords: string;
};

/** Das Auswahlfeld findet Fahrzeuge über den Namen und das Kennzeichen. */
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
  fahrzeuge: { id: string; name: string; kennung: string | null }[];
  hinweise: string[];
}) {
  const setzen = useUrlFilter();
  const schreibe = (teil: Partial<{ fz: string; von: string; bis: string }>) => {
    setzen({ fz, von, bis, ...teil });
  };
  const hatFilter = Boolean(fz || von || bis || hinweise.length > 0);

  return (
    <Flex vertical gap={SPACE.sm} style={{ marginBlockEnd: SPACE.md }}>
      <Flex gap={SPACE.md} wrap align="center">
        <Select<string, FahrzeugOption>
          showSearch
          allowClear
          filterOption={fahrzeugFilter}
          value={fz || undefined}
          onChange={(wert) => schreibe({ fz: wert ?? "" })}
          placeholder="Alle Fahrzeuge"
          aria-label="Fahrzeug"
          style={{ minWidth: 220 }}
          options={fahrzeuge.map((fahrzeug) => ({
            value: fahrzeug.id,
            label: fahrzeug.name,
            keywords: fahrzeug.kennung ?? "",
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

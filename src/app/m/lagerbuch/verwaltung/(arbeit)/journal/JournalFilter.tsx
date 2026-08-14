"use client";

import { useEffect, useRef, useState } from "react";
import { Button, DatePicker, Flex, Input, Select } from "antd";
import dayjs from "dayjs";
import { SPACE } from "@/core/theme/tokens";
import { typLabel } from "../../../_lib/format";
import { SCHRIFT } from "../../../_lib/schrift";
import { useUrlFilter } from "../../../_ui/useUrlFilter";
import s from "../../../_ui/verwaltung.module.css";
import {
  TYPEN,
  mitGetipptem,
  normalisiereJournalTag,
  type JournalFilterWerte,
} from "./journalFilterLogik";

export { TYPEN, deckelText, mitGetipptem } from "./journalFilterLogik";

type JournalFilterProps = JournalFilterWerte & { hinweise: string[] };

/**
 * URL-getriebener Regime-B-Filter. Der Server liefert ausschliesslich skalare,
 * validierte Werte; die Insel prueft die Datumsgrenzen trotzdem noch einmal,
 * bevor sie an dayjs und die DatePicker gehen.
 */
export function JournalFilter({
  q,
  typ,
  von,
  bis,
  hinweise,
}: JournalFilterProps) {
  const setzeUrl = useUrlFilter();
  const setzeUrlRef = useRef(setzeUrl);
  const [suche, setSuche] = useState(q);
  const committedQ = useRef(q);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sichererTyp = (TYPEN as readonly string[]).includes(typ) ? typ : "";
  const sicherVon = normalisiereJournalTag(von);
  const sicherBis = normalisiereJournalTag(bis);

  useEffect(() => {
    setzeUrlRef.current = setzeUrl;
  }, [setzeUrl]);

  /**
   * Der committedQ-Tanz unterscheidet eine externe URL-Aenderung von der
   * eigenen Schreibung. Nur eine externe Aenderung zieht das Eingabefeld nach.
   */
  useEffect(() => {
    if (q !== committedQ.current) {
      if (debounce.current !== null) clearTimeout(debounce.current);
      debounce.current = null;
      committedQ.current = q;
      setSuche(q);
    }
  }, [q]);

  useEffect(() => {
    const term = suche.trim();
    if (term === committedQ.current) return;

    const timer = setTimeout(() => {
      debounce.current = null;
      committedQ.current = term;
      setzeUrlRef.current({
        q: term,
        typ: sichererTyp,
        von: sicherVon,
        bis: sicherBis,
      });
    }, 300);
    debounce.current = timer;

    return () => {
      clearTimeout(timer);
      if (debounce.current === timer) debounce.current = null;
    };
  }, [suche, sichererTyp, sicherVon, sicherBis]);

  const setParam = (teil: Partial<JournalFilterWerte>) => {
    if (debounce.current !== null) clearTimeout(debounce.current);
    debounce.current = null;
    committedQ.current = suche.trim();
    setzeUrl(mitGetipptem(
      { q, typ: sichererTyp, von: sicherVon, bis: sicherBis },
      suche,
      teil,
    ));
  };

  const zuruecksetzen = () => {
    if (debounce.current !== null) clearTimeout(debounce.current);
    debounce.current = null;
    committedQ.current = "";
    setSuche("");
    setzeUrl({});
  };

  return (
    <Flex vertical gap={SPACE.sm} style={{ marginBlockEnd: SPACE.md }}>
      <Flex gap={SPACE.md} wrap align="center">
        <Input
          type="search"
          aria-label="Suche"
          allowClear
          placeholder="Artikel oder Kommentar suchen…"
          value={suche}
          onChange={(ereignis) => setSuche(ereignis.target.value)}
          style={{ width: 260 }}
        />
        <Select
          allowClear
          aria-label="Vorgang"
          placeholder="Alle Vorgänge"
          style={{ minWidth: 180 }}
          value={sichererTyp || undefined}
          onChange={(wert) => setParam({ typ: wert ?? "" })}
          options={TYPEN.map((wert) => ({
            value: wert,
            label: typLabel(wert),
          }))}
        />
        <DatePicker
          value={sicherVon ? dayjs(sicherVon) : null}
          format="YYYY-MM-DD"
          aria-label="Zeitraum von"
          disabledDate={(tag) => (
            sicherBis ? tag.isAfter(dayjs(sicherBis), "day") : false
          )}
          onChange={(tag) => setParam({
            von: tag ? tag.format("YYYY-MM-DD") : "",
          })}
        />
        <DatePicker
          value={sicherBis ? dayjs(sicherBis) : null}
          format="YYYY-MM-DD"
          aria-label="Zeitraum bis"
          disabledDate={(tag) => (
            sicherVon ? tag.isBefore(dayjs(sicherVon), "day") : false
          )}
          onChange={(tag) => setParam({
            bis: tag ? tag.format("YYYY-MM-DD") : "",
          })}
        />
        {q || sichererTyp || sicherVon || sicherBis ? (
          <Button onClick={zuruecksetzen}>Zurücksetzen</Button>
        ) : null}
      </Flex>
      {hinweise.map((hinweis, index) => (
        <div
          key={`${index}:${hinweis}`}
          className={s.infobox}
          style={SCHRIFT.neben}
        >
          {hinweis}
        </div>
      ))}
    </Flex>
  );
}

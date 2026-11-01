"use client";

import { useMemo, useState } from "react";
import { Button, Segmented, Space } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle, nachZahl } from "@/core/tabelle";
import { konflikte } from "../../_lib/belegung";
import { anfrageAlsEintrag, sperreAlsEintrag, type AnfrageDTO, type SperrzeitDTO } from "../../_lib/vermietungTypen";
import { zeitraumText } from "../../_lib/vermietungText";
import { useEntscheidung } from "./Entscheidung";
import { Eintragsflyin } from "./Eintragsflyin";
import { useTokensAmBody, Vertragschip, Zustandschip } from "./teile";
import s from "./vermietung.module.css";

type Filter = "angefragt" | "zugesagt" | "abgelehnt" | "alle";

/** Welcher Filter eine Anfrage zeigt — für `?id=<id>`, damit der geöffnete Eintrag auch in der Liste steht. */
const filterFuer = (a: AnfrageDTO | undefined): Filter => (a && a.status !== "zurueckgezogen" ? a.status : a ? "alle" : "angefragt");

/**
 * Die Anfragen an die Bar: Filter offen/zugesagt/abgelehnt/alle, Überschneidungen sichtbar, Zusagen und Ablehnen
 * direkt in der Zeile, Einzelheiten im Flyin. `startId` (aus `?id=`) öffnet einen Eintrag beim Laden.
 */
export function Anfragenliste({ anfragen, sperren, startId }: { anfragen: AnfrageDTO[]; sperren: SperrzeitDTO[]; startId: string | null }) {
  useTokensAmBody();
  const entscheidung = useEntscheidung();
  const start = startId ? anfragen.find((a) => a.id === startId) : undefined;
  const [filter, setFilter] = useState<Filter>(filterFuer(start));
  const [offenId, setOffenId] = useState<string | null>(start?.id ?? null);
  const alle = useMemo(() => [...anfragen.map(anfrageAlsEintrag), ...sperren.map(sperreAlsEintrag)], [anfragen, sperren]);
  const offen = offenId ? alle.find((e) => e.id === offenId) ?? null : null;
  const zahl = (f: Filter) => anfragen.filter((a) => a.status === f).length;
  const liste = anfragen.filter((a) => filter === "alle" || a.status === filter);
  const ueberschneidet = (a: AnfrageDTO) => konflikte(anfrageAlsEintrag(a), alle).length > 0;

  return (
    <div className={s.modul}>
      <Seitenkopf titel="Anfragen" beschreibung="Zusagen und Absagen sieht die Person auf ihrer Statusseite. Eine Absage braucht eine Begründung." />
      <div style={{ maxWidth: "100%", overflowX: "auto" }}>
        <Segmented<Filter> value={filter} onChange={setFilter} aria-label="Anfragen filtern" options={[
          { value: "angefragt", label: `Offen (${zahl("angefragt")})` },
          { value: "zugesagt", label: `Zugesagt (${zahl("zugesagt")})` },
          { value: "abgelehnt", label: `Abgelehnt (${zahl("abgelehnt")})` },
          { value: "alle", label: "Alle" },
        ]} />
      </div>
      <Kartentabelle<AnfrageDTO>
        rowKey="id"
        aria-label="Anfragen an die Bar"
        dataSource={liste}
        leer={{ nichts: "Keine Anfragen in dieser Ansicht.", gefiltert: "Keine Anfragen in dieser Ansicht.", aktiv: filter !== "alle" }}
        columns={[
          {
            title: "Wann", key: "wann", sorter: nachZahl<AnfrageDTO>((a) => a.von), defaultSortOrder: "ascend",
            render: (_: unknown, a: AnfrageDTO) => (
              <div>
                {zeitraumText(a.von, a.bis)}
                {(a.status === "angefragt" || a.status === "zugesagt") && ueberschneidet(a) ? <div><span className={`${s.chip} ${s.angefragt}`}>Überschneidung</span></div> : null}
              </div>
            ),
          },
          { title: "Anlass", key: "anlass", render: (_: unknown, a: AnfrageDTO) => <Button type="link" style={{ paddingInline: 0, whiteSpace: "normal", textAlign: "start", height: "auto", minHeight: 44 }} onClick={() => setOffenId(a.id)}>{a.anlass}</Button> },
          { title: "Personen", key: "personen", dataIndex: "personen", align: "right" },
          {
            title: "Ansprechperson", key: "person",
            render: (_: unknown, a: AnfrageDTO) => <div>{a.person}<div className={s.neben}>{a.mitglied ? "Mitglied" : "Extern"} · {a.kontakt}</div></div>,
          },
          {
            title: "Stand", key: "stand",
            render: (_: unknown, a: AnfrageDTO) => <div className={s.zeile}><Zustandschip zustand={a.status} />{a.status === "zugesagt" ? <Vertragschip stand={a.vertrag} /> : null}</div>,
          },
          {
            title: "Aktion", key: "aktion",
            render: (_: unknown, a: AnfrageDTO) => (a.status === "angefragt" ? (
              <Space wrap>
                <Button type="primary" onClick={() => { void entscheidung.zusagen(a); }}>Zusagen</Button>
                <Button onClick={() => entscheidung.begruenden(a, "ablehnen")}>Ablehnen</Button>
              </Space>
            ) : null),
          },
        ]}
      />
      <Eintragsflyin eintrag={offen} anfragen={anfragen} eintraege={alle} schliessen={() => setOffenId(null)} entscheidung={entscheidung} />
      {entscheidung.dialog}
    </div>
  );
}

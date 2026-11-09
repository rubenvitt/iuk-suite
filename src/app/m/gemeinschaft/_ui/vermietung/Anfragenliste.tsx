"use client";

import { useMemo, useState } from "react";
import { Button, Space } from "antd";
import { Filterchips } from "@/core/filterchips/Filterchips";
import { Statuschip } from "@/core/status/Statuschip";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle, nachZahl } from "@/core/tabelle";
import { konflikte } from "../../_lib/belegung";
import { anfrageAlsEintrag, sperreAlsEintrag, type AnfrageDTO, type SperrzeitDTO } from "../../_lib/vermietungTypen";
import { istTestanlass, testLoeschtag } from "../../_lib/testanfrage";
import { tagText, zeitraumText } from "../../_lib/vermietungText";
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
      <Seitenkopf titel="Anfragen" />
      <Filterchips<Filter> wert={filter} onChange={setFilter} aria-label="Anfragen filtern" optionen={[
        { wert: "angefragt", label: "Offen", anzahl: zahl("angefragt") },
        { wert: "zugesagt", label: "Zugesagt", anzahl: zahl("zugesagt") },
        { wert: "abgelehnt", label: "Abgelehnt", anzahl: zahl("abgelehnt") },
        { wert: "alle", label: "Alle", anzahl: anfragen.length },
      ]} />
      <Kartentabelle<AnfrageDTO>
        rowKey="id"
        aria-label="Anfragen an die Bar"
        dataSource={liste}
        leer={{ nichts: "Keine Anfragen", figur: "gemeinschaft", gefiltert: "Keine Anfragen in dieser Ansicht.", aktiv: filter !== "alle" }}
        columns={[
          {
            title: "Wann", key: "wann", sorter: nachZahl<AnfrageDTO>((a) => a.von), defaultSortOrder: "ascend",
            render: (_: unknown, a: AnfrageDTO) => (
              <div>
                {zeitraumText(a.von, a.bis)}
                {(a.status === "angefragt" || a.status === "zugesagt") && ueberschneidet(a) ? <div><Statuschip ton="warnung">Überschneidung</Statuschip></div> : null}
              </div>
            ),
          },
          {
            title: "Anlass", key: "anlass",
            render: (_: unknown, a: AnfrageDTO) => (
              <div>
                <Button type="link" style={{ paddingInline: 0, whiteSpace: "normal", textAlign: "start", height: "auto", minHeight: 44 }} onClick={() => setOffenId(a.id)}>{a.anlass}</Button>
                {istTestanlass(a.anlass) ? <div className={s.neben} data-testid="test-hinweis">Wird am {tagText(testLoeschtag(a.eingegangenAm), true)} gelöscht</div> : null}
              </div>
            ),
          },
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

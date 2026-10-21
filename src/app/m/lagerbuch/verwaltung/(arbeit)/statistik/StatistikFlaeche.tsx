"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Card, Segmented, Select } from "antd";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Kartentabelle, nachText, nachZahl } from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import type { StatistikDaten } from "../../../_lib/lesepfade/statistik";
import {
  bestandsverlauf,
  gefilterteArtikel,
  KEIN_FILTER,
  werteAus,
  type Filter,
  type TopArtikel,
} from "../../../_lib/statistik/auswertung";
import { ZEITRAEUME, type Zeitraum } from "../../../_lib/statistik/zeitraum";
import { Kachel } from "../../../_ui/Kachel";
import { useUrlFilter } from "../../../_ui/useUrlFilter";
import st from "./statistik.module.css";

/**
 * IDA-261 — DIE STATISTIKFLAECHE. Client-Insel, weil recharts und die Filter
 * es sind; die Seite darueber bleibt eine Server Component und reicht nur
 * serialisierbare Daten herein (Falle 9).
 *
 * DER ZEITRAUM GEHT UEBER DIE URL, Kategorie und Artikel NICHT. Ein anderer
 * Zeitraum braucht andere Zeilen vom Server; ein Filter ist nur eine andere
 * Summe ueber dieselben (`_lib/statistik/auswertung.ts`).
 *
 * ⚠️ FARBEN ALS `var(--st-*)`/`var(--lb-*)`, NIE aus antds Theme-Hook: der
 * naheliegende Token dort ist die Primaerfarbe = Suite-Rot, also Rot auf einer
 * Datenflaeche (Falle 3). `core/charts` faerbt genau so und ist deshalb hier
 * nicht der Baustein.
 */

const ZAHL = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const zahl = (n: number) => ZAHL.format(n);
const mitVorzeichen = (n: number) => (n > 0 ? `+${zahl(n)}` : zahl(n));

const ACHSE = { stroke: "var(--lb-linie)", tick: { fill: "var(--lb-stahl)", fontSize: 12 } } as const;
const TOOLTIP = {
  contentStyle: {
    background: "var(--st-tooltip)",
    border: "1px solid var(--lb-linie)",
    borderRadius: 6,
    color: "var(--lb-tinte)",
  },
  labelStyle: { color: "var(--lb-tinte)", fontWeight: 600 },
  itemStyle: { color: "var(--lb-tinte)" },
  cursor: { fill: "var(--lb-papier)" },
  formatter: (wert: unknown) => zahl(Number(wert)),
} as const;
const LEGENDE_STIL = { color: "var(--lb-tinte)", fontSize: 12 } as const;

const OHNE_KATEGORIE = "";

type Serie = { schluessel: string; name: string; farbe: string };

/** Eine Legende, deren Eintraege eine Reihe aus- und wieder einblenden. */
function useAusblenden() {
  const [aus, setAus] = useState<ReadonlySet<string>>(new Set());
  const umschalten = (schluessel: string) =>
    setAus((vorher) => {
      const neu = new Set(vorher);
      if (neu.has(schluessel)) neu.delete(schluessel);
      else neu.add(schluessel);
      return neu;
    });
  return { aus, umschalten };
}

function Leer({ children }: { children: ReactNode }) {
  return <div className={st.leer}>{children}</div>;
}

function GestapelteMonate({
  daten, reihen, hoehe = 280,
}: {
  daten: Record<string, string | number>[];
  reihen: Serie[];
  hoehe?: number;
}) {
  const { aus, umschalten } = useAusblenden();
  return (
    <ResponsiveContainer width="100%" height={hoehe}>
      <BarChart data={daten} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--lb-linie)" />
        <XAxis dataKey="label" {...ACHSE} />
        <YAxis allowDecimals={false} width={44} {...ACHSE} />
        <Tooltip {...TOOLTIP} />
        {reihen.length > 1 ? (
          <Legend
            wrapperStyle={{ ...LEGENDE_STIL, cursor: "pointer" }}
            onClick={(eintrag) => umschalten(String(eintrag.dataKey))}
            formatter={(name, eintrag) => (
              <span style={{ color: "var(--lb-tinte)", opacity: aus.has(String(eintrag.dataKey)) ? 0.4 : 1 }}>
                {name}
              </span>
            )}
          />
        ) : null}
        {reihen.map((r) => (
          <Bar
            key={r.schluessel}
            dataKey={r.schluessel}
            name={r.name}
            stackId="s"
            fill={r.farbe}
            hide={aus.has(r.schluessel)}
            maxBarSize={48}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatistikFlaeche({
  daten, zeitraum,
}: {
  daten: StatistikDaten;
  zeitraum: Zeitraum;
}) {
  const setzeUrl = useUrlFilter();
  const [filter, setFilter] = useState<Filter>(KEIN_FILTER);
  const auswertung = useMemo(() => werteAus(daten, filter), [daten, filter]);
  const verlauf = useMemo(
    () => (filter.artikelId ? bestandsverlauf(daten, filter.artikelId) : []),
    [daten, filter.artikelId],
  );
  const gewaehlt = filter.artikelId ? daten.artikel.find((a) => a.id === filter.artikelId) : undefined;
  const k = auswertung.kennzahlen;

  const artikelOptionen = useMemo(
    () => gefilterteArtikel(daten.artikel, { ...filter, artikelId: null })
      .map((a) => ({ value: a.id, label: a.aktiv ? a.name : `${a.name} (stillgelegt)` })),
    [daten.artikel, filter],
  );
  const kategorieOptionen = useMemo(() => {
    const optionen = daten.kategorien.map((o) => ({ value: o.schluessel, label: o.label }));
    return daten.artikel.some((a) => a.kategorieSchluessel === null)
      ? [...optionen, { value: OHNE_KATEGORIE, label: "Ohne Kategorie" }]
      : optionen;
  }, [daten]);

  const waehleArtikel = (artikelId: string | null) => setFilter((f) => ({ ...f, artikelId }));
  const einheit = gewaehlt?.einheit;
  const mengeText = (n: number) => (einheit ? `${zahl(n)} ${einheit}` : zahl(n));

  const hatVerbrauch = auswertung.verbrauchJeMonat.some((m) => m.regal + m.einheit > 0);
  const hatAussonderung = auswertung.aussonderungJeMonat.some((m) => m.menge > 0);
  const hatVerfall = auswertung.verfallVorschau.some((m) => m.menge > 0);

  return (
    <div className={st.flaeche} style={{ display: "grid", gap: SPACE.md }}>
      <Card>
        <div className={st.leiste}>
          <div>
            {/* Nur die Zahl im Knopf: „24 Monate" passte auf 390px nicht in ein Viertel. */}
            <span className={st.feldname} id="st-zeitraum">Zeitraum in Monaten</span>
            <Segmented<Zeitraum>
              aria-labelledby="st-zeitraum"
              block
              value={zeitraum}
              options={ZEITRAEUME.map((m) => ({ value: m, label: String(m) }))}
              onChange={(m) => setzeUrl({ monate: String(m) })}
            />
          </div>
          <label>
            <span className={st.feldname}>Kategorie</span>
            <Select<string>
              style={{ width: "100%" }}
              allowClear
              placeholder="Alle Kategorien"
              value={filter.kategorie ?? undefined}
              options={kategorieOptionen}
              onChange={(wert) => setFilter({ kategorie: wert ?? null, artikelId: null })}
            />
          </label>
          <label>
            <span className={st.feldname}>Artikel</span>
            <Select<string>
              style={{ width: "100%" }}
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Alle Artikel"
              value={filter.artikelId ?? undefined}
              options={artikelOptionen}
              onChange={(wert) => waehleArtikel(wert ?? null)}
            />
          </label>
        </div>
        {auswertung.gemischteEinheiten ? (
          <p className={st.hinweis} style={{ marginBlockStart: SPACE.sm }}>
            Die Summen zählen verschiedene Einheiten (Stück, Packungen, Flaschen) zusammen.
            Für genaue Mengen einen Artikel wählen.
          </p>
        ) : null}
      </Card>

      <div className={st.raster} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))" }}>
        <Kachel zahl={mengeText(k.verbrauch)} beschriftung="verbraucht im Zeitraum" />
        <Kachel zahl={mengeText(k.zugang)} beschriftung="Wareneingang" />
        <Kachel
          zahl={mengeText(k.aussonderung)}
          beschriftung="ausgesondert (Verfall, Defekt)"
          ton={k.aussonderung > 0 ? "gelb" : undefined}
        />
        <Kachel
          zahl={einheit ? `${mitVorzeichen(k.inventur)} ${einheit}` : mitVorzeichen(k.inventur)}
          beschriftung="Inventurdifferenz"
        />
      </div>

      <Card title="Verbrauch je Monat">
        {hatVerbrauch ? (
          <GestapelteMonate
            daten={auswertung.verbrauchJeMonat}
            reihen={[
              { schluessel: "regal", name: "am Regal entnommen", farbe: "var(--st-serie-1)" },
              { schluessel: "einheit", name: "beim Check an Einheiten gefehlt", farbe: "var(--st-serie-2)" },
            ]}
          />
        ) : (
          <Leer>Im gewählten Zeitraum wurde nichts verbraucht.</Leer>
        )}
        <p className={st.hinweis}>
          Material, das auf ein Fahrzeug oder in eine Tasche geht, zählt erst als verbraucht, wenn es beim nächsten
          Check fehlt. Umlagerungen, Aussonderungen und Inventurdifferenzen zählen nicht mit.
        </p>
      </Card>

      <Card title="Am meisten verbraucht">
        {auswertung.top.length === 0 ? (
          <Leer>Noch kein Verbrauch, aus dem sich eine Rangfolge ergäbe.</Leer>
        ) : (
          <>
            <TopDiagramm top={auswertung.top} onWahl={waehleArtikel} />
            <TopTabelle top={auswertung.top} />
          </>
        )}
      </Card>

      <div className={st.raster}>
        <Card title="Nachschub und Fehlmengen je Einheit">
          {auswertung.jeEinheit.length === 0 ? (
            <Leer>Im gewählten Zeitraum ging nichts auf eine Einheit.</Leer>
          ) : (
            <EinheitenDiagramm zeilen={auswertung.jeEinheit} />
          )}
          <p className={st.hinweis}>
            Nachschub: was aus dem Handlager oder der Entnahmebox auf die Einheit gebucht wurde. Fehlmenge: was beim
            Check fehlte.
          </p>
        </Card>

        <Card title={gewaehlt ? `Bestandsverlauf: ${gewaehlt.name}` : "Bestandsverlauf"}>
          {!gewaehlt ? (
            <Leer>Wähle oben einen Artikel oder klicke ihn in „Am meisten verbraucht“ an.</Leer>
          ) : (
            <VerlaufDiagramm zeilen={verlauf} />
          )}
          <p className={st.hinweis}>Bestand jeweils zum Monatsende, im laufenden Monat der Stand von heute.</p>
        </Card>
      </div>

      <div className={st.raster}>
        <Card title="Aussonderungen je Monat">
          {hatAussonderung ? (
            <GestapelteMonate
              hoehe={240}
              daten={auswertung.aussonderungJeMonat}
              reihen={[{ schluessel: "menge", name: "ausgesondert", farbe: "var(--st-serie-1)" }]}
            />
          ) : (
            <Leer>Im gewählten Zeitraum wurde nichts ausgesondert.</Leer>
          )}
        </Card>

        <Card title="Verfall im Handlager, nächste 12 Monate">
          {hatVerfall ? <VerfallDiagramm zeilen={auswertung.verfallVorschau} /> : (
            <Leer>Im Handlager läuft in den nächsten 12 Monaten nichts ab.</Leer>
          )}
          <p className={st.hinweis}>
            {daten.einheitenVerfallWarnend > 0
              ? `Dazu ${daten.einheitenVerfallWarnend} gemeldete Verfallsangaben an Einheiten, die abgelaufen oder bald fällig sind. Sie stehen unter Verfall.`
              : "An Einheiten ist nichts als abgelaufen oder bald fällig gemeldet."}
          </p>
        </Card>
      </div>
    </div>
  );
}

function TopDiagramm({ top, onWahl }: { top: TopArtikel[]; onWahl: (id: string) => void }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, top.length * 32 + 40)}>
      <BarChart data={top} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid horizontal={false} stroke="var(--lb-linie)" />
        <XAxis type="number" allowDecimals={false} {...ACHSE} />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          {...ACHSE}
          tickFormatter={(name: string) => (name.length > 22 ? `${name.slice(0, 21)}…` : name)}
        />
        <Tooltip {...TOOLTIP} />
        <Bar
          dataKey="verbrauch"
          name="verbraucht"
          fill="var(--st-serie-1)"
          maxBarSize={22}
          cursor="pointer"
          onClick={(_eintrag, index) => onWahl(top[index].id)}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function reichweiteText(r: number | null): string {
  if (r === null) return "–";
  return r >= 24 ? "über 2 Jahre" : `${zahl(r)} Monate`;
}

function TopTabelle({ top }: { top: TopArtikel[] }) {
  return (
    <Kartentabelle<TopArtikel>
      rowKey="id"
      aria-label="Verbrauch und Reichweite je Artikel"
      dataSource={top}
      leer={{ nichts: "Noch kein Verbrauch." }}
      karte={{ titel: "name", kennzeichen: ["reichweite"] }}
      columns={[
        { key: "name", title: "Artikel", dataIndex: "name", sorter: nachText<TopArtikel>((z) => z.name) },
        {
          key: "verbrauch", title: "Verbraucht", dataIndex: "verbrauch", align: "right",
          sorter: nachZahl<TopArtikel>((z) => z.verbrauch),
          render: (_: unknown, z: TopArtikel) => `${zahl(z.verbrauch)} ${z.einheit}`,
        },
        {
          key: "jeMonat", title: "Je Monat", dataIndex: "jeMonat", align: "right",
          sorter: nachZahl<TopArtikel>((z) => z.jeMonat),
          render: (_: unknown, z: TopArtikel) => `${zahl(z.jeMonat)} ${z.einheit}`,
        },
        {
          key: "handlager", title: "Im Handlager", dataIndex: "handlager", align: "right",
          sorter: nachZahl<TopArtikel>((z) => z.handlager),
          render: (_: unknown, z: TopArtikel) => `${zahl(z.handlager)} ${z.einheit}`,
        },
        {
          key: "reichweite", title: "Reicht noch", dataIndex: "reichweite", align: "right",
          sorter: nachZahl<TopArtikel>((z) => z.reichweite),
          render: (_: unknown, z: TopArtikel) => reichweiteText(z.reichweite),
        },
      ]}
    />
  );
}

function EinheitenDiagramm({ zeilen }: { zeilen: { label: string; nachschub: number; fehlmenge: number }[] }) {
  const { aus, umschalten } = useAusblenden();
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, zeilen.length * 44 + 60)}>
      <BarChart data={zeilen} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid horizontal={false} stroke="var(--lb-linie)" />
        <XAxis type="number" allowDecimals={false} {...ACHSE} />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          {...ACHSE}
          tickFormatter={(name: string) => (name.length > 22 ? `${name.slice(0, 21)}…` : name)}
        />
        <Tooltip {...TOOLTIP} />
        <Legend
          wrapperStyle={{ ...LEGENDE_STIL, cursor: "pointer" }}
          onClick={(eintrag) => umschalten(String(eintrag.dataKey))}
          formatter={(name, eintrag) => (
            <span style={{ color: "var(--lb-tinte)", opacity: aus.has(String(eintrag.dataKey)) ? 0.4 : 1 }}>
              {name}
            </span>
          )}
        />
        <Bar dataKey="nachschub" name="Nachschub" fill="var(--st-serie-1)" hide={aus.has("nachschub")} maxBarSize={16} />
        <Bar dataKey="fehlmenge" name="Fehlmenge beim Check" fill="var(--st-serie-2)" hide={aus.has("fehlmenge")} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function VerlaufDiagramm({ zeilen }: { zeilen: { label: string; handlager: number; einheiten: number }[] }) {
  const { aus, umschalten } = useAusblenden();
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={zeilen} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--lb-linie)" />
        <XAxis dataKey="label" {...ACHSE} />
        <YAxis allowDecimals={false} width={44} {...ACHSE} />
        <Tooltip {...TOOLTIP} cursor={{ stroke: "var(--lb-linie)" }} />
        <Legend
          wrapperStyle={{ ...LEGENDE_STIL, cursor: "pointer" }}
          onClick={(eintrag) => umschalten(String(eintrag.dataKey))}
          formatter={(name, eintrag) => (
            <span style={{ color: "var(--lb-tinte)", opacity: aus.has(String(eintrag.dataKey)) ? 0.4 : 1 }}>
              {name}
            </span>
          )}
        />
        <Line
          type="stepAfter" dataKey="handlager" name="Handlager" stroke="var(--st-serie-1)" strokeWidth={2}
          dot={{ r: 3, fill: "var(--st-serie-1)" }} hide={aus.has("handlager")}
        />
        <Line
          type="stepAfter" dataKey="einheiten" name="auf Einheiten" stroke="var(--st-serie-2)" strokeWidth={2}
          strokeDasharray="6 4" dot={{ r: 3, fill: "var(--st-serie-2)" }} hide={aus.has("einheiten")}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function VerfallDiagramm({ zeilen }: { zeilen: { label: string; menge: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={zeilen} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--lb-linie)" />
        <XAxis dataKey="label" {...ACHSE} interval={0} angle={-35} textAnchor="end" height={52} />
        <YAxis allowDecimals={false} width={44} {...ACHSE} />
        <Tooltip {...TOOLTIP} />
        <Bar dataKey="menge" name="läuft ab" maxBarSize={36}>
          {zeilen.map((z, i) => (
            <Cell key={z.label} fill={i === 0 ? "var(--lb-ampel-rot-text)" : "var(--st-serie-1)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

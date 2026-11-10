"use client";

import { useState } from "react";
import { App, Input } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import type { RuheSchluessel } from "@/core/ruhe";
import { Statuschip } from "@/core/status/Statuschip";
import {
  Kartentabelle,
  filterAktiv,
  nachText,
  nachZahl,
  trifftWert,
  werteAlsFilter,
  zustandsFilter,
  Zeilenaktionen,
  type FilterZustand,
  type KartentabelleProps,
  useEntprellt,
} from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import { aktivSetzenAction } from "../../_actions/stammdaten";
import { trifftSuche } from "../../_lib/stammdaten/suche";
import type { FahrzeugDTO, PersonDTO, Stammdatenart, StichwortDTO } from "../../_lib/stammdaten/typen";

/** Ein Eintrag, den eine der drei Tabellen zeigt. */
export type Stammeintrag = FahrzeugDTO | PersonDTO | StichwortDTO;

type Spalten<T> = NonNullable<KartentabelleProps<T>["columns"]>;

export type StammdatenTabelleProps =
  | { art: "fahrzeuge"; liste: FahrzeugDTO[]; onBearbeiten: (eintrag: FahrzeugDTO) => void }
  | { art: "personal"; liste: PersonDTO[]; onBearbeiten: (eintrag: PersonDTO) => void }
  | { art: "stichworte"; liste: StichwortDTO[]; onBearbeiten: (eintrag: StichwortDTO) => void };

/**
 * Eine Stammdatenliste als Kartentabelle (auf dem Telefon Karten, sonst Tabelle).
 *
 * Nur serialisierbare Props und die Action direkt importiert (Falle 9). Die Liste kommt nach
 * jedem Schreiben über die Props neu (die Actions rufen `revalidatePath`); gemerkt wird hier
 * nur der Filterzustand, nie die Liste (Falle 15). Jede Spalte trägt einen `key`, sonst kann
 * `Kartentabelle` den Filter nicht gesteuert führen.
 */
export function StammdatenTabelle(props: StammdatenTabelleProps) {
  switch (props.art) {
    case "fahrzeuge":
      return (
        <Liste<FahrzeugDTO>
          art="fahrzeuge"
          liste={props.liste}
          onBearbeiten={props.onBearbeiten}
          beschriftung="Fahrzeuge"
          suche={{ platzhalter: "Kennung oder Funkrufname suchen", felder: (f) => [f.kennung, f.ruf, f.typ] }}
          nameVon={(f) => f.kennung}
          leer={{ nichts: "Noch keine Fahrzeuge", figur: "einsatzbuch", gefiltert: "Kein Fahrzeug passt zu Suche und Filter." }}
          spalten={[
            { title: "Kennung", key: "kennung", sorter: nachText<FahrzeugDTO>((f) => f.kennung), render: (_: unknown, f: FahrzeugDTO) => f.kennung },
            {
              title: "Typ",
              key: "typ",
              filters: werteAlsFilter(props.liste, (f) => f.typ),
              onFilter: trifftWert<FahrzeugDTO>((f) => f.typ),
              render: (_: unknown, f: FahrzeugDTO) => f.typ,
            },
            { title: "Funkrufname", key: "ruf", render: (_: unknown, f: FahrzeugDTO) => f.ruf },
            {
              title: "Standort",
              key: "standort",
              filters: werteAlsFilter(props.liste, (f) => f.standort),
              onFilter: trifftWert<FahrzeugDTO>((f) => f.standort),
              render: (_: unknown, f: FahrzeugDTO) => f.standort,
            },
          ]}
        />
      );
    case "personal":
      return (
        <Liste<PersonDTO>
          art="personal"
          liste={props.liste}
          onBearbeiten={props.onBearbeiten}
          beschriftung="Personal"
          suche={{ platzhalter: "Name suchen", felder: (p) => [p.name] }}
          nameVon={(p) => p.name}
          leer={{ nichts: "Noch kein Personal", figur: "einsatzbuch", gefiltert: "Keine Person passt zu Suche und Filter." }}
          spalten={[
            { title: "Name", key: "name", sorter: nachText<PersonDTO>((p) => p.name), render: (_: unknown, p: PersonDTO) => p.name },
            {
              title: "Qualifikation",
              key: "quali",
              filters: werteAlsFilter(props.liste, (p) => p.quali),
              onFilter: trifftWert<PersonDTO>((p) => p.quali),
              render: (_: unknown, p: PersonDTO) => p.quali,
            },
          ]}
        />
      );
    case "stichworte":
      return (
        <Liste<StichwortDTO>
          art="stichworte"
          liste={props.liste}
          onBearbeiten={props.onBearbeiten}
          beschriftung="Stichworte"
          suche={{ platzhalter: "Stichwort suchen", felder: (s) => [s.name, s.gruppe] }}
          nameVon={(st) => st.name}
          leer={{ nichts: "Noch keine Stichworte", figur: "einsatzbuch", gefiltert: "Kein Stichwort passt zu Suche und Filter." }}
          spalten={[
            {
              title: "Gruppe",
              key: "gruppe",
              filters: werteAlsFilter(props.liste, (s) => s.gruppe),
              onFilter: trifftWert<StichwortDTO>((s) => s.gruppe),
              render: (_: unknown, s: StichwortDTO) => s.gruppe,
            },
            { title: "Stichwort", key: "name", sorter: nachText<StichwortDTO>((s) => s.name), render: (_: unknown, s: StichwortDTO) => s.name },
            {
              title: "Reihenfolge",
              key: "reihenfolge",
              sorter: nachZahl<StichwortDTO>((s) => s.reihenfolge),
              render: (_: unknown, s: StichwortDTO) => s.reihenfolge,
            },
          ]}
        />
      );
  }
}

/**
 * Die drei Listen teilen Suche, Status- und Aktionsspalte; nur die Fachspalten davor unterscheiden sich.
 *
 * DIE SUCHE STEHT ÜBER DER KARTENTABELLE, nicht in ihr (IDA-390: 112 Personen ohne Suchfeld). Sie
 * filtert die `dataSource`; Spaltenfilter und Sortierung bleiben Sache der Kartentabelle. Entprellt wird
 * die Ableitung, nie das Feld (`core/tabelle/useEntprellt.ts`).
 */
function Liste<T extends Stammeintrag>({
  art,
  liste,
  onBearbeiten,
  beschriftung,
  suche: { platzhalter, felder },
  nameVon,
  leer,
  spalten,
}: {
  art: Stammdatenart;
  liste: T[];
  onBearbeiten: (eintrag: T) => void;
  beschriftung: string;
  suche: { platzhalter: string; felder: (eintrag: T) => string[] };
  /** Wofür die Zeilenaktionen gelten — der Menüknopf heißt „Aktionen für <name>". */
  nameVon: (eintrag: T) => string;
  leer: { nichts: string; gefiltert: string; figur?: RuheSchluessel };
  spalten: Spalten<T>;
}) {
  const { message } = App.useApp();
  const [filter, setFilter] = useState<FilterZustand>({});
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [suchtext, setSuchtext] = useState("");
  const begriff = useEntprellt(suchtext);
  const treffer = liste.filter((e) => trifftSuche(felder(e), begriff));
  const sucht = begriff.trim() !== "";

  // „aktiv“/„inaktiv“ ist ein Prädikat über der Zeile, kein Feldwert (`core/tabelle/spaltenfilter.ts`).
  const status = zustandsFilter<T>([
    { wert: "aktiv", text: "aktiv", trifft: (e) => e.aktiv },
    { wert: "inaktiv", text: "inaktiv", trifft: (e) => !e.aktiv },
  ]);

  function umschalten(eintrag: T): void {
    setLaeuft(eintrag.id);
    void aktivSetzenAction(art, eintrag.id, !eintrag.aktiv)
      .then((ergebnis) => {
        if (!ergebnis.ok) void message.warning(ergebnis.fehler);
      })
      .catch(() => void message.warning("Der Status ließ sich nicht ändern. Bitte die Seite neu laden."))
      .finally(() => setLaeuft(null));
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.md }}>
      {liste.length > 0 ? (
        <Input
          type="search"
          value={suchtext}
          onChange={(e) => setSuchtext(e.target.value)}
          placeholder={platzhalter}
          aria-label={platzhalter}
          prefix={<Icons8Ikone name="search" groesse={16} />}
          allowClear
          style={{ maxWidth: 360 }}
          styles={suchtext === "" ? TREFFERFLAECHE_LEER : TREFFERFLAECHE}
        />
      ) : null}
      <Kartentabelle<T>
        rowKey="id"
        aria-label={beschriftung}
        dataSource={treffer}
        filter={filter}
        onFilter={setFilter}
        leer={{
          ...leer,
          // Die leere Liste zuerst: ein stehengebliebener Filter über nichts behauptete sonst einen Bestand.
          aktiv: liste.length > 0 && (sucht || filterAktiv(filter)),
        }}
        columns={[
          ...spalten,
          {
            title: "Status",
            key: "status",
            ...status,
            render: (_: unknown, e: T) => <Statuschip ton={e.aktiv ? "ok" : "neutral"}>{e.aktiv ? "aktiv" : "inaktiv"}</Statuschip>,
          },
          {
            title: "Aktionen",
            key: "aktionen",
            // IDA-393: zwei ausgeschriebene Knöpfe → ein Aktionsmenü je Zeile.
            render: (_: unknown, e: T) => (
              <Zeilenaktionen
                name={nameVon(e)}
                laeuft={laeuft === e.id}
                aktionen={[
                  { key: "bearbeiten", label: "Bearbeiten", onClick: () => onBearbeiten(e) },
                  { key: "aktiv", label: e.aktiv ? "Deaktivieren" : "Aktivieren", disabled: laeuft !== null, onClick: () => umschalten(e) },
                ]}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

/**
 * 44 px auch im Inneren des Suchfelds (Falle 4): mit `prefix` und `allowClear` legt antd einen Rahmen
 * um das `input`, und Feld wie Leeren-Knopf blieben darin so niedrig wie ihre Zeile. Über antds
 * Semantik-Slots statt CSS gegen `.ant-*` (Falle 5, 20); Bauform wie im Lagerbuch-Suchfeld. Ohne Text
 * ist der Knopf `display: none`, sonst nähme er dem Platzhalter seine Breite.
 */
const TREFFERFLAECHE = {
  root: { paddingBlock: 0 },
  input: { minHeight: 44, marginBlock: -1 },
  clear: { minWidth: 44, minHeight: 44, marginBlock: -1, display: "inline-flex", alignItems: "center", justifyContent: "center" },
} as const;
const TREFFERFLAECHE_LEER = { ...TREFFERFLAECHE, clear: { display: "none" } } as const;

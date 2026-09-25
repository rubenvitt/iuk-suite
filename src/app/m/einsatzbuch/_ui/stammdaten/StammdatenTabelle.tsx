"use client";

import { useState } from "react";
import { App, Button, Tag } from "antd";
import {
  Kartentabelle,
  filterAktiv,
  nachText,
  nachZahl,
  trifftWert,
  werteAlsFilter,
  zustandsFilter,
  type FilterZustand,
  type KartentabelleProps,
} from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import { aktivSetzenAction } from "../../_actions/stammdaten";
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
          leer={{ nichts: "Noch keine Fahrzeuge angelegt.", gefiltert: "Kein Fahrzeug passt zum Filter." }}
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
          leer={{ nichts: "Noch kein Personal angelegt.", gefiltert: "Keine Person passt zum Filter." }}
          spalten={[
            { title: "Name", key: "name", sorter: nachText<PersonDTO>((p) => p.name), render: (_: unknown, p: PersonDTO) => p.name },
            {
              title: "Qualifikation",
              key: "quali",
              filters: werteAlsFilter(props.liste, (p) => p.quali),
              onFilter: trifftWert<PersonDTO>((p) => p.quali),
              render: (_: unknown, p: PersonDTO) => p.quali,
            },
            {
              title: "Ortsverein",
              key: "ov",
              filters: werteAlsFilter(props.liste, (p) => p.ov),
              onFilter: trifftWert<PersonDTO>((p) => p.ov),
              render: (_: unknown, p: PersonDTO) => p.ov,
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
          leer={{ nichts: "Noch keine Stichworte angelegt.", gefiltert: "Kein Stichwort passt zum Filter." }}
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

/** Die drei Listen teilen Status- und Aktionsspalte; nur die Fachspalten davor unterscheiden sich. */
function Liste<T extends Stammeintrag>({
  art,
  liste,
  onBearbeiten,
  beschriftung,
  leer,
  spalten,
}: {
  art: Stammdatenart;
  liste: T[];
  onBearbeiten: (eintrag: T) => void;
  beschriftung: string;
  leer: { nichts: string; gefiltert: string };
  spalten: Spalten<T>;
}) {
  const { message } = App.useApp();
  const [filter, setFilter] = useState<FilterZustand>({});
  const [laeuft, setLaeuft] = useState<string | null>(null);

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
    <Kartentabelle<T>
      rowKey="id"
      aria-label={beschriftung}
      dataSource={liste}
      filter={filter}
      onFilter={setFilter}
      leer={{
        ...leer,
        // Die leere Liste zuerst: ein stehengebliebener Filter über nichts behauptete sonst einen Bestand.
        aktiv: liste.length > 0 && filterAktiv(filter),
      }}
      columns={[
        ...spalten,
        {
          title: "Status",
          key: "status",
          ...status,
          render: (_: unknown, e: T) => <Tag color={e.aktiv ? "green" : "default"}>{e.aktiv ? "aktiv" : "inaktiv"}</Tag>,
        },
        {
          title: "Aktionen",
          key: "aktionen",
          render: (_: unknown, e: T) => (
            <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
              <Button onClick={() => onBearbeiten(e)}>Bearbeiten</Button>
              <Button onClick={() => umschalten(e)} loading={laeuft === e.id} disabled={laeuft !== null && laeuft !== e.id}>
                {e.aktiv ? "Deaktivieren" : "Aktivieren"}
              </Button>
            </div>
          ),
        },
      ]}
    />
  );
}

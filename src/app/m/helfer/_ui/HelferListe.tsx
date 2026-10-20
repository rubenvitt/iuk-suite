"use client";

import { useMemo, useState } from "react";
import { App, Button, Input, Switch, Tag } from "antd";
import {
  Kartentabelle,
  filterAktiv,
  nachText,
  wendeFilterAn,
  zustandsFilter,
  type FilterZustand,
  type KartentabelleProps,
} from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import { freigabeAction } from "../_actions/verwaltung";
import type { HelferDTO } from "../_lib/daten";
import { STATUS_TEXT } from "../_lib/filter";

type Spalten = NonNullable<KartentabelleProps<HelferDTO>["columns"]>;

const SAMMLER = new Intl.Collator("de", { numeric: true, sensitivity: "base" });

/** Alle Werte einer Mehrfachspalte als Filtereinträge (eine Person trägt mehrere Qualifikationen und Gruppen). */
function mehrfachFilter(liste: HelferDTO[], werte: (h: HelferDTO) => string[]) {
  const alle = [...new Set(liste.flatMap(werte))].sort(SAMMLER.compare);
  return {
    filters: alle.map((w) => ({ text: w, value: w })),
    onFilter: (wert: unknown, h: HelferDTO) => werte(h).includes(String(wert)),
  };
}

const qualiText = (h: HelferDTO) => h.qualifikationen.map((q) => q.name);

/**
 * Die Helferliste: die zweite Filterstufe nach dem Import. Wer hier „Einsatzbuch“ ausschaltet, wird
 * dem Einsatzbuch nicht mehr bereitgestellt (`_lib/bereitstellung.ts`) und dort beim nächsten
 * Abgleich deaktiviert. Die Massenknöpfe wirken auf genau die Zeilen, die der Filter gerade zeigt.
 *
 * Nur serialisierbare Props, die Action direkt importiert (Falle 9). Gemerkt wird nur der
 * Filterzustand, nie die Liste (Falle 15).
 */
export function HelferListe({ liste, darfVerwalten }: { liste: HelferDTO[]; darfVerwalten: boolean }) {
  const { message, modal } = App.useApp();
  const [filter, setFilter] = useState<FilterZustand>({});
  const [suche, setSuche] = useState("");
  const [laeuft, setLaeuft] = useState<string | null>(null);

  const gesucht = useMemo(() => {
    const s = suche.trim().toLocaleLowerCase("de");
    return s ? liste.filter((h) => `${h.vorname} ${h.nachname} ${h.nachname}, ${h.vorname}`.toLocaleLowerCase("de").includes(s)) : liste;
  }, [liste, suche]);

  async function setze(ids: string[], wert: boolean, schluessel: string): Promise<void> {
    setLaeuft(schluessel);
    try {
      const e = await freigabeAction({ ids, wert });
      if (!e.ok) void message.warning(e.fehler);
      else if (ids.length > 1) void message.success(`${e.wert} geändert.`);
    } catch {
      void message.warning("Die Freigabe ließ sich nicht ändern. Bitte die Seite neu laden.");
    } finally {
      setLaeuft(null);
    }
  }

  const spalten: Spalten = [
    {
      title: "Name",
      key: "name",
      sorter: nachText<HelferDTO>((h) => `${h.nachname}, ${h.vorname}`),
      defaultSortOrder: "ascend",
      render: (_: unknown, h: HelferDTO) => (
        <span>
          {h.nachname}, {h.vorname}
          {h.demo ? <Tag style={{ marginInlineStart: SPACE.sm }}>Demo</Tag> : null}
        </span>
      ),
    },
    {
      title: "Qualifikationen",
      key: "qualifikationen",
      ...mehrfachFilter(liste, qualiText),
      render: (_: unknown, h: HelferDTO) =>
        h.qualifikationen.length === 0 ? "—" : (
          <span style={{ display: "inline-flex", flexWrap: "wrap", gap: SPACE.xs }}>
            {h.qualifikationen.map((q) => <Tag key={`${q.liste}/${q.name}`} title={q.liste ? `${q.liste}: ${q.name}` : q.name}>{q.kurz || q.name}</Tag>)}
          </span>
        ),
    },
    {
      title: "Gruppen",
      key: "gruppen",
      ...mehrfachFilter(liste, (h) => h.gruppen),
      render: (_: unknown, h: HelferDTO) => (h.gruppen.length === 0 ? "—" : h.gruppen.join(", ")),
    },
    {
      title: "Konto in HiOrg",
      key: "status",
      ...mehrfachFilter(liste, (h) => [STATUS_TEXT[h.status] ?? h.status]),
      render: (_: unknown, h: HelferDTO) => STATUS_TEXT[h.status] ?? h.status,
    },
    {
      title: "Einsatzbuch",
      key: "einsatzbuch",
      ...zustandsFilter<HelferDTO>([
        { wert: "ja", text: "freigegeben", trifft: (h) => h.fuerEinsatzbuch },
        { wert: "nein", text: "nicht freigegeben", trifft: (h) => !h.fuerEinsatzbuch },
      ]),
      render: (_: unknown, h: HelferDTO) =>
        darfVerwalten ? (
          <label style={{ display: "inline-flex", alignItems: "center", gap: SPACE.sm, minHeight: 44 }}>
            <Switch
              checked={h.fuerEinsatzbuch}
              loading={laeuft === h.id}
              disabled={laeuft !== null && laeuft !== h.id}
              onChange={(wert) => void setze([h.id], wert, h.id)}
              aria-label={`${h.vorname} ${h.nachname} fürs Einsatzbuch freigeben`}
            />
            {h.fuerEinsatzbuch ? "freigegeben" : "nicht freigegeben"}
          </label>
        ) : h.fuerEinsatzbuch ? "freigegeben" : "nicht freigegeben",
    },
  ];

  const angezeigt = wendeFilterAn(gesucht, spalten, filter);

  function alleSetzen(wert: boolean): void {
    const ids = angezeigt.filter((h) => h.fuerEinsatzbuch !== wert).map((h) => h.id);
    if (ids.length === 0) {
      void message.info(wert ? "Alle angezeigten sind schon freigegeben." : "Keiner der angezeigten ist freigegeben.");
      return;
    }
    modal.confirm({
      title: wert ? `${ids.length} fürs Einsatzbuch freigeben?` : `${ids.length} nicht mehr fürs Einsatzbuch bereitstellen?`,
      content: wert
        ? "Sie stehen nach dem nächsten Abgleich im Einsatzbuch zur Auswahl."
        : "Im Einsatzbuch werden sie beim nächsten Abgleich deaktiviert. Versiegelte Einsätze behalten ihren Stand.",
      okText: wert ? "Freigeben" : "Nicht mehr bereitstellen",
      cancelText: "Abbrechen",
      onOk: () => setze(ids, wert, "alle"),
    });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.lg }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE.sm, alignItems: "center" }}>
        <Input
          allowClear
          placeholder="Name suchen"
          aria-label="Name suchen"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <span aria-live="polite">{angezeigt.length} von {liste.length} angezeigt</span>
        {darfVerwalten && liste.length > 0 ? (
          <span style={{ display: "inline-flex", flexWrap: "wrap", gap: SPACE.sm, marginInlineStart: "auto" }}>
            <Button onClick={() => alleSetzen(true)} loading={laeuft === "alle"} disabled={laeuft !== null}>Angezeigte freigeben</Button>
            <Button onClick={() => alleSetzen(false)} disabled={laeuft !== null}>Angezeigte nicht bereitstellen</Button>
          </span>
        ) : null}
      </div>
      <Kartentabelle<HelferDTO>
        rowKey="id"
        aria-label="Helfer"
        dataSource={gesucht}
        filter={filter}
        onFilter={setFilter}
        leer={{
          nichts: suche ? "Kein Name passt zur Suche." : "Noch keine Helfer übernommen. Unter „Abgleich“ holst du sie aus der Quelle.",
          gefiltert: "Keine Person passt zum Filter.",
          aktiv: gesucht.length > 0 && filterAktiv(filter),
        }}
        columns={spalten}
      />
    </div>
  );
}

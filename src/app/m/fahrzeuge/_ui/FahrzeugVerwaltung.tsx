"use client";

import { useState } from "react";
import { App, Button, Drawer, Tag } from "antd";
import { Kartentabelle, filterAktiv, nachText, trifftWert, werteAlsFilter, zustandsFilter, type FilterZustand } from "@/core/tabelle";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { flyinBreite } from "@/core/theme/flyin";
import { SPACE } from "@/core/theme/tokens";
import { aktivSetzenAction } from "../_actions/verwaltung";
import type { FahrzeugDTO } from "../_lib/daten";
import { ARTEN } from "../_lib/eingabe";
import { FahrzeugFormular } from "./FahrzeugFormular";

const ART_TEXT = Object.fromEntries(ARTEN.map((a) => [a.wert, a.text])) as Record<FahrzeugDTO["art"], string>;

/**
 * Die Client-Insel der Fahrzeugliste: Seitenkopf mit „Fahrzeug anlegen“, Kartentabelle und die
 * Formular-Schublade (Vorbild `einsatzbuch/_ui/stammdaten/Stammdaten.tsx`). Nur serialisierbare Props,
 * die Actions direkt importiert (Falle 9). Die Liste kommt nach jedem Speichern über die Props neu, weil
 * die Actions `revalidatePath` rufen; gemerkt wird hier nur der Filterzustand (Falle 15).
 *
 * Ohne Verwaltungsrecht fehlen Anlegen, Bearbeiten und Aktivieren — dasselbe Prädikat
 * (`darfFahrzeugeVerwalten`) riegelt auf dem Server jede Action.
 */
export function FahrzeugVerwaltung({ liste, darfVerwalten }: { liste: FahrzeugDTO[]; darfVerwalten: boolean }) {
  const { message } = App.useApp();
  const [filter, setFilter] = useState<FilterZustand>({});
  const [formular, setFormular] = useState<{ eintrag: FahrzeugDTO | null } | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);

  const status = zustandsFilter<FahrzeugDTO>([
    { wert: "aktiv", text: "aktiv", trifft: (f) => f.aktiv },
    { wert: "inaktiv", text: "außer Dienst", trifft: (f) => !f.aktiv },
  ]);

  function umschalten(f: FahrzeugDTO): void {
    setLaeuft(f.id);
    void aktivSetzenAction(f.id, !f.aktiv)
      .then((ergebnis) => {
        if (!ergebnis.ok) void message.warning(ergebnis.fehler);
      })
      .catch(() => void message.warning("Der Status ließ sich nicht ändern. Bitte die Seite neu laden."))
      .finally(() => setLaeuft(null));
  }

  const aktiv = liste.filter((f) => f.aktiv).length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.lg }}>
      <Seitenkopf
        titel="Fahrzeuge"
        beschreibung={`Die Fahrzeuge und Anhänger der Bereitschaft, ${aktiv} im Dienst. Von hier übernehmen Einsatzbuch, Lagerbuch und Funkgeräte Namen, Funkkenner und Kennzeichen. Ausgemusterte Fahrzeuge werden außer Dienst gestellt, nicht gelöscht.`}
        aktionen={darfVerwalten ? <Button type="primary" onClick={() => setFormular({ eintrag: null })}>Fahrzeug anlegen</Button> : undefined}
      />

      <Kartentabelle<FahrzeugDTO>
        rowKey="id"
        aria-label="Fahrzeuge"
        dataSource={liste}
        filter={filter}
        onFilter={setFilter}
        leer={{
          nichts: "Noch keine Fahrzeuge angelegt.",
          gefiltert: "Kein Fahrzeug passt zum Filter.",
          aktiv: liste.length > 0 && filterAktiv(filter),
        }}
        columns={[
          { title: "Funkrufname", key: "funkrufname", sorter: nachText<FahrzeugDTO>((f) => f.funkrufname), render: (_: unknown, f: FahrzeugDTO) => f.funkrufname },
          { title: "Funkkenner", key: "funkkenner", sorter: nachText<FahrzeugDTO>((f) => f.funkkenner ?? ""), render: (_: unknown, f: FahrzeugDTO) => f.funkkenner ?? "—" },
          {
            title: "Typ",
            key: "typ",
            filters: werteAlsFilter(liste, (f) => f.typ),
            onFilter: trifftWert<FahrzeugDTO>((f) => f.typ),
            render: (_: unknown, f: FahrzeugDTO) => (f.art === "anhaenger" ? `${f.typ} (Anhänger)` : f.typ),
          },
          { title: "Kennzeichen", key: "kennzeichen", render: (_: unknown, f: FahrzeugDTO) => f.kennzeichen ?? "—" },
          {
            title: "Standort",
            key: "standort",
            filters: werteAlsFilter(liste, (f) => f.standort),
            onFilter: trifftWert<FahrzeugDTO>((f) => f.standort),
            render: (_: unknown, f: FahrzeugDTO) => f.standort,
          },
          {
            title: "Status",
            key: "status",
            ...status,
            render: (_: unknown, f: FahrzeugDTO) => <Tag color={f.aktiv ? "green" : "default"}>{f.aktiv ? "aktiv" : "außer Dienst"}</Tag>,
          },
          ...(darfVerwalten
            ? [{
                title: "Aktionen",
                key: "aktionen",
                render: (_: unknown, f: FahrzeugDTO) => (
                  <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
                    <Button onClick={() => setFormular({ eintrag: f })}>Bearbeiten</Button>
                    <Button onClick={() => umschalten(f)} loading={laeuft === f.id} disabled={laeuft !== null && laeuft !== f.id}>
                      {f.aktiv ? "Außer Dienst stellen" : "In Dienst stellen"}
                    </Button>
                  </div>
                ),
              }]
            : []),
        ]}
      />

      <Drawer
        open={formular !== null}
        onClose={() => setFormular(null)}
        title={formular?.eintrag ? `${ART_TEXT[formular.eintrag.art]} bearbeiten` : "Fahrzeug anlegen"}
        size={flyinBreite(480)}
        destroyOnHidden
      >
        {formular ? <FahrzeugFormular eintrag={formular.eintrag} onFertig={() => setFormular(null)} /> : null}
      </Drawer>
    </div>
  );
}

"use client";

import { useState } from "react";
import { App, Button, Popconfirm } from "antd";
import { Kartentabelle, filterAktiv, nachText, nachZahl, type FilterZustand } from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import { qualifikationEntfernenAction } from "../../_actions/stammdaten";
import type { QualifikationDTO } from "../../_lib/stammdaten/typen";

export type QualifikationZeile = QualifikationDTO & { anzahl: number };

/**
 * Die Qualifikationen des Personals (IDA-282) als Kartentabelle, höchste zuerst. Anders als die
 * übrigen Stammdaten ohne Aktiv-Schalter: eine Qualifikation, die niemand trägt, wird entfernt;
 * eine getragene lehnt der Server mit Begründung ab. Nur serialisierbare Props (Falle 9).
 */
export function QualifikationenTabelle({ liste, onBearbeiten }: { liste: QualifikationZeile[]; onBearbeiten: (q: QualifikationZeile) => void }) {
  const { message } = App.useApp();
  const [filter, setFilter] = useState<FilterZustand>({});
  const [laeuft, setLaeuft] = useState<string | null>(null);

  function entfernen(q: QualifikationZeile): void {
    setLaeuft(q.id);
    void qualifikationEntfernenAction(q.id)
      .then((ergebnis) => {
        if (ergebnis.ok) void message.success(`„${q.kurz}“ ist entfernt.`);
        else void message.warning(ergebnis.fehler);
      })
      .catch(() => void message.warning("Entfernen ist fehlgeschlagen. Bitte die Seite neu laden."))
      .finally(() => setLaeuft(null));
  }

  return (
    <Kartentabelle<QualifikationZeile>
      rowKey="id"
      aria-label="Qualifikationen"
      dataSource={liste}
      filter={filter}
      onFilter={setFilter}
      leer={{ nichts: "Noch keine Qualifikationen angelegt.", gefiltert: "Keine Qualifikation passt zum Filter.", aktiv: liste.length > 0 && filterAktiv(filter) }}
      columns={[
        { title: "Rang", key: "rang", sorter: nachZahl<QualifikationZeile>((q) => q.rang), render: (_: unknown, q: QualifikationZeile) => q.rang },
        { title: "Kurzform", key: "kurz", sorter: nachText<QualifikationZeile>((q) => q.kurz), render: (_: unknown, q: QualifikationZeile) => q.kurz },
        { title: "Bezeichnung", key: "lang", render: (_: unknown, q: QualifikationZeile) => q.lang },
        { title: "Personal", key: "anzahl", sorter: nachZahl<QualifikationZeile>((q) => q.anzahl), render: (_: unknown, q: QualifikationZeile) => q.anzahl },
        {
          title: "Aktionen",
          key: "aktionen",
          render: (_: unknown, q: QualifikationZeile) => (
            <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
              <Button onClick={() => onBearbeiten(q)}>Bearbeiten</Button>
              {q.anzahl > 0 ? (
                <Button onClick={() => void message.info(`${q.anzahl === 1 ? "Eine Person trägt" : `${q.anzahl} Personen tragen`} „${q.kurz}“. Bitte erst umstellen, dann entfernen.`)}>
                  Entfernen
                </Button>
              ) : (
                <Popconfirm
                  title={`„${q.kurz}“ entfernen?`}
                  description="Niemand im Personal trägt sie. Abgeschlossene Einsätze behalten ihren Stand."
                  okText="Entfernen"
                  cancelText="Abbrechen"
                  onConfirm={() => entfernen(q)}
                >
                  <Button loading={laeuft === q.id} disabled={laeuft !== null && laeuft !== q.id}>
                    Entfernen
                  </Button>
                </Popconfirm>
              )}
            </div>
          ),
        },
      ]}
    />
  );
}

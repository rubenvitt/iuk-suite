"use client";

import { useState } from "react";
import { Button, Drawer, Table, Tag } from "antd";
import { aufgabenSortierenAction } from "../../_actions/katalog";
import type { TaskDTO, Teil } from "../../_lib/typen";
import { SPACE } from "@/core/theme/tokens";
import { AufgabeFormular } from "./AufgabeFormular";

const TEIL_TITEL: Record<Teil, string> = { 1: "Teil 1", 2: "Teil 2", 3: "Teil 3" };

/*
 * DER AUFGABENKATALOG ALS TABELLE (Aufgabe 17) — eigene `"use client"`-
 * Komponente mit nur serialisierbaren Daten (`TaskDTO[]`) als Prop (Falle 9).
 * Reihenfolge NUR über Hoch/Runter-Buttons (Brief: „kein Drag — Tap-tauglich",
 * CLAUDE.md-Vorgabe für den Katalog) — Vorbild `uav-praxis/src/admin/
 * CatalogPage.tsx`s `verschieben`, optimistisch lokal verschoben und danach
 * per `aufgabenSortierenAction` geschrieben; schlägt der Schreibvorgang fehl,
 * bringt ein Reload die autoritative Reihenfolge zurück (kein eigener
 * Rückbau-Zustand — das Zurücksetzen der Serverliste würde denselben Fehler
 * ohnehin nur verschleiern).
 *
 * ANLEGEN/BEARBEITEN/LÖSCHEN LAUFEN ÜBER `AufgabeFormular` IM `Drawer` — die
 * Aktionen selbst liefern die aktualisierte/neue Zeile zurück, der lokale
 * State wird direkt daraus fortgeschrieben, kein zusätzlicher Refetch nötig.
 */
export function KatalogTabelle({ aufgaben: anfangsAufgaben }: { aufgaben: TaskDTO[] }) {
  const [aufgaben, setAufgaben] = useState<TaskDTO[]>(anfangsAufgaben);
  const [neuOffen, setNeuOffen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<TaskDTO | null>(null);
  const [busy, setBusy] = useState(false);

  function angelegt(aufgabe: TaskDTO): void {
    setAufgaben((liste) => [...liste, aufgabe]);
    setNeuOffen(false);
  }

  function geaendert(aufgabe: TaskDTO): void {
    setAufgaben((liste) => liste.map((a) => (a.id === aufgabe.id ? aufgabe : a)));
    setBearbeiten(null);
  }

  function geloescht(id: string): void {
    setAufgaben((liste) => liste.filter((a) => a.id !== id));
    setBearbeiten(null);
  }

  function verschieben(index: number, richtung: -1 | 1): void {
    const ziel = index + richtung;
    if (ziel < 0 || ziel >= aufgaben.length) return;
    const neu = [...aufgaben];
    const [bewegt] = neu.splice(index, 1);
    neu.splice(ziel, 0, bewegt);
    setAufgaben(neu);
    setBusy(true);
    void aufgabenSortierenAction(neu.map((a) => a.id)).finally(() => setBusy(false));
  }

  return (
    <div style={{ display: "grid", gap: SPACE.lg }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button type="primary" onClick={() => setNeuOffen(true)}>
          Aufgabe anlegen
        </Button>
      </div>

      <Table<TaskDTO>
        rowKey="id"
        dataSource={aufgaben}
        pagination={false}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: "Noch keine Aufgaben im Katalog." }}
        columns={[
          { title: "Teil", key: "teil", render: (_: unknown, a: TaskDTO) => TEIL_TITEL[a.teil] },
          { title: "Nummer", key: "nummer", render: (_: unknown, a: TaskDTO) => a.nummer },
          { title: "Titel", key: "titel", render: (_: unknown, a: TaskDTO) => a.titel },
          { title: "Ziel", key: "ziel", render: (_: unknown, a: TaskDTO) => a.zielanzahlDefault },
          {
            title: "Aktiv",
            key: "aktiv",
            render: (_: unknown, a: TaskDTO) => <Tag color={a.aktiv ? "green" : "default"}>{a.aktiv ? "aktiv" : "inaktiv"}</Tag>,
          },
          {
            title: "Bild",
            key: "bild",
            render: (_: unknown, a: TaskDTO) =>
              a.bildUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- kleine Vorschau, kein LCP-Kandidat.
                <img src={a.bildUrl} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
              ) : (
                "—"
              ),
          },
          {
            title: "Reihenfolge",
            key: "reihenfolge",
            render: (_: unknown, a: TaskDTO, index: number) => (
              <div style={{ display: "flex", gap: SPACE.xs }}>
                <Button onClick={() => verschieben(index, -1)} disabled={busy || index === 0} aria-label={`${a.nummer} nach oben`}>
                  ↑
                </Button>
                <Button
                  onClick={() => verschieben(index, 1)}
                  disabled={busy || index === aufgaben.length - 1}
                  aria-label={`${a.nummer} nach unten`}
                >
                  ↓
                </Button>
              </div>
            ),
          },
          {
            title: "Aktionen",
            key: "aktionen",
            render: (_: unknown, a: TaskDTO) => <Button onClick={() => setBearbeiten(a)}>Bearbeiten</Button>,
          },
        ]}
      />

      <Drawer open={neuOffen} onClose={() => setNeuOffen(false)} title="Neue Aufgabe" size={480} destroyOnHidden>
        <AufgabeFormular onGespeichert={angelegt} onAbbrechen={() => setNeuOffen(false)} />
      </Drawer>

      <Drawer
        open={bearbeiten != null}
        onClose={() => setBearbeiten(null)}
        title={bearbeiten ? `Aufgabe ${bearbeiten.nummer} bearbeiten` : undefined}
        size={480}
        destroyOnHidden
      >
        {bearbeiten ? (
          <AufgabeFormular
            aufgabe={bearbeiten}
            onGespeichert={geaendert}
            onGeloescht={geloescht}
            onAbbrechen={() => setBearbeiten(null)}
          />
        ) : null}
      </Drawer>
    </div>
  );
}

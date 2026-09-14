"use client";

import { useState } from "react";
import { Button, Drawer, Tag } from "antd";
import { Datentabelle } from "@/core/tabelle";
import { flyinBreite } from "@/core/theme/flyin";
import { aufgabenSortierenAction } from "../../_actions/katalog";
import type { TaskDTO, Teil } from "../../_lib/typen";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
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
 *
 * ══ DER `Seitenkopf` STEHT HIER UND NICHT IN `page.tsx`, UND DAS IST DIE EINZIGE
 *    DER DREI VERWALTUNGSSEITEN, BEI DER DAS SO IST. Sein `aktionen`-Platz trägt
 *    „Aufgabe anlegen", und dieser Knopf öffnet den `Drawer` — er braucht also
 *    denselben Zustand wie die Tabelle. Die Alternativen wären ein Context nur für
 *    ein Boolean oder eine zweite Client-Komponente, die den Zustand hochhebt und
 *    danach exakt diese Datei wäre. `Seitenkopf` trägt kein `"use client"`, ist aber
 *    reines Markup plus `next/link` und deshalb in einer Client-Insel unverändert
 *    richtig (Vorbild `files/_ui/PosteingangTabelle.tsx`, dieselbe Bauform).
 *    Vorher stand der Knopf in einer eigenen rechtsbündigen Zeile ÜBER der Tabelle,
 *    ohne Bezug zur Überschrift daneben.
 *
 * ══ EINE SPUR, DIE SCHRUMPFEN DARF — UND DAS WAR DER GANZE MOBILE ÜBERLAUF. `/admin/katalog`
 *    maß bei 390px Viewport `documentElement.scrollWidth === 808`, obwohl die Tabelle
 *    ihr `scroll={{ x: "max-content" }}` längst trug. Die Ursache lag eine Ebene
 *    darüber: ein Gitter- (wie ein Flex-) Kind hat die Vorgabe `min-width: auto` und
 *    schrumpft deshalb NICHT unter die Inhaltsbreite seines Kindes — der eigene
 *    Scroll-Container der Tabelle kam nie zum Zug, weil ihm niemand eine schmalere
 *    Spur gab. `gridTemplateColumns: "minmax(0, 1fr)"` ist die Spur, die schrumpfen
 *    darf. Kein Gate sieht das: die Zahl kennt nur ein echter Browser.
 *    ⚠️ `scroll={{ x: "max-content" }}` steht seit der Umstellung auf `@/core/tabelle`
 *    nicht mehr in dieser Datei — es ist dort die Vorgabe, zusammen mit
 *    `pagination={false}` und dem Spaltenkopf-Kicker. Die Spur darüber bleibt trotzdem
 *    nötig; sie ist die Hälfte, die `Datentabelle` nicht kennt.
 *
 * ══ ⛔ KEIN `sorter` UND KEIN `filters` AN IRGENDEINER SPALTE — als einzige der
 *    umgestellten Tabellen, und das ist fachlich, nicht vergessen. Die Reihenfolge der
 *    Zeilen IST hier der Inhalt: sie bestimmt, in welcher Folge die Teilnehmer ihre
 *    Aufgaben sehen, und sie wird mit den ↑/↓-Knöpfen der vorletzten Spalte bearbeitet.
 *    Diese Knöpfe hängen am `index`, den antd in `render` durchreicht — und das ist der
 *    Index der ANGEZEIGTEN Liste, nicht der von `aufgaben`. Sortierte jemand nach
 *    „Titel" oder filterte nach „Teil", verschöbe `verschieben(index, …)` die falsche
 *    Zeile, und `aufgabenSortierenAction` schriebe das Ergebnis fest. Ein Spaltenkopf,
 *    der die Bearbeitung darunter still falsch macht, ist kein Komfort. Wer hier
 *    Sortierung nachrüsten will, muss `verschieben` vorher auf `a.id` umstellen — und
 *    danach beantworten, was „nach oben" in einer nach etwas anderem sortierten Liste
 *    überhaupt heißen soll.
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
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.lg }}>
      <Seitenkopf
        titel="Aufgabenkatalog"
        beschreibung="Diese Aufgaben sehen die Teilnehmer in ihrem Training. Du legst fest, in welcher Reihenfolge sie erscheinen, wie oft jede geübt werden soll und welche gerade gilt."
        aktionen={
          <Button type="primary" onClick={() => setNeuOffen(true)}>
            Aufgabe anlegen
          </Button>
        }
      />

      <Datentabelle<TaskDTO>
        rowKey="id"
        dataSource={aufgaben}
        locale={{ emptyText: "Noch keine Aufgaben im Katalog." }}
        columns={[
          // Den Kicker setzt `Datentabelle`; `title` ist deshalb eine nackte Zeichenkette.
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

      {/*
        480 BLEIBT DIE WUNSCHBREITE. Dieses Formular braucht nicht mehr —
        gemessen (13.09.2026) sind es 835 px Inhalt, die auf jedem
        Desktop-Schirm in eine kurze Rolle passen. Neu ist allein der Deckel.

        ⚠️ UND ER BEHEBT HIER KEINEN GEMESSENEN AUSFALL — dieselbe Messung
        zeigte die Schublade bis hinunter zu 320 px Fensterbreite sauber im
        Bild (Schliessen-Knopf bei +24 px), weil antd bei `100vw` kappt. Er
        steht trotzdem, weil diese Kappung GEMESSENES Fremdverhalten ist und
        kein Vertrag, und weil sie an einer Seite mit waagerechtem Ueberlauf
        nachweislich zu spaet greift: im Modul `lagerbuch` war `100vw`
        506 px breit bei 480 px Fenster, und der Schliessen-Knopf stand
        ausserhalb. Welche Seite eines Tages ueberlaeuft, weiss die
        Schublade nicht. Begruendung in `core/theme/flyin.ts`.
      */}
      <Drawer
        open={neuOffen}
        onClose={() => setNeuOffen(false)}
        title="Neue Aufgabe"
        size={flyinBreite(480)}
        destroyOnHidden
      >
        <AufgabeFormular onGespeichert={angelegt} onAbbrechen={() => setNeuOffen(false)} />
      </Drawer>

      <Drawer
        open={bearbeiten != null}
        onClose={() => setBearbeiten(null)}
        title={bearbeiten ? `Aufgabe ${bearbeiten.nummer} bearbeiten` : undefined}
        size={flyinBreite(480)}
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

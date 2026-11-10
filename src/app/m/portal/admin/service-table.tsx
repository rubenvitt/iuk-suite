"use client";

import { useRef, useState } from "react";
import { Alert, Button, Dropdown, Modal } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Kartentabelle, nachJaNein, nachText, zustandsFilter } from "@/core/tabelle";
import { deleteServiceAction } from "@/app/m/portal/actions";
import type { GruppenOption } from "@/app/m/portal/_lib/gruppen";
import { SichtbarkeitAendern } from "@/app/m/portal/admin/sichtbarkeit-aendern";
import { DienstFlyin } from "@/app/m/portal/admin/dienst-flyin";

/** Was Tabelle und Formular von einem Dienst brauchen. Die Kennung (`slug`) fehlt mit Absicht: sie
 *  wird beim Anlegen aus dem Namen vergeben und nirgends gezeigt (IDA-391). */
export interface ServiceRow {
  id: string;
  name: string;
  url: string;
  description: string;
  category: string | null;
  iconUrl: string | null;
  openInNewTab: boolean;
  isPublic: boolean;
  requiredGroups: string[];
}

type Aktion = "bearbeiten" | "sichtbarkeit" | "loeschen";

/**
 * „Sichtbar für" haengt an einem WAHRHEITSWERT und ist deshalb kein
 * `werteAlsFilter`: dessen Liste entsteht aus Textfeldern. Zwei benannte
 * Zustaende sind hier die ganze Wahrheit — und „alle" heiszt in der Liste
 * genauso wie in der Zelle, sonst stuenden zwei Woerter fuer denselben Zustand.
 */
const ALLE = "alle";
const SICHTBAR_FILTER = zustandsFilter<ServiceRow>([
  { wert: "alle", text: ALLE, trifft: (zeile) => zeile.isPublic },
  { wert: "gruppen", text: "nur Gruppen", trifft: (zeile) => !zeile.isPublic },
]);

/** Was die Zelle zeigt: „alle" oder die Gruppen mit ihrem Anzeigenamen aus Pocket ID. */
export function sichtbarFuer(zeile: ServiceRow, gruppen: readonly GruppenOption[]): string {
  if (zeile.isPublic) return ALLE;
  if (zeile.requiredGroups.length === 0) return "niemand";
  const anzeige = new Map(gruppen.map((g) => [g.wert, g.anzeige]));
  return zeile.requiredGroups.map((g) => anzeige.get(g) ?? g).join(", ");
}

/**
 * DIE ZEILENAKTIONEN STEHEN IN EINEM MENÜ (IDA-391). Vorher stand „Löschen" als roter Knopf 8 px
 * neben „Sichtbarkeit" und löschte beim ersten Klick, ohne Rückfrage und ohne Rückgängig. Jetzt:
 * ein 44-px-Knopf „Aktionen" je Zeile, darin Bearbeiten, Sichtbarkeit und Löschen — und Löschen
 * fragt nach, mit dem Namen des Dienstes. Kein Dienst verschwindet durch einen einzelnen Klick.
 *
 * Schublade und Dialoge gibt es EINMAL für die Tabelle, nicht je Zeile: die Zeile setzt nur, welche
 * Aktion an welchem Dienst offen ist.
 *
 * Die Actions werden DIREKT importiert, nicht als Prop durchgereicht (Falle 9, `CLAUDE.md`; DRK-398).
 */
export function ServiceTable({
  services,
  gruppen,
  kategorien = [],
  gruppenNichtAbrufbar = false,
}: {
  services: ServiceRow[];
  gruppen: GruppenOption[];
  kategorien?: string[];
  gruppenNichtAbrufbar?: boolean;
}) {
  const [zeile, setZeile] = useState<ServiceRow | null>(null);
  const [aktion, setAktion] = useState<Aktion | null>(null);
  const [oeffnung, setOeffnung] = useState(0);
  const [loescht, setLoescht] = useState(false);
  const [loeschFehler, setLoeschFehler] = useState(false);
  const ausloeser = useRef<HTMLElement | null>(null);
  const schliessen = () => {
    setLoeschFehler(false);
    setAktion(null);
  };

  async function loeschen(dienst: ServiceRow) {
    setLoescht(true);
    setLoeschFehler(false);
    try {
      const daten = new FormData();
      daten.set("id", dienst.id);
      await deleteServiceAction(daten);
      schliessen();
    } catch {
      // Datenbankfehler oder abgelaufene Sitzung: der Dialog bleibt offen und sagt es.
      setLoeschFehler(true);
    } finally {
      setLoescht(false);
    }
  }

  // Das data-testid sitzt am umschließenden div, NICHT an <Table>: antds Table
  // reicht unbekannte DOM-Attribute nicht zuverlässig durch, und ein still
  // verschwindendes Testid wäre erst im nächsten Testlauf aufgefallen.
  return (
    <div data-testid="service-table">
    <Kartentabelle<ServiceRow>
      rowKey="id"
      aria-label="Dienste"
      dataSource={services}
      size="small"
      leer={{ nichts: "Noch keine Dienste", figur: "portal" }}
      onRow={() => ({ "data-testid": "service-row" }) as React.HTMLAttributes<HTMLElement>}
      columns={[
        // Spaltenkoepfe sind nackte Zeichenketten — die Kicker-Rolle setzt
        // `Datentabelle` selbst (`docs/design/README.md`).
        {
          title: "Name",
          dataIndex: "name",
          sorter: nachText<ServiceRow>((zeile) => zeile.name),
        },
        {
          // Nach Adresse zu sortieren gruppiert die Dienste nach Host — das ist
          // die Frage, die man an eine URL-Spalte stellt („was laeuft auf X?").
          title: "Adresse",
          dataIndex: "url",
          sorter: nachText<ServiceRow>((zeile) => zeile.url),
        },
        {
          // Ersetzt die Spalte „Slug" (IDA-391): die Kategorie entscheidet, unter
          // welcher Überschrift die Kachel steht; die Kennung sieht niemand.
          // `e2e/mobil-admin.spec.ts` misst weiter fünf Spalten.
          title: "Kategorie",
          key: "kategorie",
          sorter: nachText<ServiceRow>((zeile) => zeile.category ?? ""),
          render: (_, zeile) => zeile.category ?? "",
        },
        {
          title: "Sichtbar für",
          key: "sichtbarFuer",
          sorter: nachJaNein<ServiceRow>((zeile) => zeile.isPublic),
          ...SICHTBAR_FILTER,
          render: (_, zeile) => sichtbarFuer(zeile, gruppen),
        },
        {
          title: "",
          key: "aktionen",
          align: "right",
          render: (_, row) => (
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  { key: "bearbeiten", label: "Bearbeiten", icon: <Icons8Ikone name="pencil" groesse={16} /> },
                  { key: "sichtbarkeit", label: "Sichtbarkeit", icon: <Icons8Ikone name="people" groesse={16} /> },
                  { type: "divider" },
                  { key: "loeschen", label: "Löschen", danger: true, icon: <Icons8Ikone name="trash" groesse={16} /> },
                ],
                onClick: ({ key }) => {
                  setZeile(row);
                  setOeffnung((n) => n + 1);
                  setAktion(key as Aktion);
                },
              }}
            >
              {/* KEIN `size` (Falle 4) — 44 px aus der Arbeitsdichte. */}
              <Button
                data-testid="dienst-aktionen"
                aria-label={`Aktionen für ${row.name}`}
                icon={<Icons8Ikone name="more" groesse={18} />}
                onClick={(e) => {
                  ausloeser.current = e.currentTarget;
                }}
              />
            </Dropdown>
          ),
        },
      ]}
    />
    <DienstFlyin
      offen={aktion === "bearbeiten"}
      dienst={zeile ?? undefined}
      gruppen={gruppen}
      kategorien={kategorien}
      gruppenNichtAbrufbar={gruppenNichtAbrufbar}
      ausloeser={ausloeser}
      onSchliessen={schliessen}
    />
    {zeile ? (
      <SichtbarkeitAendern
        key={`${zeile.id}-${oeffnung}`}
        dienst={zeile}
        gruppen={gruppen}
        offen={aktion === "sichtbarkeit"}
        onSchliessen={schliessen}
      />
    ) : null}
    <Modal
      open={aktion === "loeschen" && zeile !== null}
      title={zeile ? `„${zeile.name}“ löschen?` : undefined}
      okText="Löschen"
      cancelText="Abbrechen"
      okButtonProps={{ danger: true }}
      confirmLoading={loescht}
      onOk={() => {
        if (zeile) void loeschen(zeile);
      }}
      onCancel={schliessen}
    >
      <p style={{ marginBlock: 0 }}>Die Kachel verschwindet für alle. Das lässt sich nicht rückgängig machen.</p>
      {loeschFehler ? (
        <Alert type="error" showIcon title="Der Dienst ließ sich nicht löschen." data-testid="dienst-loeschen-fehler" style={{ marginBlockStart: 12 }} />
      ) : null}
    </Modal>
    </div>
  );
}

"use client";

import { Button } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { Kartentabelle, nachJaNein, nachText, zustandsFilter } from "@/core/tabelle";
import { deleteServiceAction } from "@/app/m/portal/actions";
import type { GruppenOption } from "@/app/m/portal/_lib/gruppen";
import { SichtbarkeitAendern } from "@/app/m/portal/admin/sichtbarkeit-aendern";

export interface ServiceRow {
  id: string;
  name: string;
  slug: string;
  url: string;
  isPublic: boolean;
  requiredGroups: string[];
}

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
 * Die Loesch-Action wird DIREKT importiert, nicht als Prop durchgereicht
 * (Falle 9, `CLAUDE.md`; DRK-398). Die Tabelle hat genau einen Aufrufer und
 * zeigt genau diese Dienste — eine allgemeine Tabelle, die an eine Action
 * gebunden wuerde, ist sie nicht. Dieselbe Form wie `service-form.tsx`.
 */
export function ServiceTable({
  services,
  gruppen,
}: {
  services: ServiceRow[];
  gruppen: GruppenOption[];
}) {
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
      // Kein Diagramm, keine Karte darunter — der Leerzustand nennt den
      // naechsten Schritt direkt (Formular steht im selben Abschnitt darunter).
      leer={{ nichts: "Noch keine Dienste angelegt. Lege unten den ersten an." }}
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
          title: "Slug",
          dataIndex: "slug",
          sorter: nachText<ServiceRow>((zeile) => zeile.slug),
        },
        {
          // Nach Adresse zu sortieren gruppiert die Dienste nach Host — das ist
          // die Frage, die man an eine URL-Spalte stellt („was laeuft auf X?").
          title: "URL",
          dataIndex: "url",
          sorter: nachText<ServiceRow>((zeile) => zeile.url),
        },
        {
          // Ersetzt die Spalte „Öffentlich" (IDA-227) statt eine sechste
          // anzuhaengen: `e2e/mobil-admin.spec.ts` misst genau fuenf Spalten.
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
          // Natives <form> mit der Server Action, kein onClick-Handler: so
          // funktioniert das Löschen auch ohne JavaScript und bleibt genau das
          // Muster, das die Seite vorher hatte.
          render: (_, row) => (
            <div style={{ display: "inline-flex", gap: SPACE.sm, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <SichtbarkeitAendern dienst={row} gruppen={gruppen} />
              <form action={deleteServiceAction}>
                <input type="hidden" name="id" value={row.id} />
                <Button htmlType="submit" danger>
                  Löschen
                </Button>
              </form>
            </div>
          ),
        },
      ]}
    />
    </div>
  );
}

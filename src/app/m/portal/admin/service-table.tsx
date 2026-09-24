"use client";

import { Button } from "antd";
import { Kartentabelle, nachJaNein, nachText, zustandsFilter } from "@/core/tabelle";
import { deleteServiceAction } from "@/app/m/portal/actions";

export interface ServiceRow {
  id: string;
  name: string;
  slug: string;
  url: string;
  isPublic: boolean;
}

/**
 * „Öffentlich" ist ein WAHRHEITSWERT und deshalb kein `werteAlsFilter`: dessen
 * Liste entsteht aus Textfeldern. Zwei benannte Zustaende sind hier die ganze
 * Wahrheit — und sie heiszen in der Liste genauso wie in der Zelle („ja"/„nein"),
 * sonst stuenden zwei Woerter fuer denselben Zustand.
 */
const OEFFENTLICH_FILTER = zustandsFilter<ServiceRow>([
  { wert: "ja", text: "ja", trifft: (zeile) => zeile.isPublic },
  { wert: "nein", text: "nein", trifft: (zeile) => !zeile.isPublic },
]);

/**
 * Die Loesch-Action wird DIREKT importiert, nicht als Prop durchgereicht
 * (Falle 9, `CLAUDE.md`; DRK-398). Die Tabelle hat genau einen Aufrufer und
 * zeigt genau diese Dienste — eine allgemeine Tabelle, die an eine Action
 * gebunden wuerde, ist sie nicht. Dieselbe Form wie `service-form.tsx`.
 */
export function ServiceTable({ services }: { services: ServiceRow[] }) {
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
          title: "Öffentlich",
          dataIndex: "isPublic",
          sorter: nachJaNein<ServiceRow>((zeile) => zeile.isPublic),
          ...OEFFENTLICH_FILTER,
          render: (v: boolean) => (v ? "ja" : "nein"),
        },
        {
          title: "",
          key: "aktionen",
          align: "right",
          // Natives <form> mit der Server Action, kein onClick-Handler: so
          // funktioniert das Löschen auch ohne JavaScript und bleibt genau das
          // Muster, das die Seite vorher hatte.
          render: (_, row) => (
            <form action={deleteServiceAction}>
              <input type="hidden" name="id" value={row.id} />
              <Button htmlType="submit" danger>
                Löschen
              </Button>
            </form>
          ),
        },
      ]}
    />
    </div>
  );
}

"use client";

import { Button, Table } from "antd";

export interface ServiceRow {
  id: string;
  name: string;
  slug: string;
  url: string;
  isPublic: boolean;
}

export function ServiceTable({
  services,
  deleteAction,
}: {
  services: ServiceRow[];
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  // Das data-testid sitzt am umschließenden div, NICHT an <Table>: antds Table
  // reicht unbekannte DOM-Attribute nicht zuverlässig durch, und ein still
  // verschwindendes Testid wäre erst im nächsten Testlauf aufgefallen.
  return (
    <div data-testid="service-table">
    <Table<ServiceRow>
      rowKey="id"
      dataSource={services}
      pagination={false}
      size="small"
      /*
       * SCROLLEN STATT DIE SEITE MITNEHMEN (docs/design/README.md, „Mobil").
       * Ohne diese Prop setzt rc-table keinen Overflow-Container; die Tabelle
       * lief bei 390px mit 483px Breite in einem 358px-Kasten ueber und das
       * ganze Dokument scrollte seitwaerts (gemessen: scrollWidth 499). Beide
       * „Loeschen"-Knoepfe standen auszerhalb des Sichtfelds, und wegen der
       * suiteweiten Zoom-Sperre konnte man sie auch nicht heranholen.
       *
       * `max-content` und keine Zahl, weil KEINE Spalte ein `width` traegt.
       * Auf dem Desktop aendert sich dadurch nichts Grundsaetzliches: rc-table
       * bleibt auf `table-layout: auto` (keine Spalte mit `fixed`, kein
       * `scroll.y`, kein `ellipsis`), und `min-width: 100%` haelt die Tabelle
       * so breit wie ihren Container. Gemessen (1280x800, vorher/nachher, s.
       * Task-2-Bericht) traegt `scroll.x` aber eine zusaetzliche, unsichtbare
       * `MeasureRow` in tbody ein (rc-table schaltet damit auf
       * `measureColumnWidth`), die bei `auto`-Layout selbst mitmisst und die
       * Spaltenbreiten um 1-4px verschiebt: `[233,229,380,200,207]` wurde zu
       * `[232,228,378,204,207]`. Summe und grobe Verteilung bleiben gleich,
       * der Modus bleibt `auto` — aber "nichts aendert sich" gilt nicht
       * pixelgenau. Belegt in `e2e/mobil-admin.spec.ts` bei 1280x800.
       */
      scroll={{ x: "max-content" }}
      onRow={() => ({ "data-testid": "service-row" }) as React.HTMLAttributes<HTMLElement>}
      columns={[
        { title: "Name", dataIndex: "name" },
        { title: "Slug", dataIndex: "slug" },
        { title: "URL", dataIndex: "url" },
        { title: "Öffentlich", dataIndex: "isPublic", render: (v: boolean) => (v ? "ja" : "nein") },
        {
          title: "",
          key: "aktionen",
          align: "right",
          // Natives <form> mit der Server Action, kein onClick-Handler: so
          // funktioniert das Löschen auch ohne JavaScript und bleibt genau das
          // Muster, das die Seite vorher hatte.
          render: (_, row) => (
            <form action={deleteAction}>
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

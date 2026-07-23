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
              <Button htmlType="submit" danger size="small">
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

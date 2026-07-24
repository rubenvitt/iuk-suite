"use client";
import Link from "next/link";
import { Table } from "antd";

interface Group {
  id: number;
  name: string;
  slug: string;
}

export function GroupList({ groups }: { groups: Group[] }) {
  // antd `List` ist in antd 6 deprecated — `Table` ist der Ersatz für die
  // Verwaltungs-UI. `data-testid` sitzt (wie bei ServiceTable) über `onRow`
  // auf dem `<tr>`, nicht direkt an `<Table>`: antds Table reicht unbekannte
  // DOM-Attribute sonst nicht zuverlässig durch.
  return (
    <Table<Group>
      rowKey="id"
      dataSource={groups}
      pagination={false}
      size="small"
      locale={{ emptyText: "Keine Gruppen" }}
      onRow={() => ({ "data-testid": "group-row" }) as React.HTMLAttributes<HTMLElement>}
      columns={[
        {
          title: "Gruppe",
          key: "name",
          render: (_, g) => <Link href={`/m/feedback/groups/${g.id}`}>{g.name}</Link>,
        },
      ]}
    />
  );
}

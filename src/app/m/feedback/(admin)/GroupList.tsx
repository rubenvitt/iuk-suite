"use client";
import Link from "next/link";
import { List } from "antd";

export function GroupList({
  groups,
}: {
  groups: { id: number; name: string; slug: string }[];
}) {
  return (
    <List
      dataSource={groups}
      locale={{ emptyText: "Keine Gruppen" }}
      renderItem={(g) => (
        <List.Item data-testid="group-row">
          <Link href={`/m/feedback/groups/${g.id}`}>{g.name}</Link>
        </List.Item>
      )}
    />
  );
}

"use client";
import { Button, Input, Space } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { createEveningAction } from "../actions";

export function EveningForm({ groupId }: { groupId: number }) {
  return (
    <form action={createEveningAction}>
      <input type="hidden" name="groupId" value={groupId} />
      <Space orientation="horizontal" size={SPACE.sm} wrap>
        <Input name="date" type="date" required />
        <Input name="topic" placeholder="Thema (optional)" />
        <Input name="notes" placeholder="Notizen (optional)" />
        <Input name="participantCount" placeholder="Teilnehmer" type="number" />
        <Button htmlType="submit" type="primary">
          Dienstabend anlegen
        </Button>
      </Space>
    </form>
  );
}

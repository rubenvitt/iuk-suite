"use client";
import { Button, Input, Space } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { createGroupAction } from "../actions";

export function GroupForm() {
  return (
    <form action={createGroupAction}>
      <Space orientation="horizontal" size={SPACE.sm} wrap>
        <Input name="name" placeholder="Name" required />
        <Input name="slug" placeholder="slug" required />
        <Input name="closeAfterHours" placeholder="Frist (h)" type="number" />
        <Button htmlType="submit" type="primary">
          Gruppe anlegen
        </Button>
      </Space>
    </form>
  );
}

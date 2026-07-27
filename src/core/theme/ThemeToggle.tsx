"use client";

import { Button, Tooltip } from "antd";
import { BulbFilled, BulbOutlined } from "@ant-design/icons";
import { useThemeMode } from "@/core/theme/AntdProvider";

export function ThemeToggle({ testId = "theme-toggle" }: { testId?: string } = {}) {
  const { mode, setMode } = useThemeMode();
  const next = mode === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Dunkles Design" : "Helles Design";

  return (
    <Tooltip title={label}>
      <Button
        type="text"
        shape="circle"
        data-testid={testId}
        aria-label={label}
        icon={mode === "dark" ? <BulbFilled /> : <BulbOutlined />}
        onClick={() => setMode(next)}
      />
    </Tooltip>
  );
}

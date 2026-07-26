"use client";
import {
  ResponsiveContainer,
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { theme } from "antd";

export function BarChart({
  data,
  xKey,
  yKey,
  domain,
  emptyText,
}: {
  data: Record<string, string | number | null>[];
  xKey: string;
  yKey: string;
  domain?: [number, number];
  emptyText?: string;
}) {
  const { token } = theme.useToken();

  if (data.length === 0) {
    return (
      <div
        style={{
          height: 280,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: token.colorTextTertiary,
        }}
      >
        {emptyText ?? "Noch keine Rückmeldungen"}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RBarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
        <XAxis dataKey={xKey} stroke={token.colorTextSecondary} tick={{ fill: token.colorTextSecondary }} />
        <YAxis domain={domain} stroke={token.colorTextSecondary} tick={{ fill: token.colorTextSecondary }} />
        <Tooltip />
        <Bar dataKey={yKey} fill={token.colorPrimary} />
      </RBarChart>
    </ResponsiveContainer>
  );
}

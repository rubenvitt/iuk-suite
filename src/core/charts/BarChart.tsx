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

export function BarChart({
  data,
  xKey,
  yKey,
  domain,
}: {
  data: Record<string, string | number | null>[];
  xKey: string;
  yKey: string;
  domain?: [number, number];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <RBarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xKey} />
        <YAxis domain={domain} />
        <Tooltip />
        <Bar dataKey={yKey} fill="#c8000f" />
      </RBarChart>
    </ResponsiveContainer>
  );
}

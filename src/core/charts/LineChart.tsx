"use client";
import {
  ResponsiveContainer,
  LineChart as RLineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export function LineChart({
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
      <RLineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xKey} />
        <YAxis domain={domain} />
        <Tooltip />
        <Line dataKey={yKey} stroke="#c8000f" connectNulls={false} />
      </RLineChart>
    </ResponsiveContainer>
  );
}

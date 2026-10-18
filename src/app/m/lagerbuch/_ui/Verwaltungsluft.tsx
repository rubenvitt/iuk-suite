"use client";

import { ConfigProvider } from "antd";
import { VERWALTUNGSLUFT } from "../_lib/dichte";

/**
 * DIE LUFT DER VERWALTUNG ALS CLIENT-INSEL — Bauform wie
 * `core/theme/Schreibtischdichte.tsx`. Steht INNERHALB der `ARBEITSDICHTE` von
 * `Shell`: antd mischt das innere Theme ins äußere (`useTheme.js`, `components`
 * je Bauteil), die 44 px kommen also weiter von außen, nur Zellen- und
 * Kartenpolster von hier. Begründung der Zahlen: `_lib/dichte.ts`.
 *
 * KEIN WRAPPER-KNOTEN: der Provider rendert nur Kontext, das Layout bleibt.
 */
export function Verwaltungsluft({ children }: { children: React.ReactNode }) {
  return <ConfigProvider theme={VERWALTUNGSLUFT}>{children}</ConfigProvider>;
}

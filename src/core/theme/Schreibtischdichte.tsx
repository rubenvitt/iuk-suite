"use client";

import { ConfigProvider } from "antd";

import { SCHREIBTISCHDICHTE } from "@/core/theme/theme";

/**
 * DIE SCHREIBTISCHDICHTE ALS CLIENT-INSEL — Bauform 1:1 nach `Arbeitsdichte.tsx`
 * und aus denselben zwei Gründen: der Grund für die Dichte gehört zum Theme und
 * nicht zur Shell, und `SCHREIBTISCHDICHTE` wird hier EINMAL importiert statt an
 * jeder künftigen Aufrufstelle.
 *
 * Die Importrichtung ist die unproblematische: `theme.ts` trägt KEIN
 * `"use client"`, und ein Wert von dort in eine Client-Insel zu ziehen ist
 * erlaubt (verboten ist die umgekehrte, Falle 6).
 *
 * ⚠️ SIE STEHT INNERHALB DER ARBEITSDICHTE, nicht an ihrer Stelle: der Rahmen des
 * Verwaltungszweigs setzt sie unter `Shell`, und antds `ConfigProvider` mischt
 * das innere Theme in das äuszere (`useTheme.js:44-53`) — 32/40 gewinnt, der
 * `Radio`-Block und alles Übrige kommen von auszen.
 *
 * KEIN WRAPPER-KNOTEN. antd hängt seine cssVar-Klasse in jeder KOMPONENTE selbst
 * an (`_util/hooks/useCSSVarCls`), nicht an einem Container — das Layout ändert
 * sich dadurch nicht.
 */
export function Schreibtischdichte({ children }: { children: React.ReactNode }) {
  return <ConfigProvider theme={SCHREIBTISCHDICHTE}>{children}</ConfigProvider>;
}

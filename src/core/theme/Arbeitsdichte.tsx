"use client";

import { ConfigProvider } from "antd";

import { ARBEITSDICHTE } from "@/core/theme/theme";

/**
 * DIE ARBEITSDICHTE ALS CLIENT-INSEL — dünn mit Absicht.
 *
 * `ConfigProvider` ist eine Client-Komponente; sie ließe sich auch direkt aus
 * `FullShell` (Server Component) heraus rendern. Diese Insel steht trotzdem
 * dazwischen, aus zwei Gründen: der Grund für die Dichte gehört zum Theme
 * und nicht zur Shell, und `ARBEITSDICHTE` wird hier EINMAL importiert statt an
 * jeder künftigen Aufrufstelle.
 *
 * Die Importrichtung ist die unproblematische: `theme.ts` trägt KEIN
 * `"use client"`, und ein Wert von dort in eine Client-Insel zu ziehen ist
 * erlaubt (verboten ist die umgekehrte, Falle 6).
 *
 * KEIN WRAPPER-KNOTEN. antd hängt seine cssVar-Klasse in jeder KOMPONENTE
 * selbst an (`_util/hooks/useCSSVarCls`: `${prefixCls}-css-var`), nicht an
 * einem Container — der Provider rendert nur seinen Kontext. Das Layout ändert
 * sich dadurch nicht.
 */
export function Arbeitsdichte({ children }: { children: React.ReactNode }) {
  return <ConfigProvider theme={ARBEITSDICHTE}>{children}</ConfigProvider>;
}

"use client";

import type { ReactNode } from "react";
import { ConfigProvider } from "antd";
import { FEST_HELL } from "./festHell";

/**
 * DIE DRUCKFLÄCHEN BLEIBEN HELL, AUCH IM DUNKELMODUS (IDA-380).
 *
 * Ein Blatt Papier hat keinen Dunkelmodus, und die Vorschau am Bildschirm ist
 * ein Blatt. Bis hierher war nur das Blatt selbst fest weiß (`druck.css`), die
 * Bedienleiste darüber folgte dem Theme — und stand damit als helle Schrift
 * auf dem weißen Bogen: „Zurück zu Fahrzeugen und Taschen", „Kompakt" und
 * „Blindzählung" maßen 1,04:1.
 *
 * ZWEI HÄLFTEN, und beide sind nötig:
 *  - `ConfigProvider` mit `FEST_HELL` stellt antds Bauteile (Knöpfe,
 *    Kontrollkästchen) auf den hellen Algorithmus — über antds eigene Tokens,
 *    nicht über CSS gegen seine Klassen (Fallen 5 und 20).
 *  - `.lb-festHell` (`druck.css`) setzt Grund, Schrift, `color-scheme` und die
 *    eigenen Variablen (`--iuk-*`, `--lb-*`) auf ihre hellen Werte. antds
 *    Variablen sieht eigenes Markup nicht (Falle 2), also tragen die eigenen.
 *
 * Das Menü der Suite liegt AUSSERHALB und folgt weiter dem Theme.
 */
export function FestHell({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider theme={FEST_HELL}>
      <div className="lb-festHell" data-testid="lb-fest-hell">{children}</div>
    </ConfigProvider>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "antd";
import type { AmpelTon } from "../_lib/format";
import { SCHRIFT } from "../_lib/schrift";
import { Ikone } from "./ikonen";
import s from "./verwaltung.module.css";

/**
 * DIE KENNZAHLKACHEL — `Card` plus eigene Kante, KEIN `Statistic`.
 *
 * `Card` ist in RSC sicher (docs/design/README.md:43). `Statistic` waere es
 * auch, aber die farbige ZAHL ist genau „Rot auf einer Datenflaeche": eine
 * rote 7 ist von einer 7 in Suite-Rot nicht zu unterscheiden, und ein
 * Zahlenwert ist die Datenflaeche schlechthin. DIE KANTE TRAEGT DIE FARBE,
 * DIE ZAHL TRAEGT TINTE — und genau die Form „Text plus 3px linke Kante" ist
 * das, was docs/design/README.md:57 als Ersatz fuer ein rotes `Alert`
 * VORSCHLAEGT.
 *
 * `grau` faerbt die Kante NICHT. Er ist kein Ampelwert (§6.6.2) — eine graue
 * Kante neben einer roten und einer gruenen laese sich als vierte Stufe lesen,
 * und die gibt es nicht.
 *
 * DIE ZAHL TRAEGT `tabular-nums` (§6.7.3). Kacheln stehen nebeneinander und
 * werden verglichen; ohne sie wandern die Ziffern gegeneinander.
 *
 * EIN TEIL DER KACHELN IST VERLINKT (Beispiel: die beiden `verfall`-Kacheln
 * auf `verwaltung/(arbeit)/page.tsx`). Eine klickbare Kachel ohne erkennbare
 * Klickbarkeit ist eine Sackgasse fuer alle, die es nicht zufaellig
 * ausprobieren — deshalb tragen die verlinkten ein Chevron und (ueber
 * `.kpiLink`) einen Hover, und die nicht verlinkten tragen KEINEN
 * Hover-Effekt.
 *
 * DIE ANORDNUNG MACHT DER AUFRUFER mit `Row`/`Col` und `xs`/`md`, nicht diese
 * Komponente. Das heutige `grid-template-columns: repeat(auto-fill,
 * minmax(190px, 1fr))` samt zweiter Fassung bei <=760px entfaellt mit dem
 * 760px-Block (§6.8.6).
 */
const KANTE: Partial<Record<AmpelTon, string>> = {
  rot: s.kpiRot,
  gelb: s.kpiGelb,
  ok: s.kpiOk,
};

export function Kachel({
  zahl,
  beschriftung,
  ton,
  href,
}: {
  zahl: ReactNode;
  beschriftung: ReactNode;
  ton?: AmpelTon;
  href?: string;
}) {
  const inhalt = (
    <div className={[s.kpi, ton ? KANTE[ton] : undefined].filter(Boolean).join(" ")}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span data-rolle="kachelzahl" style={{ ...SCHRIFT.zahl }}>
          {zahl}
        </span>
        {href ? <Ikone name="chevron-rechts" /> : null}
      </div>
      <div style={{ ...SCHRIFT.neben, marginBlockStart: 4 }}>{beschriftung}</div>
    </div>
  );

  return (
    <Card styles={{ body: { padding: 12 } }} style={{ height: "100%" }}>
      {href ? (
        <Link className={s.kpiLink} href={href}>
          {inhalt}
        </Link>
      ) : (
        inhalt
      )}
    </Card>
  );
}

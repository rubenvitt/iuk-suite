import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "antd";
import type { ChipTon } from "../_lib/anzeige";
import { SCHRIFT } from "@/core/theme/schrift";
import { Ikone } from "./ikonen";
import s from "./aufgaben.module.css";

/*
 * DIE KENNZAHLKACHEL — `Card` plus eigene Kante, KEIN `Statistic` (Vorbild
 * `lagerbuch/_ui/Kachel.tsx`).
 *
 * `Card` ist compound-frei und in RSC sicher; `Statistic` waere es auch, aber
 * seine Zahl TRAEGT FARBE, und eine farbige Zahl auf einer Datenflaeche ist
 * in dieser Suite Rot (Spec §9.3 — Menge ist keine Statusfarbe). DIE KANTE
 * TRAEGT DIE FARBE, DIE ZAHL TRAEGT TINTE.
 *
 * NUR `achtung`/`ocker`/`ok` FAERBEN DIE KANTE — `grau` und `stahl` haben
 * bewusst KEINE `.kpiKante*`-Klasse (`aufgaben.module.css` fuehrt nur drei),
 * genau wie `lagerbuch`s `AmpelTon` „grau" die Kante nicht faerbt: eine
 * Kachel ohne Befund bekommt keine Kante, keine vierte Ampelstufe.
 * `Partial<Record<ChipTon, string>>` statt Indexzugriff aufs CSS-Modul: ein
 * fehlender Eintrag liefert bewusst `undefined` (keine Kante), nie eine
 * verunglueckte Klasse.
 *
 * KEIN `Card.Meta` — Compound-Zugriff, Falle 1 — und kein `title`-Prop an
 * `Card`: Beschriftung und Zahl liegen im Kartenrumpf, nicht im Titel, damit
 * die Frage „muss der Titel ein String sein" gar nicht erst entsteht.
 *
 * DIE ZAHL TRAEGT `tabular-nums` ueber `SCHRIFT.zahl` (30/700) — Kacheln
 * stehen nebeneinander und werden verglichen, ohne feste Ziffernbreite
 * wandert die Spalte mit jedem neuen Wert.
 *
 * VERLINKTE KACHELN tragen einen Chevron und (ueber `.kpiLink`) einen Hover;
 * unverlinkte tragen keinen — eine klickbare Kachel ohne erkennbares
 * Zeichen ist eine Sackgasse fuer alle, die es nicht zufaellig ausprobieren.
 * `href` traegt die AEUSZERE Pfadform (`/verteilen`, nicht `/m/aufgaben/…") —
 * unter dem Host-Rewrite fuehrt nur die aeuszere Form an die richtige Stelle.
 *
 * DIE ANORDNUNG (Spaltenzahl, Reihenfolge) MACHT DER AUFRUFER — diese
 * Komponente kennt nur eine einzelne Kachel.
 */
const KANTE: Partial<Record<ChipTon, string>> = {
  achtung: s.kpiKanteAchtung,
  ocker: s.kpiKanteOcker,
  ok: s.kpiKanteOk,
};

export function Kachel({
  zahl,
  beschriftung,
  ton,
  href,
}: {
  zahl: ReactNode;
  beschriftung: ReactNode;
  ton?: ChipTon;
  href?: string;
}) {
  const kante = ton ? KANTE[ton] : undefined;
  const inhalt = (
    <div className={[s.kpi, kante].filter(Boolean).join(" ")}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={SCHRIFT.zahl}>{zahl}</span>
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

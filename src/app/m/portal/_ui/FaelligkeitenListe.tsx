import { Card } from "antd";

import { woAnzeige, type Faelligkeit } from "@/core/faelligkeiten";
import type { FaelligkeitsGruppe } from "@/app/m/portal/_lib/faelligkeiten/sammeln";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * DIE LISTE AUF „WAS STEHT AN" (IDA-297) — je Modul eine Karte, darin die Fälligkeiten, überfällige
 * zuerst. Jede Zeile führt an die Stelle im Modul, an der die Sache erledigt wird.
 *
 * KEIN `"use client"` und kein Compound-Zugriff (Falle 1): nur `Card` und eigenes Markup, es gibt
 * nichts zu bedienen. Keine `Table`: `columns[].render` ginge nicht über die RSC-Grenze (Falle 9), und
 * eine Tabelle mit fünf Spalten wäre am Telefon — wo die Mitteilung hinführt — die falsche Form.
 *
 * ⚠️ DIE DRINGLICHKEIT STEHT ALS WORT, NICHT ALS FARBE. Rot ist im Portal Marke und Primäraktion
 * (Falle 3), und Bedeutung nie allein über Farbe (`docs/design/README.md`).
 */
export function FaelligkeitenListe({ gruppen }: { gruppen: readonly FaelligkeitsGruppe[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.lg, maxInlineSize: 820 }}>
      {gruppen.map((g) => (
        <Card key={g.modul} title={g.titel} extra={<Zaehler gruppe={g} />} data-testid={`faellig-${g.modul}`}>
          {g.fehler ? (
            <p style={{ ...SCHRIFT.text, margin: 0 }}>
              Das {g.titel} konnte gerade nicht gelesen werden. Versuch es später noch einmal oder sieh direkt im Modul nach.
            </p>
          ) : g.eintraege.length === 0 ? (
            <p style={{ ...SCHRIFT.text, margin: 0, color: "var(--iuk-gedaempft)" }}>Hier steht gerade nichts an.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {g.eintraege.map((e, i) => (
                <li key={e.id} style={i > 0 ? { borderBlockStart: "1px solid var(--iuk-linie)" } : undefined}>
                  <Zeile eintrag={e} href={g.basisUrl ? `${g.basisUrl}${e.pfad}` : null} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}

function Zaehler({ gruppe }: { gruppe: FaelligkeitsGruppe }) {
  if (gruppe.fehler || gruppe.eintraege.length === 0) return null;
  const ueber = gruppe.eintraege.filter((e) => e.dringlichkeit === "ueberfaellig").length;
  const bald = gruppe.eintraege.length - ueber;
  const teile = [ueber > 0 && `${ueber} überfällig`, bald > 0 && `${bald} bald`].filter(Boolean);
  return <span style={{ ...SCHRIFT.neben, color: "var(--iuk-gedaempft)" }}>{teile.join(" · ")}</span>;
}

function Zeile({ eintrag: e, href }: { eintrag: Faelligkeit; href: string | null }) {
  const wo = woAnzeige(e);
  const inhalt = (
    <>
      <span style={{ ...SCHRIFT.kicker, color: e.dringlichkeit === "ueberfaellig" ? undefined : "var(--iuk-gedaempft)" }}>
        {e.dringlichkeit === "ueberfaellig" ? "Überfällig" : "Bald"} · {e.art}
      </span>
      <span style={{ ...SCHRIFT.text, fontWeight: 600 }}>
        {e.titel}
        {wo && <span style={{ fontWeight: 400 }}> · {wo}</span>}
      </span>
      <span style={{ ...SCHRIFT.text }}>
        {e.zustand}
        {e.person && <span style={{ color: "var(--iuk-gedaempft)" }}> · an {e.person}</span>}
      </span>
    </>
  );
  const rahmen = {
    display: "flex", flexDirection: "column", gap: 2, minBlockSize: 44,
    paddingBlock: SPACE.sm, color: "inherit",
  } as const;
  return href
    ? <a href={href} style={rahmen} data-testid="faellig-zeile">{inhalt}</a>
    : <div style={rahmen} data-testid="faellig-zeile">{inhalt}</div>;
}

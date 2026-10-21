"use client";

import { useState } from "react";
import { Alert, App, Button, Checkbox, Select, Tag } from "antd";
import { Kartentabelle } from "@/core/tabelle";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { erstimportAction } from "../_actions/verwaltung";
import type { Entscheidungen, Wahl } from "../_lib/erstimport/anwenden";
import { QUELL_NAMEN, type Erstimportplan, type Quelle, type Vorschlag, type Ziel } from "../_lib/erstimport/plan";

/* Kein Rot auf der Datenfläche (Falle 3): „offen“ trägt die Warnfarbe, jedes Ziel steht als Wort da. */
const ZIEL: Record<Ziel["art"], { text: string; farbe: string }> = {
  bestand: { text: "Vorhandenes Fahrzeug", farbe: "blue" },
  neu: { text: "Neues Fahrzeug", farbe: "green" },
  offen: { text: "Offen", farbe: "warning" },
};

const QUELLEN = Object.keys(QUELL_NAMEN) as Quelle[];

export interface ErstimportBestand {
  id: string;
  funkrufname: string;
  funkkenner: string | null;
  aktiv: boolean;
}

/** Was im Auswahlfeld eines offenen Vorschlags steht — `""` heißt „offen lassen“. */
const alsWert = (w: Wahl | undefined): string =>
  !w ? "" : w.art === "kein" ? "kein" : w.art === "stamm" ? `stamm:${w.id}` : `vorschlag:${w.schluessel}`;
const ausWert = (wert: string): Wahl | undefined =>
  wert === "kein" ? { art: "kein" }
  : wert.startsWith("stamm:") ? { art: "stamm", id: wert.slice(6) }
  : wert.startsWith("vorschlag:") ? { art: "vorschlag", schluessel: wert.slice(10) }
  : undefined;

/**
 * Die Vorschau des Erstimports mit einer Entscheidung je Vorschlag: „Vorhandenes“ und „Neues Fahrzeug“
 * sind vorausgewählt und abwählbar, „Offen“ bekommt eine Auswahl (ein Fahrzeug aus dem Bestand, ein
 * angehaktes neues, oder „kein Fahrzeug“). Nicht Entschiedenes bleibt stehen und kommt beim nächsten
 * Aufruf wieder. Nach dem Übernehmen lädt die Seite neu (die Action ruft `revalidatePath`).
 */
export function Erstimport({ plan, bestand, fehler }: { plan: Erstimportplan; bestand: ErstimportBestand[]; fehler: string[] }) {
  const { message } = App.useApp();
  const [uebernehmen, setUebernehmen] = useState<Set<string>>(
    () => new Set(plan.vorschlaege.filter((v) => v.ziel.art !== "offen").map((v) => v.schluessel)),
  );
  const [offen, setOffen] = useState<Record<string, Wahl>>({});
  const [laeuft, setLaeuft] = useState(false);
  const [fehlerText, setFehlerText] = useState<string | null>(null);

  function haken(schluessel: string, an: boolean): void {
    setUebernehmen((alt) => {
      const neu = new Set(alt);
      if (an) neu.add(schluessel);
      else neu.delete(schluessel);
      return neu;
    });
  }

  function waehle(schluessel: string, wert: string): void {
    setOffen((alt) => {
      const { [schluessel]: _, ...rest } = alt;
      const wahl = ausWert(wert);
      return wahl ? { ...rest, [schluessel]: wahl } : rest;
    });
  }

  const neueAngehakt = plan.vorschlaege.filter((v) => v.ziel.art === "neu" && uebernehmen.has(v.schluessel));
  const auswahl = [
    { value: "", label: "offen lassen" },
    ...bestand.map((b) => ({ value: `stamm:${b.id}`, label: `${b.funkrufname}${b.funkkenner ? ` (${b.funkkenner})` : ""}${b.aktiv ? "" : " — außer Dienst"}` })),
    ...neueAngehakt.map((v) => ({ value: `vorschlag:${v.schluessel}`, label: `neu: ${v.ziel.art === "neu" ? v.ziel.fahrzeug.funkrufname : ""}` })),
    { value: "kein", label: "kein Fahrzeug" },
  ];

  async function anwenden(): Promise<void> {
    setFehlerText(null);
    setLaeuft(true);
    // Eine Wahl auf ein inzwischen abgewähltes neues Fahrzeug fällt weg, statt still ins Leere zu zeigen.
    const gueltig = Object.fromEntries(Object.entries(offen).filter(([, w]) => w.art !== "vorschlag" || uebernehmen.has(w.schluessel)));
    const e: Entscheidungen = { uebernehmen: [...uebernehmen], offen: gueltig };
    try {
      const r = await erstimportAction(e);
      if (r.ok) void message.success(`${r.wert.neu} Fahrzeuge angelegt, ${r.wert.zugeordnet} Zeilen zugeordnet, ${r.wert.keinFahrzeug} als „kein Fahrzeug“ vermerkt.`);
      else setFehlerText(r.fehler);
    } catch {
      setFehlerText("Der Erstimport ist fehlgeschlagen. Bitte noch einmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  }

  const anzahl = (art: Ziel["art"]) => plan.vorschlaege.filter((v) => v.ziel.art === art).length;
  const schon = QUELLEN.reduce((n, q) => n + plan.schonZugeordnet[q], 0);
  const entschieden = uebernehmen.size + Object.keys(offen).length;

  return (
    <section aria-labelledby="vorschau" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.md }}>
      <h2 id="vorschau" style={{ ...SCHRIFT.unterTitel, margin: 0 }}>Vorschau</h2>
      {fehler.length > 0 ? (
        <Alert type="warning" showIcon={false} title={`Nicht lesbar: ${fehler.join(", ")}. Diese Zeilen fehlen in der Vorschau, und Übernehmen geht erst, wenn alle Apps lesbar sind.`} />
      ) : null}
      <p style={{ margin: 0 }} data-testid="erstimport-summe">
        {anzahl("bestand")} zu vorhandenen Fahrzeugen · {anzahl("neu")} neue Fahrzeuge · {anzahl("offen")} offen
        {schon > 0 ? ` · ${schon} Zeilen schon zugeordnet (${QUELLEN.filter((q) => plan.schonZugeordnet[q] > 0).map((q) => `${QUELL_NAMEN[q]} ${plan.schonZugeordnet[q]}`).join(", ")})` : ""}
      </p>
      <Kartentabelle<Vorschlag>
        rowKey="schluessel"
        aria-label="Vorschläge des Erstimports"
        dataSource={plan.vorschlaege}
        leer={{ nichts: schon > 0 ? "Alle Fahrzeugzeilen der Apps sind zugeordnet." : "In den Apps steht kein Fahrzeug." }}
        columns={[
          {
            title: "Vorschlag",
            key: "ziel",
            filters: (Object.keys(ZIEL) as Ziel["art"][]).map((a) => ({ text: ZIEL[a].text, value: a })),
            onFilter: (wert, v: Vorschlag) => v.ziel.art === wert,
            render: (_: unknown, v: Vorschlag) => <Tag color={ZIEL[v.ziel.art].farbe}>{ZIEL[v.ziel.art].text}</Tag>,
          },
          {
            title: "In den Apps",
            key: "kandidaten",
            render: (_: unknown, v: Vorschlag) => (
              <ul style={{ margin: 0, paddingInlineStart: SPACE.lg }}>
                {v.kandidaten.map((k) => (
                  <li key={`${k.quelle}:${k.quellId}`}>
                    {QUELL_NAMEN[k.quelle]}: {k.anzeige}
                    {k.hinweis ? <span style={SCHRIFT.neben}> ({k.hinweis})</span> : null}
                  </li>
                ))}
              </ul>
            ),
          },
          {
            title: "Wird",
            key: "wird",
            render: (_: unknown, v: Vorschlag) =>
              v.ziel.art === "bestand" ? `zugeordnet zu „${v.ziel.anzeige}“`
              : v.ziel.art === "neu" ? [v.ziel.fahrzeug.typ, v.ziel.fahrzeug.funkrufname, v.ziel.fahrzeug.funkkenner, v.ziel.fahrzeug.kennzeichen, v.ziel.fahrzeug.standort].filter(Boolean).join(" · ")
              : v.ziel.grund,
          },
          {
            title: "Entscheidung",
            key: "entscheidung",
            render: (_: unknown, v: Vorschlag) =>
              v.ziel.art === "offen" ? (
                <Select
                  aria-label={`Zuordnung für ${v.kandidaten[0].anzeige}`}
                  style={{ minWidth: 220, width: "100%" }}
                  value={alsWert(offen[v.schluessel])}
                  options={auswahl}
                  onChange={(wert: string) => waehle(v.schluessel, wert)}
                  showSearch={{ optionFilterProp: "label" }}
                />
              ) : (
                <Checkbox
                  checked={uebernehmen.has(v.schluessel)}
                  onChange={(e) => haken(v.schluessel, e.target.checked)}
                  style={{ minHeight: 44, alignItems: "center" }}
                >
                  übernehmen
                </Checkbox>
              ),
          },
        ]}
      />
      {fehlerText ? <Alert type="warning" showIcon={false} title={fehlerText} /> : null}
      <div>
        <Button type="primary" onClick={() => void anwenden()} loading={laeuft} disabled={laeuft || entschieden === 0 || fehler.length > 0}>
          Übernehmen
        </Button>
      </div>
    </section>
  );
}

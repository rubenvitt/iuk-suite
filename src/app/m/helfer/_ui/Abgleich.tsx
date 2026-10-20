"use client";

import { useState } from "react";
import { Alert, App, Button, Checkbox, Select, Tag } from "antd";
import { Kartentabelle } from "@/core/tabelle";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { uebernehmenAction, vorschauAction } from "../_actions/verwaltung";
import type { Abgleichklasse, Abgleichplan, Abgleichzeile } from "../_lib/abgleich";
import { AUSSCHLUSSGRUENDE, GRUND_TEXT, STATUS_TEXT, WAEHLBARE_STATUS, type Importfilter } from "../_lib/filter";

/* Kein Rot auf der Datenfläche (Falle 3): „entfällt“ trägt die Warnfarbe, jede Klasse steht als Wort da. */
const KLASSE: Record<Abgleichklasse, { text: string; farbe: string }> = {
  neu: { text: "Neu", farbe: "green" },
  geaendert: { text: "Geändert", farbe: "blue" },
  unveraendert: { text: "Unverändert", farbe: "default" },
  entfaellt: { text: "Wird gelöscht", farbe: "warning" },
};

const zeilenSchluessel = (z: Abgleichzeile) => `${z.klasse}:${z.quellId}`;

/**
 * Der Abgleich mit der Quelle in zwei Schritten: „Vorschau“ liest und plant (schreibt nichts),
 * „Übernehmen“ speichert den Filter, liest neu und schreibt. Wer am Filter scheitert, erscheint nur
 * als Zahl je Grund — nie mit Namen.
 */
export function Abgleich({ start, quelle }: { start: Importfilter; quelle: "demo" | "hiorg" }) {
  const { message, modal } = App.useApp();
  const [filter, setFilter] = useState<Importfilter>(start);
  const [plan, setPlan] = useState<Abgleichplan | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState<"vorschau" | "uebernehmen" | null>(null);

  function aendere(neu: Importfilter): void {
    setFilter(neu);
    setPlan(null);
  }

  async function vorschau(f: Importfilter = filter): Promise<void> {
    setFehler(null);
    setLaeuft("vorschau");
    try {
      const e = await vorschauAction(f);
      if (e.ok) setPlan(e.wert);
      else setFehler(e.fehler);
    } catch {
      setFehler("Die Vorschau ist fehlgeschlagen. Bitte noch einmal versuchen.");
    } finally {
      setLaeuft(null);
    }
  }

  async function uebernehmen(): Promise<void> {
    setFehler(null);
    setLaeuft("uebernehmen");
    try {
      const e = await uebernehmenAction(filter);
      if (e.ok) {
        void message.success(`${e.wert.neu} neu, ${e.wert.geaendert} geändert, ${e.wert.entfernt} gelöscht.`);
        setPlan(null);
      } else setFehler(e.fehler);
    } catch {
      setFehler("Der Abgleich ist fehlgeschlagen. Bitte noch einmal versuchen.");
    } finally {
      setLaeuft(null);
    }
  }

  const anzahl = (k: Abgleichklasse) => plan?.zeilen.filter((z) => z.klasse === k).length ?? 0;
  const ausgefiltert = plan ? AUSSCHLUSSGRUENDE.reduce((n, g) => n + plan.ausgefiltert[g], 0) : 0;

  function bestaetigen(): void {
    const weg = anzahl("entfaellt");
    if (weg === 0) {
      void uebernehmen();
      return;
    }
    modal.confirm({
      title: `${weg} Helfer werden gelöscht`,
      content: "Sie kommen nicht mehr durch den Filter oder stehen nicht mehr in der Quelle. Im Einsatzbuch werden sie beim nächsten Abgleich deaktiviert.",
      okText: "Übernehmen und löschen",
      cancelText: "Abbrechen",
      onOk: () => uebernehmen(),
    });
  }

  const gruppenOptionen = [...new Set([...(plan?.gruppen.map((g) => g.name) ?? []), ...filter.gruppenEin, ...filter.gruppenAus])]
    .map((g) => ({ value: g, label: g }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.lg }}>
      <section aria-labelledby="importfilter" style={{ display: "grid", gap: SPACE.md, maxWidth: 640 }}>
        <h2 id="importfilter" style={{ ...SCHRIFT.unterTitel, margin: 0 }}>Importfilter</h2>
        <p style={{ margin: 0 }}>
          Gesperrte Konten und Personen mit Austrittsdatum kommen nie in die Suite. Wer am Filter scheitert, wird
          nicht gespeichert — auch nicht als Name in der Vorschau.
        </p>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ ...SCHRIFT.neben, marginBlockEnd: SPACE.xs }}>Kontostatus in HiOrg</legend>
          <Checkbox.Group
            value={filter.status}
            onChange={(werte) => aendere({ ...filter, status: werte as Importfilter["status"] })}
            options={WAEHLBARE_STATUS.map((s) => ({ value: s, label: STATUS_TEXT[s], style: { minHeight: 44, alignItems: "center" } }))}
          />
        </fieldset>
        <div>
          <label htmlFor="gruppen-ein" style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
            Nur Mitglieder dieser Gruppen (leer: alle)
          </label>
          <Select
            id="gruppen-ein"
            mode="tags"
            style={{ width: "100%" }}
            value={filter.gruppenEin}
            options={gruppenOptionen}
            onChange={(werte: string[]) => aendere({ ...filter, gruppenEin: werte })}
            placeholder="z. B. Bereitschaft"
          />
        </div>
        <div>
          <label htmlFor="gruppen-aus" style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
            Ohne Mitglieder dieser Gruppen
          </label>
          <Select
            id="gruppen-aus"
            mode="tags"
            style={{ width: "100%" }}
            value={filter.gruppenAus}
            options={gruppenOptionen}
            onChange={(werte: string[]) => aendere({ ...filter, gruppenAus: werte })}
            placeholder="z. B. Passive, Fördermitglieder"
          />
        </div>
        <div>
          <Button type="primary" onClick={() => void vorschau()} loading={laeuft === "vorschau"} disabled={laeuft !== null || filter.status.length === 0}>
            {quelle === "demo" ? "Vorschau aus der Demo-Quelle" : "Vorschau aus HiOrg-Server"}
          </Button>
        </div>
      </section>

      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}

      {plan ? (
        <section aria-labelledby="vorschau" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.md }}>
          <h2 id="vorschau" style={{ ...SCHRIFT.unterTitel, margin: 0 }}>Vorschau</h2>
          <p style={{ margin: 0 }} data-testid="abgleich-summe">
            {plan.gelesen} gelesen · {anzahl("neu")} neu · {anzahl("geaendert")} geändert · {anzahl("unveraendert")} unverändert
            · {anzahl("entfaellt")} werden gelöscht · {ausgefiltert} ausgefiltert
            {plan.unlesbar > 0 ? ` · ${plan.unlesbar} unlesbar` : ""}
          </p>
          {ausgefiltert > 0 ? (
            <ul style={{ margin: 0, paddingInlineStart: SPACE.xl }} aria-label="Ausgefiltert nach Grund">
              {AUSSCHLUSSGRUENDE.filter((g) => plan.ausgefiltert[g] > 0).map((g) => (
                <li key={g}>{plan.ausgefiltert[g]} {GRUND_TEXT[g]}</li>
              ))}
            </ul>
          ) : null}
          {plan.gruppen.length > 0 ? (
            <div>
              <div style={{ ...SCHRIFT.neben, marginBlockEnd: SPACE.xs }}>Gruppen in der Quelle (Personen je Gruppe, vor dem Filter) — Klick schließt die Gruppe aus</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE.xs }}>
                {plan.gruppen.map((g) => {
                  const aus = filter.gruppenAus.includes(g.name);
                  return (
                    <Button
                      key={g.name}
                      aria-pressed={aus}
                      onClick={() => {
                        const neu = { ...filter, gruppenAus: aus ? filter.gruppenAus.filter((x) => x !== g.name) : [...filter.gruppenAus, g.name] };
                        setFilter(neu);
                        void vorschau(neu);
                      }}
                    >
                      {aus ? "✕ " : ""}{g.name} ({g.anzahl})
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <Kartentabelle<Abgleichzeile>
            rowKey={zeilenSchluessel}
            aria-label="Vorschau des Abgleichs"
            dataSource={plan.zeilen}
            leer={{ nichts: "Niemand kommt durch den Filter, und im Bestand ist niemand." }}
            columns={[
              {
                title: "Ergebnis",
                key: "klasse",
                filters: (Object.keys(KLASSE) as Abgleichklasse[]).map((k) => ({ text: KLASSE[k].text, value: k })),
                onFilter: (wert, z: Abgleichzeile) => z.klasse === wert,
                render: (_: unknown, z: Abgleichzeile) => <Tag color={KLASSE[z.klasse].farbe}>{KLASSE[z.klasse].text}</Tag>,
              },
              { title: "Name", key: "name", render: (_: unknown, z: Abgleichzeile) => `${z.nachname}, ${z.vorname}` },
              {
                title: "Qualifikationen",
                key: "qualifikationen",
                render: (_: unknown, z: Abgleichzeile) => z.qualifikationen.map((q) => q.kurz || q.name).join(", ") || "—",
              },
              { title: "Gruppen", key: "gruppen", render: (_: unknown, z: Abgleichzeile) => z.gruppen.join(", ") || "—" },
            ]}
          />
          <div>
            <Button
              type="primary"
              onClick={bestaetigen}
              loading={laeuft === "uebernehmen"}
              disabled={laeuft !== null}
            >
              Übernehmen
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

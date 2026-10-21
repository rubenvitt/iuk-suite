"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, App, Button, Drawer, Tag } from "antd";
import { Kartentabelle } from "@/core/tabelle";
import { flyinBreite } from "@/core/theme/flyin";
import { SPACE } from "@/core/theme/tokens";
import { stammUebernehmenAction, stammVorschauAction } from "../../../_actions/fahrzeuge";
import type { StammKlasse, StammPlan, StammVorschauzeile } from "../../../_lib/stammAbgleich";

/* Kein Rot auf der Datenfläche (Falle 3); jede Klasse steht zusätzlich als Wort da. */
const KLASSE: Record<StammKlasse, { text: string; farbe: string }> = {
  verknuepfen: { text: "Wird verknüpft", farbe: "green" },
  geaendert: { text: "Geändert", farbe: "blue" },
  unveraendert: { text: "Unverändert", farbe: "default" },
  deaktivieren: { text: "Wird stillgelegt", farbe: "warning" },
  nicht_verknuepft: { text: "Nicht verknüpft", farbe: "warning" },
  doppelt: { text: "Doppelt", farbe: "warning" },
};

/**
 * IDA-258 — der Knopf „Mit Fahrzeugverwaltung abgleichen“ und seine Schublade, Bauform wie der
 * Helferabgleich im Einsatzbuch: die Vorschau lädt beim Öffnen, „Übernehmen“ plant auf dem Server
 * neu und schreibt.
 */
export function StammAbgleich() {
  const { message } = App.useApp();
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [plan, setPlan] = useState<StammPlan | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function oeffnen(): Promise<void> {
    setOffen(true);
    setPlan(null);
    setFehler(null);
    setLaeuft(true);
    try {
      const e = await stammVorschauAction();
      if (e.ok) setPlan(e.wert);
      else setFehler(e.fehler);
    } catch {
      setFehler("Die Vorschau ließ sich nicht laden. Bitte noch einmal öffnen.");
    } finally {
      setLaeuft(false);
    }
  }

  async function uebernehmen(): Promise<void> {
    setLaeuft(true);
    try {
      const e = await stammUebernehmenAction();
      if (e.ok) {
        void message.success(`${e.wert.verknuepft} verknüpft, ${e.wert.geaendert} geändert, ${e.wert.deaktiviert} stillgelegt.`);
        setOffen(false);
        router.refresh();
      } else setFehler(e.fehler);
    } catch {
      setFehler("Übernehmen ist fehlgeschlagen. Bitte noch einmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  }

  const anzahl = (...k: StammKlasse[]) => plan?.zeilen.filter((z) => k.includes(z.klasse)).length ?? 0;
  const schreibbar = anzahl("verknuepfen", "geaendert", "deaktivieren") > 0;

  return (
    <>
      <Button onClick={() => void oeffnen()}>Mit Fahrzeugverwaltung abgleichen</Button>
      <Drawer open={offen} onClose={() => setOffen(false)} title="Fahrzeuge aus der Fahrzeugverwaltung" size={flyinBreite(720)} destroyOnHidden>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.lg }}>
          <p style={{ margin: 0 }}>
            Übernimmt Name und Kennzeichen der Fahrzeuge aus der Fahrzeugverwaltung; was dort außer Dienst ist, wird hier
            stillgelegt. Soll, Bestand und Checks bleiben an ihrer Einheit. Taschen bleiben, wie sie sind.
          </p>
          {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
          {plan ? (
            <>
              <p style={{ margin: 0 }} data-testid="stamm-abgleich-summe">
                {anzahl("verknuepfen")} werden verknüpft · {anzahl("geaendert")} geändert · {anzahl("deaktivieren")} werden stillgelegt
                · {anzahl("unveraendert")} unverändert · {anzahl("nicht_verknuepft", "doppelt")} offen
                {plan.ohneEinheit > 0 ? ` · ${plan.ohneEinheit} Fahrzeuge der Fahrzeugverwaltung haben hier noch keine Einheit (über „Neue Einheit“ anlegen)` : ""}
              </p>
              <Kartentabelle<StammVorschauzeile>
                rowKey="id"
                aria-label="Vorschau des Abgleichs mit der Fahrzeugverwaltung"
                dataSource={plan.zeilen}
                leer={{ nichts: "Im Lagerbuch steht noch kein Fahrzeug." }}
                columns={[
                  { title: "Bisher", key: "bisher", render: (_: unknown, z: StammVorschauzeile) => z.bisher },
                  { title: "Danach", key: "name", render: (_: unknown, z: StammVorschauzeile) => (z.name === z.bisher ? "—" : z.name) },
                  { title: "Kennzeichen", key: "kennung", render: (_: unknown, z: StammVorschauzeile) => z.kennung ?? "—" },
                  {
                    title: "Ergebnis",
                    key: "klasse",
                    render: (_: unknown, z: StammVorschauzeile) => <Tag color={KLASSE[z.klasse].farbe}>{KLASSE[z.klasse].text}</Tag>,
                  },
                  { title: "Hinweis", key: "hinweis", render: (_: unknown, z: StammVorschauzeile) => z.hinweis ?? "" },
                ]}
              />
              <div>
                <Button type="primary" disabled={!schreibbar || laeuft} loading={laeuft} onClick={() => void uebernehmen()}>
                  Übernehmen
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </Drawer>
    </>
  );
}

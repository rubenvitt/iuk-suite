"use client";

// src/app/m/radio/admin/(arbeit)/geraete/OrtAbgleich.tsx
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Drawer, Tag } from "antd";
import { Kartentabelle } from "@/core/tabelle";
import { flyinBreite } from "@/core/theme/flyin";
import { fahrzeugAbgleichAction, fahrzeugAbgleichVorschauAction } from "../../actions";
import type { OrtKlasse, OrtPlan, OrtVorschauzeile } from "../../../_lib/stammFahrzeuge";

/* Kein Rot auf der Datenfläche (Falle 3); jede Klasse steht zusätzlich als Wort da. */
const KLASSE: Record<OrtKlasse, { text: string; farbe: string }> = {
  verknuepfen: { text: "Wird verknüpft", farbe: "green" },
  umbenennen: { text: "Wird umbenannt", farbe: "blue" },
  offen: { text: "Offen", farbe: "warning" },
  unveraendert: { text: "Unverändert", farbe: "default" },
};

/**
 * IDA-259 — der Knopf „Mit Fahrzeugverwaltung abgleichen“ und seine Schublade, Bauform wie im Lagerbuch
 * (`lagerbuch/verwaltung/(arbeit)/fahrzeuge/StammAbgleich.tsx`): die Vorschau lädt beim Öffnen,
 * „Übernehmen“ plant auf dem Server neu und schreibt. ⛔ KEIN TOAST (Entscheidung E6 des Moduls,
 * `GeraetFormular.tsx`): das Ergebnis steht in der Schublade.
 */
export function OrtAbgleich() {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [plan, setPlan] = useState<OrtPlan | null>(null);
  const [meldung, setMeldung] = useState<{ art: "success" | "warning"; text: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function vorschau(): Promise<void> {
    setPlan(null);
    setLaeuft(true);
    try {
      const e = await fahrzeugAbgleichVorschauAction();
      if (e.ok) setPlan(e.plan);
      else setMeldung({ art: "warning", text: e.fehler });
    } catch {
      setMeldung({ art: "warning", text: "Die Vorschau ließ sich nicht laden. Bitte noch einmal öffnen." });
    } finally {
      setLaeuft(false);
    }
  }

  async function uebernehmen(): Promise<void> {
    setLaeuft(true);
    try {
      const e = await fahrzeugAbgleichAction();
      if (e.ok) {
        setMeldung({ art: "success", text: `${e.geraete} ${e.geraete === 1 ? "Gerät" : "Geräte"} übernommen.` });
        router.refresh();
        await vorschau();
      } else setMeldung({ art: "warning", text: e.fehler });
    } catch {
      setMeldung({ art: "warning", text: "Übernehmen ist fehlgeschlagen. Bitte noch einmal versuchen." });
    } finally {
      setLaeuft(false);
    }
  }

  const schreibbar = (plan?.aenderungen.length ?? 0) > 0;

  return (
    <>
      <Button
        onClick={() => {
          setOffen(true);
          setMeldung(null);
          void vorschau();
        }}
      >
        Mit Fahrzeugverwaltung abgleichen
      </Button>
      <Drawer open={offen} onClose={() => setOffen(false)} title="Orte aus der Fahrzeugverwaltung" width={flyinBreite(720)} destroyOnHidden>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
          <p style={{ margin: 0 }}>
            Verknüpft die Geräte, deren Lagerort ein Fahrzeug der Fahrzeugverwaltung ist, und schreibt dort den Namen des
            Fahrzeugs als Lagerort. Andere Lagerorte bleiben, wie sie sind.
          </p>
          {meldung ? <Alert type={meldung.art} showIcon={false} title={meldung.text} /> : null}
          {plan ? (
            <>
              <Kartentabelle<OrtVorschauzeile>
                rowKey="schluessel"
                aria-label="Vorschau des Abgleichs mit der Fahrzeugverwaltung"
                dataSource={plan.zeilen}
                leer={{ nichts: "Kein Lagerort ist einem Fahrzeug zugeordnet." }}
                columns={[
                  { title: "Bisher", key: "bisher", render: (_: unknown, z: OrtVorschauzeile) => z.bisher || "—" },
                  { title: "Danach", key: "name", render: (_: unknown, z: OrtVorschauzeile) => (z.name === z.bisher ? "—" : z.name) },
                  { title: "Geräte", key: "geraete", render: (_: unknown, z: OrtVorschauzeile) => z.geraete },
                  {
                    title: "Ergebnis",
                    key: "klasse",
                    render: (_: unknown, z: OrtVorschauzeile) => <Tag color={KLASSE[z.klasse].farbe}>{KLASSE[z.klasse].text}</Tag>,
                  },
                  { title: "Hinweis", key: "hinweis", render: (_: unknown, z: OrtVorschauzeile) => z.hinweis ?? "" },
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

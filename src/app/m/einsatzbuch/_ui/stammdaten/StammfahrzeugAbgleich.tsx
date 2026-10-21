"use client";

import { useEffect, useState } from "react";
import { Alert, App, Button, Tag } from "antd";
import { Kartentabelle } from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import { zeitFormat } from "@/core/zeit";
import { stammfahrzeugeUebernehmenAction, stammfahrzeugeVorschauAction } from "../../_actions/stammdaten";
import type { FahrzeugKlasse, FahrzeugPlan, FahrzeugVorschauzeile } from "../../_lib/stammdaten/fahrzeugAbgleich";

const ZEIT = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/* Kein Rot auf der Datenfläche (Falle 3); jede Klasse steht zusätzlich als Wort da. */
const KLASSE: Record<FahrzeugKlasse, { text: string; farbe: string }> = {
  neu: { text: "Neu", farbe: "green" },
  geaendert: { text: "Geändert", farbe: "blue" },
  unveraendert: { text: "Unverändert", farbe: "default" },
  deaktivieren: { text: "Wird deaktiviert", farbe: "warning" },
  ohne_kenner: { text: "Nicht übernommen", farbe: "warning" },
  doppelt: { text: "Nicht übernommen", farbe: "warning" },
};

/**
 * Fahrzeuge aus der Fahrzeugverwaltung abgleichen, Bauform wie `HelferAbgleich.tsx`: die Vorschau lädt
 * beim Öffnen, „Übernehmen“ plant auf dem Server neu und schreibt.
 */
export function StammfahrzeugAbgleich({ onFertig }: { onFertig: () => void }) {
  const { message } = App.useApp();
  const [plan, setPlan] = useState<FahrzeugPlan | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(true);

  useEffect(() => {
    let aktiv = true;
    stammfahrzeugeVorschauAction()
      .then((e) => {
        if (!aktiv) return;
        if (e.ok) setPlan(e.wert);
        else setFehler(e.fehler);
      })
      .catch(() => aktiv && setFehler("Die Vorschau ließ sich nicht laden. Bitte noch einmal öffnen."))
      .finally(() => aktiv && setLaeuft(false));
    return () => {
      aktiv = false;
    };
  }, []);

  async function uebernehmen(): Promise<void> {
    setLaeuft(true);
    try {
      const e = await stammfahrzeugeUebernehmenAction();
      if (e.ok) {
        void message.success(`${e.wert.neu} angelegt, ${e.wert.geaendert} geändert, ${e.wert.deaktiviert} deaktiviert.`);
        onFertig();
      } else setFehler(e.fehler);
    } catch {
      setFehler("Übernehmen ist fehlgeschlagen. Bitte noch einmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  }

  const anzahl = (...k: FahrzeugKlasse[]) => plan?.zeilen.filter((z) => k.includes(z.klasse)).length ?? 0;
  const schreibbar = anzahl("neu", "geaendert", "deaktivieren") > 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.lg }}>
      <p style={{ margin: 0 }}>
        Übernimmt die Fahrzeuge der Fahrzeugverwaltung mit Typ, Kennung, Funkrufname und Standort. Was dort außer Dienst ist,
        wird hier deaktiviert. Von Hand angelegte Fahrzeuge, die keinem Fahrzeug der Fahrzeugverwaltung zugeordnet sind, bleiben,
        wie sie sind. Übernommene Fahrzeuge änderst du in der Fahrzeugverwaltung, der nächste Abgleich überschreibt sie hier.
        {plan ? ` Stand der Fahrzeugverwaltung: ${plan.stand ? ZEIT.format(new Date(plan.stand)) : "noch keine Fahrzeuge"}.` : null}
      </p>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
      {plan ? (
        <>
          <p style={{ margin: 0 }} data-testid="fahrzeug-abgleich-summe">
            {anzahl("neu")} neu · {anzahl("geaendert")} geändert · {anzahl("deaktivieren")} werden deaktiviert · {anzahl("unveraendert")} unverändert
            · {anzahl("ohne_kenner", "doppelt")} nicht übernommen
          </p>
          <Kartentabelle<FahrzeugVorschauzeile>
            rowKey="id"
            aria-label="Vorschau des Abgleichs mit der Fahrzeugverwaltung"
            dataSource={plan.zeilen}
            leer={{ nichts: "In der Fahrzeugverwaltung steht noch kein Fahrzeug." }}
            columns={[
              { title: "Funkrufname", key: "ruf", render: (_: unknown, z: FahrzeugVorschauzeile) => z.ruf },
              { title: "Kennung", key: "kennung", render: (_: unknown, z: FahrzeugVorschauzeile) => z.kennung || "—" },
              { title: "Typ", key: "typ", render: (_: unknown, z: FahrzeugVorschauzeile) => z.typ },
              {
                title: "Ergebnis",
                key: "klasse",
                render: (_: unknown, z: FahrzeugVorschauzeile) => <Tag color={KLASSE[z.klasse].farbe}>{KLASSE[z.klasse].text}</Tag>,
              },
              { title: "Hinweis", key: "hinweis", render: (_: unknown, z: FahrzeugVorschauzeile) => z.hinweis ?? "" },
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
  );
}

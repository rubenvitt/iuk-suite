"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Drawer, Flex, Tag } from "antd";
import { Kartentabelle } from "@/core/tabelle";
import { flyinBreite } from "@/core/theme/flyin";
import { SPACE } from "@/core/theme/tokens";
import { zeitFormat } from "@/core/zeit";
import { stammfahrzeugeUebernehmenAction, stammfahrzeugeVorschauAction } from "../../_actions/stammdaten";
import type { FahrzeugKlasse, FahrzeugPlan, FahrzeugVorschauzeile } from "../../_lib/stammdaten/fahrzeugAbgleich";
import { sichtbareZeilen, startSicht, zaehleSichten, type Sicht } from "../../_lib/stammdaten/vorschausicht";
import { Vorschaufilter } from "./Vorschaufilter";

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
const NICHT: FahrzeugKlasse[] = ["ohne_kenner", "doppelt"];

/**
 * Fahrzeuge aus der Fahrzeugverwaltung abgleichen, Bauform wie `HelferAbgleich.tsx`: die Vorschau lädt
 * beim Öffnen, „Übernehmen“ plant auf dem Server neu und schreibt. Wie dort steht der Knopf im `footer`
 * der eigenen Schublade und die Vorschau startet auf den Änderungen (IDA-283).
 */
export function StammfahrzeugAbgleich({ onSchliessen }: { onSchliessen: () => void }) {
  const { message } = App.useApp();
  const [plan, setPlan] = useState<FahrzeugPlan | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(true);
  const [sicht, setSicht] = useState<Sicht | null>(null);
  const [suche, setSuche] = useState("");

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
        onSchliessen();
      } else setFehler(e.fehler);
    } catch {
      setFehler("Übernehmen ist fehlgeschlagen. Bitte noch einmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  }

  const zeilen = useMemo(() => plan?.zeilen ?? [], [plan]);
  const zahlen = useMemo(() => zaehleSichten(zeilen, NICHT), [zeilen]);
  const gewaehlt = sicht ?? startSicht(zahlen);
  const sichtbar = useMemo(
    () => sichtbareZeilen(zeilen, gewaehlt, NICHT, suche, (z) => `${z.ruf} ${z.kennung} ${z.typ}`),
    [zeilen, gewaehlt, suche],
  );
  const anzahl = (...k: FahrzeugKlasse[]) => zeilen.filter((z) => k.includes(z.klasse)).length;

  return (
    <Drawer
      open
      onClose={onSchliessen}
      title="Fahrzeuge aus der Fahrzeugverwaltung"
      size={flyinBreite(720)}
      destroyOnHidden
      footer={
        <Flex gap={SPACE.sm} wrap align="center" justify="space-between">
          <span data-testid="fahrzeug-abgleich-summe">
            {plan ? `${anzahl("neu")} neu · ${anzahl("geaendert")} geändert · ${anzahl("deaktivieren")} deaktiviert` : null}
          </span>
          <Flex gap={SPACE.sm} wrap style={{ marginLeft: "auto" }}>
            <Button onClick={onSchliessen}>Schließen</Button>
            <Button type="primary" disabled={zahlen.aenderungen === 0 || laeuft} loading={laeuft} onClick={() => void uebernehmen()}>
              Übernehmen
            </Button>
          </Flex>
        </Flex>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.md }}>
        <p style={{ margin: 0 }}>
          Übernimmt die Fahrzeuge der Fahrzeugverwaltung mit Typ, Kennung, Funkrufname und Standort. Was dort außer Dienst ist,
          wird hier deaktiviert. Von Hand angelegte Fahrzeuge, die keinem Fahrzeug der Fahrzeugverwaltung zugeordnet sind, bleiben,
          wie sie sind. Übernommene Fahrzeuge änderst du in der Fahrzeugverwaltung, der nächste Abgleich überschreibt sie hier.
          {plan ? ` Stand der Fahrzeugverwaltung: ${plan.stand ? ZEIT.format(new Date(plan.stand)) : "noch keine Fahrzeuge"}.` : null}
        </p>
        {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
        {plan ? (
          <>
            <Vorschaufilter sicht={gewaehlt} zahlen={zahlen} onSicht={setSicht} suche={suche} onSuche={setSuche} platzhalter="Funkrufname, Kennung oder Typ suchen" />
            <Kartentabelle<FahrzeugVorschauzeile>
              rowKey="id"
              aria-label="Vorschau des Abgleichs mit der Fahrzeugverwaltung"
              dataSource={sichtbar}
              leer={{
                nichts: "In der Fahrzeugverwaltung steht noch kein Fahrzeug.",
                gefiltert: "Keine Zeile passt zu Auswahl und Suche.",
                aktiv: zeilen.length > 0,
              }}
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
          </>
        ) : null}
      </div>
    </Drawer>
  );
}

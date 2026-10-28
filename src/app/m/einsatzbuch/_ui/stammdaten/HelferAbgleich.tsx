"use client";

import { useEffect, useState } from "react";
import { Alert, App, Button, Tag } from "antd";
import { Kartentabelle } from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import { zeitFormat } from "@/core/zeit";
import { helferUebernehmenAction, helferVorschauAction } from "../../_actions/stammdaten";
import type { HelferKlasse, HelferPlan, HelferVorschauzeile } from "../../_lib/stammdaten/helferAbgleich";
import { QualiZuordnung } from "./QualiZuordnung";

const ZEIT = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/* Kein Rot auf der Datenfläche (Falle 3); jede Klasse steht zusätzlich als Wort da. */
const KLASSE: Record<HelferKlasse, { text: string; farbe: string }> = {
  neu: { text: "Neu", farbe: "green" },
  geaendert: { text: "Geändert", farbe: "blue" },
  unveraendert: { text: "Unverändert", farbe: "default" },
  deaktivieren: { text: "Wird deaktiviert", farbe: "warning" },
  ohne_quali: { text: "Nicht übernommen", farbe: "warning" },
  doppelt: { text: "Nicht übernommen", farbe: "warning" },
  fehler: { text: "Nicht übernommen", farbe: "warning" },
  demo: { text: "Demo", farbe: "default" },
};

/**
 * Personal aus dem Helferverzeichnis abgleichen: die Vorschau lädt beim Öffnen, „Übernehmen“ plant auf
 * dem Server neu und schreibt. Demo-Personen zeigt die Vorschau, übernommen werden sie nie. Darunter
 * die Zuordnung der HiOrg-Qualifikationen; ihr Speichern liefert eine neue Vorschau.
 */
export function HelferAbgleich({ onFertig }: { onFertig: () => void }) {
  const { message } = App.useApp();
  const [plan, setPlan] = useState<HelferPlan | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(true);
  /** Jede neue Vorschau aus dem Speichern der Zuordnung setzt deren Auswahl neu auf. */
  const [stand, setStand] = useState(0);

  useEffect(() => {
    let aktiv = true;
    helferVorschauAction()
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
      const e = await helferUebernehmenAction();
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

  const anzahl = (...k: HelferKlasse[]) => plan?.zeilen.filter((z) => k.includes(z.klasse)).length ?? 0;
  const schreibbar = anzahl("neu", "geaendert", "deaktivieren") > 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.lg }}>
      <p style={{ margin: 0 }}>
        Übernimmt die im Helferverzeichnis fürs Einsatzbuch freigegebenen Helfer mit Name und Qualifikation. Von Hand angelegtes
        Personal bleibt, wie es ist; wer nicht mehr freigegeben ist, wird deaktiviert.
        {plan ? ` Stand des Helferverzeichnisses: ${plan.stand ? ZEIT.format(new Date(plan.stand)) : "noch kein Abgleich mit HiOrg"}.` : null}
      </p>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
      {anzahl("demo") > 0 ? (
        <Alert type="info" showIcon title="Das Helferverzeichnis läuft im Demo-Modus" description="Die Demo-Personen sind erfunden und werden nicht ins Einsatzbuch übernommen." />
      ) : null}
      {plan ? (
        <>
          <p style={{ margin: 0 }} data-testid="helfer-abgleich-summe">
            {anzahl("neu")} neu · {anzahl("geaendert")} geändert · {anzahl("deaktivieren")} werden deaktiviert · {anzahl("unveraendert")} unverändert
            · {anzahl("ohne_quali", "doppelt", "fehler")} nicht übernommen{anzahl("demo") > 0 ? ` · ${anzahl("demo")} Demo` : ""}
          </p>
          <Kartentabelle<HelferVorschauzeile>
            rowKey="id"
            aria-label="Vorschau des Abgleichs mit dem Helferverzeichnis"
            dataSource={plan.zeilen}
            leer={{ nichts: "Im Helferverzeichnis ist niemand fürs Einsatzbuch freigegeben." }}
            columns={[
              { title: "Name", key: "name", render: (_: unknown, z: HelferVorschauzeile) => z.name },
              { title: "Qualifikation", key: "quali", render: (_: unknown, z: HelferVorschauzeile) => z.quali ?? "—" },
              {
                title: "Ergebnis",
                key: "klasse",
                render: (_: unknown, z: HelferVorschauzeile) => <Tag color={KLASSE[z.klasse].farbe}>{KLASSE[z.klasse].text}</Tag>,
              },
              { title: "Hinweis", key: "hinweis", render: (_: unknown, z: HelferVorschauzeile) => z.hinweis ?? "" },
            ]}
          />
          <div>
            <Button type="primary" disabled={!schreibbar || laeuft} loading={laeuft} onClick={() => void uebernehmen()}>
              Übernehmen
            </Button>
          </div>
          <QualiZuordnung
            key={stand}
            zeilen={plan.qualifikationen}
            auswahl={plan.auswahl}
            onGespeichert={(neu) => {
              setPlan(neu);
              setStand((n) => n + 1);
            }}
          />
        </>
      ) : null}
    </div>
  );
}

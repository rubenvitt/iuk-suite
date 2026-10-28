"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Drawer, Flex, Tabs, Tag } from "antd";
import { Kartentabelle } from "@/core/tabelle";
import { flyinBreite } from "@/core/theme/flyin";
import { SPACE } from "@/core/theme/tokens";
import { zeitFormat } from "@/core/zeit";
import { helferUebernehmenAction, helferVorschauAction, qualiZuordnungSpeichernAction } from "../../_actions/stammdaten";
import type { HelferKlasse, HelferPlan, HelferVorschauzeile } from "../../_lib/stammdaten/helferAbgleich";
import { sichtbareZeilen, startSicht, zaehleSichten, type Sicht } from "../../_lib/stammdaten/vorschausicht";
import { QualiZuordnung, regelnAus, startZuordnung, zuordnungGeaendert, type Zuordnung } from "./QualiZuordnung";
import { Vorschaufilter } from "./Vorschaufilter";

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
const NICHT: HelferKlasse[] = ["ohne_quali", "doppelt", "fehler"];

/**
 * Personal aus dem Helferverzeichnis abgleichen, als eigene Schublade: die Vorschau lädt beim Öffnen,
 * „Übernehmen“ plant auf dem Server neu und schreibt. Demo-Personen zeigt die Vorschau, übernommen
 * werden sie nie. Im zweiten Reiter die Zuordnung der HiOrg-Qualifikationen; ihr Speichern liefert
 * eine neue Vorschau.
 *
 * IDA-283 — DIE KNÖPFE STEHEN IM `footer`, nicht unter der Liste (Bauform wie
 * `lagerbuch/_ui/SammelDrawer.tsx`). Bei hundert Helfern lag „Übernehmen“ weit unter der Kante und
 * „Zuordnung speichern“ noch eine Liste tiefer. Die Fußleiste zeigt immer genau eine Hauptaktion:
 * ist die Zuordnung geändert, aber nicht gespeichert, ist das „Zuordnung speichern“ — übernommen
 * würde sonst nach der alten Zuordnung, die der Server kennt. Die Vorschau startet auf den
 * Änderungen (`_lib/stammdaten/vorschausicht.ts`).
 */
export function HelferAbgleich({ onSchliessen }: { onSchliessen: () => void }) {
  const { message } = App.useApp();
  const [plan, setPlan] = useState<HelferPlan | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(true);
  const [reiter, setReiter] = useState("vorschau");
  const [sicht, setSicht] = useState<Sicht | null>(null);
  const [suche, setSuche] = useState("");
  const [wahl, setWahl] = useState<Zuordnung>(new Map());
  /** Jede neue Vorschau setzt die Auswahlfelder der Zuordnung neu auf (auch ihre offenen Listen). */
  const [stand, setStand] = useState(0);

  function neuerPlan(p: HelferPlan): void {
    setPlan(p);
    setWahl(startZuordnung(p.qualifikationen));
    setStand((n) => n + 1);
  }

  useEffect(() => {
    let aktiv = true;
    helferVorschauAction()
      .then((e) => {
        if (!aktiv) return;
        if (e.ok) neuerPlan(e.wert);
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
        onSchliessen();
      } else setFehler(e.fehler);
    } catch {
      setFehler("Übernehmen ist fehlgeschlagen. Bitte noch einmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  }

  async function zuordnungSpeichern(): Promise<void> {
    if (!plan) return;
    setFehler(null);
    setLaeuft(true);
    try {
      const e = await qualiZuordnungSpeichernAction(regelnAus(plan.qualifikationen, wahl));
      if (e.ok) {
        void message.success("Zuordnung gespeichert. Die Vorschau zeigt den neuen Stand.");
        neuerPlan(e.wert);
      } else setFehler(e.fehler);
    } catch {
      setFehler("Speichern ist fehlgeschlagen. Bitte noch einmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  }

  const zeilen = useMemo(() => plan?.zeilen ?? [], [plan]);
  const zahlen = useMemo(() => zaehleSichten(zeilen, NICHT), [zeilen]);
  /* Bis jemand umschaltet, folgt die Sicht dem Plan — nach dem Speichern der Zuordnung auch einem neuen. */
  const gewaehlt = sicht ?? startSicht(zahlen);
  const sichtbar = useMemo(() => sichtbareZeilen(zeilen, gewaehlt, NICHT, suche, (z) => z.name), [zeilen, gewaehlt, suche]);
  const anzahl = (...k: HelferKlasse[]) => zeilen.filter((z) => k.includes(z.klasse)).length;
  const schreibbar = zahlen.aenderungen > 0;
  const zuordnungOffen = plan !== null && zuordnungGeaendert(plan.qualifikationen, wahl);

  const fuss = zuordnungOffen ? (
    <Flex gap={SPACE.sm} wrap align="center" justify="space-between">
      <span>Zuordnung geändert. Speichere sie, bevor du übernimmst.</span>
      <Flex gap={SPACE.sm} wrap style={{ marginLeft: "auto" }}>
        <Button disabled={laeuft} onClick={() => plan && setWahl(startZuordnung(plan.qualifikationen))}>
          Zurücksetzen
        </Button>
        <Button type="primary" loading={laeuft} onClick={() => void zuordnungSpeichern()}>
          Zuordnung speichern
        </Button>
      </Flex>
    </Flex>
  ) : (
    <Flex gap={SPACE.sm} wrap align="center" justify="space-between">
      <span data-testid="helfer-abgleich-summe">
        {plan
          ? `${anzahl("neu")} neu · ${anzahl("geaendert")} geändert · ${anzahl("deaktivieren")} deaktiviert${anzahl("demo") > 0 ? ` · ${anzahl("demo")} Demo` : ""}`
          : null}
      </span>
      <Flex gap={SPACE.sm} wrap style={{ marginLeft: "auto" }}>
        <Button onClick={onSchliessen}>Schließen</Button>
        <Button type="primary" disabled={!schreibbar || laeuft} loading={laeuft} onClick={() => void uebernehmen()}>
          Übernehmen
        </Button>
      </Flex>
    </Flex>
  );

  return (
    <Drawer open onClose={onSchliessen} title="Personal aus dem Helferverzeichnis" size={flyinBreite(720)} destroyOnHidden footer={fuss}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.md }}>
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
          <Tabs
            activeKey={reiter}
            onChange={setReiter}
            items={[
              {
                key: "vorschau",
                label: `Vorschau · ${zeilen.length}`,
                children: (
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.md }}>
                    <Vorschaufilter sicht={gewaehlt} zahlen={zahlen} onSicht={setSicht} suche={suche} onSuche={setSuche} platzhalter="Name suchen" />
                    <Kartentabelle<HelferVorschauzeile>
                      rowKey="id"
                      aria-label="Vorschau des Abgleichs mit dem Helferverzeichnis"
                      dataSource={sichtbar}
                      leer={{
                        nichts: "Im Helferverzeichnis ist niemand fürs Einsatzbuch freigegeben.",
                        gefiltert: "Keine Zeile passt zu Auswahl und Suche.",
                        aktiv: zeilen.length > 0,
                      }}
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
                  </div>
                ),
              },
              {
                key: "qualifikationen",
                label: `Qualifikationen aus HiOrg · ${plan.qualifikationen.length}`,
                children: <QualiZuordnung key={stand} zeilen={plan.qualifikationen} auswahl={plan.auswahl} wahl={wahl} onWahl={setWahl} />,
              },
            ]}
          />
        ) : null}
      </div>
    </Drawer>
  );
}

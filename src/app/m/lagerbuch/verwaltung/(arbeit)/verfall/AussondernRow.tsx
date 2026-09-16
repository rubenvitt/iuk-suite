"use client";

import { useRef, useState, useTransition } from "react";
import { Alert, Button, Popconfirm, Radio } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { aussondern } from "../../../_actions/aussondern";
import type { VerfallOrt } from "../../../_lib/lesepfade/verfall";
import { Ikone } from "../../../_ui/ikonen";

/**
 * Der Wert der Wahl, wenn NICHT auf einen Ort eingeschränkt wird.
 *
 * ⚠️ NICHT `null` UND NICHT DIE WURZEL-ID. `null` wäre in einer antd-Auswahl
 * nicht von „nichts gewählt" zu unterscheiden, und `HANDLAGER_ID` ist selbst
 * ein Liegeplatz („noch keinem Schrank zugeordnet") — dieselbe Verwechslung,
 * die `ZAEHLORT_ALLE` in der Inventur schon einmal auseinandergehalten hat.
 */
const ALLE_ORTE = "alle";

/**
 * `Popconfirm` UND NICHT `Modal`: Aussondern schreibt eine nachvollziehbare
 * Journalzeile und am Verfallsregal werden mehrere Chargen nacheinander
 * bearbeitet. Der Ref verriegelt dabei auch zwei schnelle Bestätigungen, bevor
 * React den Pending-Zustand sichtbar gemacht hat.
 *
 * ── DIE ORTSWAHL ERSCHEINT NUR, WENN ES ETWAS ZU WÄHLEN GIBT (DRK-339) ──────
 *
 * Liegt die Charge an genau EINEM Ort, ist die Wahl bereits getroffen; eine
 * Auswahl mit einer Zeile ist ein Klick ohne Entscheidung. Der Ort steht dann
 * im Bestätigungstext, damit auf dem Schirm steht, was gebucht wird.
 *
 * ⚠️ „ALLES" BLEIBT DIE VORGABE, und das ist eine fachliche Entscheidung: eine
 * abgelaufene Charge ist an JEDEM Ort abgelaufen. Der Regelfall ist, sie
 * komplett loszuwerden; die Wahl eines einzelnen Schranks ist der Fall, dass
 * man nur an diesem einen steht. Eine Vorgabe auf den ersten Schrank ließe
 * Material zurück, ohne dass es jemandem auffiele.
 *
 * ⚠️ DIE WAHL SCHICKT EINEN ORT, KEINE MENGE. Was dort liegt, rechnet die
 * Transaktion; die Zahlen hier sind der Stand beim Rendern (Begründung im
 * Schema von `_actions/aussondern.ts`).
 */
export function AussondernRow({
  chargeId,
  bezeichnung,
  orte,
  einheit,
}: {
  chargeId: string;
  bezeichnung: string;
  orte: VerfallOrt[];
  einheit: string;
}) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [ziel, setZiel] = useState<string>(ALLE_ORTE);
  const [laeuft, start] = useTransition();
  const aussondernLaeuft = useRef(false);

  const gesamt = orte.reduce((summe, ort) => summe + ort.menge, 0);
  const wahl = orte.length > 1;

  const bestaetigen = () => {
    if (aussondernLaeuft.current) return;
    aussondernLaeuft.current = true;
    setFehler(null);
    start(async () => {
      try {
        const ergebnis = await aussondern({
          chargeId,
          // Ohne Wahl gar kein Feld — „alles raus" ist die Abwesenheit des
          // Orts, nicht ein zweiter Wert für dieselbe Sache.
          ...(wahl && ziel !== ALLE_ORTE ? { lagerortId: ziel } : {}),
          kommentar: `Verfallskontrolle — ${bezeichnung} ausgesondert`,
        });
        setFehler(ergebnis.ok ? null : ergebnis.fehler);
      } catch {
        setFehler("Charge konnte nicht ausgesondert werden.");
      } finally {
        aussondernLaeuft.current = false;
      }
    });
  };

  const einzelnerOrt = orte.length === 1 ? orte[0] : undefined;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm, flexWrap: "wrap" }}>
      <Popconfirm
        title="Charge aussondern?"
        // ⚠️ „Aussonderung", NICHT „Korrektur" (DRK-344). Die Buchung ist
        // technisch weiter eine Korrektur, im Journal steht seither aber
        // „Aussonderung" — und wer hier „Korrektur" liest und dort etwas
        // anderes findet, sucht die eigene Buchung vergeblich.
        description={
          <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
            <span>
              {einzelnerOrt
                ? `Bucht ${bezeichnung} aus ${einzelnerOrt.name} als Aussonderung aus`
                  + ` (${einzelnerOrt.menge} ${einheit}).`
                : `Bucht den Handlager-Rest von ${bezeichnung} als Aussonderung aus.`}
            </span>
            {wahl ? (
              <Radio.Group
                aria-label={`Ort für ${bezeichnung}`}
                value={ziel}
                onChange={(e) => setZiel(e.target.value as string)}
                options={[
                  { value: ALLE_ORTE, label: `Alles (${gesamt} ${einheit})` },
                  ...orte.map((ort) => ({
                    value: ort.id,
                    label: `nur ${ort.name} (${ort.menge} ${einheit})`,
                  })),
                ]}
              />
            ) : null}
          </div>
        }
        okText="Aussondern"
        cancelText="Abbrechen"
        okButtonProps={{ loading: laeuft }}
        onConfirm={bestaetigen}
      >
        {/* KEIN size="small": die alte Zeilenaktions-Ausnahme (Falle 4,
            docs/design/README.md) ist mit der Arbeitsdichte gefallen -- 44px
            ist hier bereits die volle wie die halbe Bediendichte, "small"
            unterbietet die Mindesttapflaeche (WCAG 2.5.5).
            e2e/lagerbuch-mobil.spec.ts:312 misst das heute nur auf
            /verwaltung/bestellung -- diese Seite ist (noch) nicht im
            Testpfad, die Regel gilt trotzdem. */}
        <Button
          danger
          loading={laeuft}
          icon={<Ikone name="kreuz" groesse={14} />}
          aria-label={`${bezeichnung} aussondern`}
        >
          aussondern
        </Button>
      </Popconfirm>
      {fehler ? (
        <Alert type="warning" showIcon={false} title={fehler} />
      ) : null}
    </div>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { Alert, Button, Popconfirm, Radio } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { aussondern } from "../../../_actions/aussondern";
import type { VerfallOrt } from "../../../_lib/lesepfade/verfall";
import { Ikone } from "../../../_ui/ikonen";
import s from "../../../_ui/verwaltung.module.css";

/**
 * Der Wert der Wahl, wenn NICHT auf einen Ort eingeschränkt wird.
 *
 * ⚠️ NICHT `null` UND NICHT DIE WURZEL-ID. `null` wäre in einer antd-Auswahl
 * nicht von „nichts gewählt" zu unterscheiden, und `HANDLAGER_ID` ist selbst
 * ein Liegeplatz („noch keinem Schrank zugeordnet").
 */
const ALLE_ORTE = "alle";

/**
 * Ein Ort als Wert der Auswahl — MIT PRÄFIX, nicht als rohe `lagerorte.id`
 * (Codex-Befund zu PR #173).
 *
 * ⚠️ DAS PRÄFIX IST NICHT SCHMUCK, und die Begründung steht schon einmal im
 * Modul: `_lib/entnahmeZiel.ts` führt `fz:` aus genau diesem Grund. IDs des
 * importierten Altbestands sind BELIEBIGE Zeichenketten — keine wird beim
 * Import neu vergeben. Hieße ein Schrank `alle`, wäre seine Wahl von „Alles"
 * nicht zu unterscheiden: die Aktion bekäme kein `lagerortId` und räumte
 * JEDEN Ort leer, statt den einen, den jemand angeklickt hat. Ein
 * Wertebereich, der sich mit dem Wächter überschneidet, ist der Fehler — nicht
 * der unwahrscheinliche Name.
 */
const ortWert = (lagerortId: string) => `ort:${lagerortId}`;

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
 * im Bestätigungstext, damit auf dem Schirm steht, was gebucht wird — und er
 * geht ausgeschrieben an die Aktion, siehe `gemeinterOrt` unten.
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
  const einzelnerOrt = orte.length === 1 ? orte[0] : undefined;

  /**
   * DIE WAHL, DIE DIE AUSWAHL ANZEIGT — nach einer Buchung neu abgeglichen
   * (Codex-Befund zu PR #173).
   *
   * ⚠️ EINE WAHL, DIE ES NICHT MEHR GIBT, DARF NICHT STEHEN BLEIBEN. Liegt
   * eine Charge an DREI Orten und räumt jemand einen davon, bleibt die Zeile
   * mit den beiden übrigen stehen — `ziel` trägt dann den leergeräumten. In
   * der Auswahl wäre KEINE Zeile angekreuzt, und ein Bestätigen schickte den
   * verschwundenen Ort: „An diesem Ort liegt nichts mehr", statt das zu tun,
   * was auf dem Schirm steht.
   *
   * ⚠️ DER RÜCKFALL AUF „ALLES" IST HIER KEIN STILLES MEHR-BUCHEN, und das
   * ist der Unterschied zu einem Rückfall beim ABSENDEN: die Auswahl zeigt
   * danach sichtbar „Alles" angekreuzt. Gebucht wird, was angekreuzt ist —
   * wer einen einzelnen Schrank will, sieht, dass er ihn neu wählen muss.
   */
  const auswahl = orte.some((ort) => ortWert(ort.id) === ziel) ? ziel : ALLE_ORTE;

  /**
   * DER ORT, DEN DIESE BESTAETIGUNG MEINT.
   *
   * ⚠️ EIN EINZIGER LIEGEPLATZ WIRD GENANNT, NICHT WEGGELASSEN (Codex-Befund
   * zu PR #173, P1). „Kein Feld" heisst serverseitig „alle Orte des
   * Bereichs" — und das ist beim Rendern dasselbe wie „dieser eine", aber
   * nicht mehr beim Bestaetigen: legt eine andere Sitzung in der Zwischenzeit
   * Bestand derselben Charge in einen ZWEITEN Schrank (Wareneingang direkt in
   * ein Fach, Umlagerung aus einem Fahrzeug), raeumt die Aktion beide — der
   * Text davor versprach einen. Der Ort ist deshalb ausgeschrieben; nur die
   * ausdrueckliche Wahl „Alles" laesst ihn weg.
   *
   * ⚠️ DER EINZELNE ORT SCHLAEGT DIE GEMERKTE WAHL, nicht umgekehrt. Schrumpft
   * die Liste von zwei Orten auf einen, ist der verbliebene das, was auf dem
   * Schirm steht — und genau der wird gebucht.
   */
  const gemeinterOrt = einzelnerOrt
    ? ortWert(einzelnerOrt.id)
    : auswahl;

  const bestaetigen = () => {
    if (aussondernLaeuft.current) return;
    aussondernLaeuft.current = true;
    setFehler(null);
    start(async () => {
      try {
        const ergebnis = await aussondern({
          chargeId,
          // „Alles raus" ist die ABWESENHEIT des Orts, nicht ein zweiter Wert
          // für dieselbe Sache.
          ...(gemeinterOrt === ALLE_ORTE
            ? {}
            : { lagerortId: gemeinterOrt.slice("ort:".length) }),
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
              /* ⚠️ DIE KLASSE TRAEGT DIE TREFFERFLAECHE (44px, Arbeitsdichte) —
                 eine Radio-Zeile erbt ihre Hoehe nicht von `controlHeight`.
                 Begruendung bei `.ortWahl` in `verwaltung.module.css`. */
              <div className={s.ortWahl}>
                <Radio.Group
                  aria-label={`Ort für ${bezeichnung}`}
                  /* ⚠️ UNTEREINANDER, NICHT NEBENEINANDER. antds Vorgabe ist
                     waagerecht; „nur GF-Schrank (6 Stk.)" neben zwei
                     Geschwistern bricht in einem Popconfirm auf dem Telefon
                     mitten im Namen um. `orientation` ist die heutige Form,
                     `vertical` nur noch ihr Altbestand
                     (`antd/es/_util/hooks/useOrientation.js`). */
                  orientation="vertical"
                  value={auswahl}
                  onChange={(e) => setZiel(e.target.value as string)}
                  options={[
                    { value: ALLE_ORTE, label: `Alles (${gesamt} ${einheit})` },
                    ...orte.map((ort) => ({
                      value: ortWert(ort.id),
                      label: `nur ${ort.name} (${ort.menge} ${einheit})`,
                    })),
                  ]}
                />
              </div>
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

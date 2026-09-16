"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Alert, Button, Card, Input, Space } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { beachtungSetzen } from "../../../../_actions/bz";
import { BEACHTUNG_HINWEIS_MAX } from "../../../../_lib/grenzen";
import { SCHRIFT } from "../../../../_lib/schrift";
import { Chip } from "../../../../_ui/Chip";

const SPEICHER_FEHLER = "Beachtung konnte nicht gespeichert werden.";

export type BeachtungWerte = {
  geraetId: string;
  /** `null` = keine Beachtung. Der Text IST der Zustand (`_db/schema.ts`). */
  hinweis: string | null;
  /** „seit 12.08. 09:15", sonst `null`. */
  seitText: string | null;
};

/**
 * DER AUFMERKSAMKEITSHINWEIS AM GERAET — DRK-311.
 *
 * ⚠️ HIER LIEGT DER EINZIGE WEG ZURUECK, und das ist der Grund, warum es diese
 * Insel gibt. Eine Beachtung entsteht meist beim Erfassen einer Kontrolle; ein
 * Formular, das sie nur SETZEN kann, hinterliesse einen gelben Status, den man
 * erst bei der naechsten turnusmaessigen Kontrolle wieder los wird — bis zu 31
 * Tage (`domain/bz.ts#BZ_KONTROLL_INTERVALL_TAGE`), obwohl die Sache seit
 * gestern erledigt ist. Wer das Aufheben an die Kontrolle haengt, bekommt
 * entweder erfundene Kontrollen oder ein Feld, das niemand mehr ernst nimmt.
 *
 * ⚠️ DER TEXT IST PFLICHT, und die Pruefung steht hier UND in der Action. Hier,
 * damit niemand erst nach dem Absenden erfaehrt, dass ein Wort fehlt; dort,
 * weil die Oberflaeche keine Zusage ist.
 */
export function BeachtungEditor(props: BeachtungWerte) {
  /*
   * Der Schluessel haengt an der IDENTITAET, nicht an den WERTEN — dieselbe
   * Begruendung wie am `ReferenzEditor` nebenan: ein wertabhaengiger Schluessel
   * unmountet den Teilbaum mitten im Tippen, sobald `revalidatePath` die Seite
   * neu rendert, und die Zeichen landen nirgends.
   */
  return <BeachtungEditorInhalt key={props.geraetId} {...props} />;
}

function BeachtungEditorInhalt({ geraetId, hinweis, seitText }: BeachtungWerte) {
  const [entwurf, setEntwurf] = useState(hinweis ?? "");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const wurzel = useRef<HTMLDivElement>(null);

  /*
   * Neue Serverwerte ziehen das Feld nach — aber nur, wenn niemand gerade darin
   * steht. Ohne die Fokusprobe ueberschriebe die Antwort des eigenen Speicherns
   * genau das, was die Person inzwischen weitergetippt hat.
   */
  useEffect(() => {
    const fokus = document.activeElement;
    if (fokus && wurzel.current?.contains(fokus)) return;
    setEntwurf(hinweis ?? "");
  }, [hinweis]);

  function speichern(neuerHinweis: string): void {
    setFehler(null);
    start(async () => {
      try {
        const ergebnis = await beachtungSetzen({ geraetId, hinweis: neuerHinweis });
        if (!ergebnis.ok) {
          setFehler(ergebnis.fehler);
          return;
        }
        /*
         * KEIN `setEntwurf` HIER. `revalidatePath` liefert den neuen Stand als
         * Prop, und der Effekt oben uebernimmt ihn — ein zweiter Schreiber auf
         * denselben Zustand liefe dem ersten hinterher.
         */
      } catch {
        setFehler(SPEICHER_FEHLER);
      }
    });
  }

  const gesetzt = entwurf.trim() !== "";

  return (
    <Card title="Beachtung" style={{ marginBlockEnd: SPACE.xl }}>
      <div ref={wurzel} style={{ display: "grid", gap: SPACE.md }}>
        {hinweis === null ? (
          <p style={SCHRIFT.neben}>
            Für dieses Gerät ist nichts zu beachten. Ein Hinweis hier macht es in
            der Liste gelb — für alles, was bei der nächsten Kontrolle jemand
            wissen muss.
          </p>
        ) : (
          /*
           * ⚠️ DER HINWEIS STEHT NEBEN DEM CHIP, NICHT DARIN (Reviewrunde 2).
           * `.chip` traegt `white-space: nowrap` (`verwaltung.module.css`) —
           * ein Hinweis von 500 Zeichen waere darin eine einzige unbrechbare
           * Zeile und liefe seitlich aus der Karte heraus. Dieselbe Aufteilung
           * wie in der Liste, und dieselbe wie im Akzeptanzkriterium: „ein
           * gelber Status MIT verstaendlichem Hinweis" sind zwei Dinge.
           *
           * Hier wird NICHT gedeckelt. Auf dem Geraeteblatt ist der volle Satz
           * das, was jemand lesen will; gedeckelt wird nur die Tabellenzelle,
           * wo er die Spalten daneben aus dem Bild schoebe.
           */
          <Space wrap align="start">
            <Chip ton="gelb" zeichen="warnung">beachten</Chip>
            <span style={{ ...SCHRIFT.text, overflowWrap: "anywhere" }}>{hinweis}</span>
            {seitText ? <span style={SCHRIFT.neben}>{seitText}</span> : null}
          </Space>
        )}

        <label style={{ display: "grid", gap: 5 }}>
          <span style={SCHRIFT.feldname}>Hinweis</span>
          <Input
            aria-label="Hinweis zur Beachtung"
            autoComplete="off"
            maxLength={BEACHTUNG_HINWEIS_MAX}
            value={entwurf}
            disabled={laeuft}
            placeholder="z. B. Display flackert beim Einschalten"
            onChange={(ereignis) => setEntwurf(ereignis.target.value)}
          />
        </label>

        <Space wrap>
          <Button
            type="primary"
            loading={laeuft}
            /*
             * ⚠️ DER KNOPF IST GESPERRT, STATT EINEN LEEREN HINWEIS ZU SETZEN.
             * Ein leerer Text HEBT in der Action auf — waere der Knopf hier
             * aktiv, hiesse „Beachtung setzen" bei leerem Feld das Gegenteil
             * von dem, was draufsteht. Aufgehoben wird nebenan, mit Namen.
             */
            disabled={!gesetzt}
            onClick={() => speichern(entwurf)}
          >
            {hinweis === null ? "Beachtung setzen" : "Hinweis speichern"}
          </Button>
          {hinweis === null ? null : (
            <Button
              loading={laeuft}
              onClick={() => {
                setEntwurf("");
                speichern("");
              }}
            >
              Beachtung aufheben
            </Button>
          )}
        </Space>

        {fehler ? (
          <Alert type="warning" showIcon={false} title={fehler} role="alert" />
        ) : null}
      </div>
    </Card>
  );
}

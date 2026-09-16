"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Radio, Space } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { setEinheitenart } from "../../../../_actions/fahrzeuge";
import {
  EINHEITENARTEN,
  EINHEITENART_LABEL,
  type Einheitenart,
} from "../../../../_lib/konstanten";
import { Chip } from "../../../../_ui/Chip";

const FEHLER = "Art konnte nicht gespeichert werden.";

/**
 * DER WEG AUS DEM ZWISCHENSTAND (DRK-309).
 *
 * Migration 0010 backfillt bewusst nicht: jede Einheit, die es vor ihr gab,
 * steht auf „nicht zugeordnet". Diese Insel ist die einzige Stelle, an der
 * jemand das nachträgt — und sie steht auf dem Einheitenblatt, nicht in der
 * Liste, weil die Antwort aus dem Gedächtnis kommt und nicht aus der Zeile.
 * Wer hier steht, hat die Einheit vor sich.
 *
 * ⚠️ SIE WECHSELT AUCH EINE GESETZTE ART, und zwar ohne Rückfrage. Es ist eine
 * Angabe über eine Sache, kein Vorgang an Beständen: nichts wird umgebucht,
 * nichts verfällt, kein Soll ändert sich. Ein Bestätigungsdialog davor
 * behauptete eine Tragweite, die es nicht gibt — und der Audit-Trigger aus
 * Migration 0010 protokolliert die Änderung ohnehin.
 *
 * ⚠️ ES GIBT KEINEN KNOPF ZURÜCK NACH „nicht zugeordnet". Der Zustand ist der,
 * aus dem man kommt, nicht einer, den jemand herstellt; `setEinheitenart`
 * nimmt ihn auch serverseitig nicht an.
 *
 * ⚠️ SIE IST NICHT DIE EINZIGE STELLE AUF DEM BLATT, DIE DIE ART LIEST
 * (Reviewrunde 7). Der Chip in der Kopfzeile, der Löschknopf, die
 * Vorlagenfläche und die Verfallsüberschrift bekommen sie als Prop aus der
 * Server Component. Ein rein lokaler Zustand hier hieße: die Wahl steht
 * richtig, und drei Zeilen weiter oben fragt dieselbe Seite „Fahrzeug
 * löschen?" über einer gerade gespeicherten Tasche — ein Widerspruch in
 * derselben Ansicht, und der teuerste davon steht an einer unumkehrbaren
 * Aktion. `router.refresh()` holt deshalb nach jeder erfolgreichen Änderung
 * den Serverstand nach.
 */
export function EinheitenartWahl({
  id,
  einheitenart,
}: {
  id: string;
  einheitenart: Einheitenart | null;
}) {
  const router = useRouter();
  const [wert, setWert] = useState<Einheitenart | null>(einheitenart);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const laeuftRef = useRef(false);

  function waehlen(naechste: Einheitenart): void {
    if (laeuftRef.current || naechste === wert) return;
    laeuftRef.current = true;
    /*
     * ⚠️ DER ZUSTAND WIRD ERST NACH DER ANTWORT GESETZT, nicht vorher. Eine
     * optimistische Anzeige wäre hier die falsche Zusicherung: schlägt die
     * Server Action fehl, stünde die neue Art auf dem Blatt und die alte in
     * der Datenbank — und die Fehlermeldung daneben läse sich wie ein
     * Darstellungsfehler statt wie ein nicht gespeicherter Wert.
     */
    start(async () => {
      try {
        const ergebnis = await setEinheitenart({ id, einheitenart: naechste });
        if (!ergebnis.ok) {
          setFehler(ergebnis.fehler);
          return;
        }
        setWert(naechste);
        setFehler(null);
        /*
         * ⚠️ NACH `setWert`, NICHT STATT DESSEN. Der lokale Zustand haelt die
         * Knoepfe waehrend der Auffrischung richtig; `refresh()` allein liesse
         * sie bis zur Antwort des Servers auf dem alten Wert stehen, und der
         * Klick saehe folgenlos aus. Beides zusammen: sofort sichtbar, und
         * danach stimmt das ganze Blatt.
         */
        router.refresh();
      } catch {
        setFehler(FEHLER);
      } finally {
        laeuftRef.current = false;
      }
    });
  }

  return (
    <div style={{ display: "grid", gap: SPACE.sm }}>
      <Space wrap align="center">
        <Radio.Group
          value={wert}
          disabled={laeuft}
          optionType="button"
          buttonStyle="solid"
          aria-label="Art der Einheit"
          onChange={(e) => waehlen(e.target.value as Einheitenart)}
          options={EINHEITENARTEN.map((art) => ({
            value: art,
            label: EINHEITENART_LABEL[art],
          }))}
        />
        {wert === null ? (
          /*
           * ⚠️ DER HINWEIS STEHT NEBEN DER WAHL, NICHT ALS `Alert` DARÜBER.
           * Der Zwischenstand ist erlaubt — Migration 0010 hat ihn erzeugt und
           * niemandem ein Datum gesetzt, an dem er weg sein muss. Ein
           * Warnbanner auf jedem Altblatt mahnte täglich zu etwas, das niemand
           * versprochen hat; derselbe graue Chip wie in der Liste sagt genug.
           */
          <Chip ton="grau">Noch nicht zugeordnet</Chip>
        ) : null}
      </Space>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
    </div>
  );
}

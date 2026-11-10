"use client";

import { useRef, useState, useTransition } from "react";
import { Button, Popconfirm } from "antd";
import { gegenbucheVorgang } from "../../../_actions/journal";
import { Chip } from "../../../_ui/Chip";
import { SCHRIFT } from "../../../_lib/schrift";

/**
 * IDA-378 — „GEGENBUCHEN" AN EINER JOURNALZEILE.
 *
 * ⚠️ GESCHICKT WIRD DIE EINE ZEILE, NICHT DER VORGANG. Welche Zeilen dazu
 * gehoeren, loest der Server aus der Datenbank auf (`vorgangsZeilen`); eine
 * gefilterte Seite zeigt oft nur ein Leg einer Umlagerung.
 *
 * `Popconfirm` wie beim Aussondern (`verfall/AussondernRow.tsx`): eine
 * nachvollziehbare Buchung, kein Loeschen. Der Ref verriegelt zwei schnelle
 * Bestaetigungen, bevor React den Pending-Zustand sichtbar gemacht hat.
 */
export function GegenbuchenAktion({
  zeilenId,
  gegenbuchbar,
  gegengebucht,
  beiErfolg,
}: {
  zeilenId: string;
  gegenbuchbar: boolean;
  gegengebucht: boolean;
  /** Die Original-IDs, die jetzt eine Gegenzeile haben — die Tabelle markiert sie sofort. */
  beiErfolg: (ids: string[]) => void;
}) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const sperre = useRef(false);

  if (gegengebucht) return <Chip ton="grau">Gegengebucht</Chip>;
  if (!gegenbuchbar) return null;

  function bestaetigt(): void {
    if (sperre.current) return;
    sperre.current = true;
    setFehler(null);
    starte(async () => {
      try {
        const r = await gegenbucheVorgang({ zeilenIds: [zeilenId] });
        if (r.ok) beiErfolg(r.wert.ids);
        else setFehler(r.fehler);
      } catch {
        setFehler("Keine Verbindung — nichts gegengebucht.");
      } finally {
        sperre.current = false;
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
      <Popconfirm
        title="Vorgang gegenbuchen?"
        description="Bucht alle Zeilen dieses Vorgangs mit umgekehrtem Vorzeichen."
        okText="Gegenbuchen"
        cancelText="Abbrechen"
        onConfirm={bestaetigt}
      >
        <Button loading={laeuft} data-rolle="journal-gegenbuchen">Gegenbuchen</Button>
      </Popconfirm>
      {fehler ? (
        <span role="alert" style={SCHRIFT.neben} data-rolle="journal-gegenbuchen-fehler">{fehler}</span>
      ) : null}
    </div>
  );
}

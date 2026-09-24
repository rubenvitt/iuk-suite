"use client";

import { useState, type FormEvent } from "react";
import { Alert, App, Button, Input, InputNumber, Switch } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { einstellungenSpeichernAction } from "../_actions/einstellungen";
import type { FeldFehler } from "../_lib/actionErgebnis";
import type { Einstellungen } from "../_lib/einstellungen";
import { Feld } from "./stammdaten/StammdatenFormular";

/**
 * Die Einstellungen des Einsatzbuch-Rechners. Geprüft wird auf dem Server
 * (`einstellungenSchema`), dessen Feldfehler stehen am Feld.
 *
 * ⚠️ DIE FRIST HAT BEWUSST KEIN `min`/`max` AM FELD. antds `InputNumber` klemmt einen Wert
 * außerhalb des Bereichs beim Verlassen still auf die Grenze — aus getippten 121 würden
 * gespeicherte 120, ohne dass jemand es merkt. Ohne Grenze kommt die 121 beim Server an und
 * wird mit „Höchstens 120 Minuten“ am Feld abgelehnt.
 */
export function EinstellungenFormular({ start }: { start: Einstellungen }) {
  const { message } = App.useApp();
  const [frist, setFrist] = useState<number | null>(start.fristMinuten);
  const [besatzung, setBesatzung] = useState(start.besatzung);
  const [bereitschaft, setBereitschaft] = useState(start.bereitschaft);
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<FeldFehler>({});
  const [laeuft, setLaeuft] = useState(false);

  function absenden(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault();
    setFehler(null);
    setFeldFehler({});
    // Ein leeres Feld liefert `null`; das Schema hätte dafür nur einen englischen Typfehler.
    if (frist === null) {
      setFeldFehler({ fristMinuten: "Bitte eine Zahl von 1 bis 120 eintragen" });
      return;
    }
    setLaeuft(true);
    void einstellungenSpeichernAction({ fristMinuten: frist, besatzung, bereitschaft })
      .then((ergebnis) => {
        if (ergebnis.ok) {
          void message.success("Gespeichert.");
          return;
        }
        setFehler(ergebnis.fehler);
        setFeldFehler(ergebnis.feldFehler ?? {});
      })
      .catch(() => setFehler("Speichern ist fehlgeschlagen. Bitte noch einmal versuchen."))
      .finally(() => setLaeuft(false));
  }

  return (
    <form onSubmit={absenden} style={{ display: "grid", gap: SPACE.lg, maxWidth: 480 }}>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}

      <Feld id="einstellung-frist" label="Änderungsfrist nach dem Absenden" fehler={feldFehler.fristMinuten}>
        <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
          <InputNumber
            id="einstellung-frist"
            precision={0}
            value={frist}
            status={feldFehler.fristMinuten ? "error" : undefined}
            aria-describedby={feldFehler.fristMinuten ? "einstellung-frist-fehler" : undefined}
            onChange={(wert) => setFrist(typeof wert === "number" ? wert : null)}
          />
          <span>Minuten</span>
        </div>
        <div style={{ ...SCHRIFT.neben, marginBlockStart: SPACE.xs }}>1 bis 120 Minuten</div>
      </Feld>

      <label style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
        <Switch checked={besatzung} onChange={setBesatzung} />
        Personal Fahrzeugen zuordnen
      </label>

      <Feld id="einstellung-bereitschaft" label="Name der Bereitschaft" fehler={feldFehler.bereitschaft}>
        <Input
          id="einstellung-bereitschaft"
          value={bereitschaft}
          status={feldFehler.bereitschaft ? "error" : undefined}
          aria-describedby={feldFehler.bereitschaft ? "einstellung-bereitschaft-fehler" : undefined}
          onChange={(e) => setBereitschaft(e.target.value)}
        />
      </Feld>

      <div>
        <Button type="primary" htmlType="submit" loading={laeuft}>
          Speichern
        </Button>
      </div>
    </form>
  );
}

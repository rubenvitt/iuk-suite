"use client";

import { useState } from "react";
import { Button, Modal } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { setzeSichtbarkeitAction } from "@/app/m/portal/actions";
import type { GruppenOption } from "@/app/m/portal/_lib/gruppen";
import {
  SichtbarkeitFelder,
  sichtbarkeitVollstaendig,
  type Sichtbarkeit,
} from "@/app/m/portal/admin/sichtbarkeit-felder";

/**
 * „Sichtbarkeit" je Zeile der Dienste-Tabelle (IDA-227): öffentlich oder welche
 * Gruppen die Kachel sehen. Ein `Modal`, keine `Drawer` — zwei Felder brauchen
 * keine Seitenfläche, und Falle 13/24 (`CLAUDE.md`) betreffen die Schublade.
 *
 * Seit IDA-391 öffnet es das Zeilenmenü der Tabelle; der Knopf je Zeile ist
 * entfallen. Der Zustand startet bei jedem Öffnen neu aus der Zeile (der Inhalt
 * ist je Dienst gekeyt und wird beim Schließen verworfen): ein abgebrochener
 * Entwurf soll beim nächsten Öffnen nicht als gespeicherter Stand erscheinen.
 * Die Action wird DIREKT importiert (Falle 9, `CLAUDE.md`).
 */
export function SichtbarkeitAendern({
  dienst,
  gruppen,
  offen,
  onSchliessen,
}: {
  dienst: { id: string; name: string } & Sichtbarkeit;
  gruppen: GruppenOption[];
  offen: boolean;
  onSchliessen: () => void;
}) {
  const [wert, setWert] = useState<Sichtbarkeit>({ isPublic: dienst.isPublic, requiredGroups: dienst.requiredGroups });
  const [speichert, setSpeichert] = useState(false);

  return (
    <>
      <Modal
        open={offen}
        title={`Wer sieht „${dienst.name}“?`}
        onCancel={() => onSchliessen()}
        footer={null}
        destroyOnHidden
      >
        <form
          data-testid="sichtbarkeit-form"
          action={async (formData) => {
            setSpeichert(true);
            try {
              await setzeSichtbarkeitAction(formData);
              onSchliessen();
            } finally {
              setSpeichert(false);
            }
          }}
          style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}
        >
          <input type="hidden" name="id" value={dienst.id} />
          <SichtbarkeitFelder
            idPraefix={`svc-${dienst.id}`}
            optionen={gruppen}
            wert={wert}
            onChange={setWert}
          />
          <div style={{ display: "flex", gap: SPACE.sm, justifyContent: "flex-end" }}>
            <Button onClick={() => onSchliessen()}>Abbrechen</Button>
            <Button
              htmlType="submit"
              type="primary"
              loading={speichert}
              disabled={!sichtbarkeitVollstaendig(wert)}
            >
              Speichern
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

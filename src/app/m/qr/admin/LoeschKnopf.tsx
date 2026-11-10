"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Modal } from "antd";
import { deletePresetAction } from "@/app/m/qr/actions";
import type { QrKind } from "@/app/m/qr/_lib/types";

/**
 * LÖSCHEN MIT RÜCKFRAGE (IDA-390).
 *
 * Bis hierher war „Löschen" ein Formular ohne Bestätigung, ein großer roter Knopf direkt neben
 * „Bearbeiten" in jeder Zeile — ein Fehlgriff nahm einen Schnellzugriff samt WLAN-Passwort für alle
 * weg. Jetzt steht der Knopf nur noch beim Bearbeiten, abgesetzt unter dem Formular, als Textknopf
 * (Rot ist nie Primäraktion, Falle 3), und fragt mit dem Namen nach.
 *
 * `Modal` statt `Popconfirm`: dessen Knöpfe sind fest `small` und auf dieser Handschuh-Seite zu klein.
 * Die Action ist direkt importiert, nicht als Prop gereicht (Falle 9).
 */
export function LoeschKnopf({ id, label, kind }: { id: string; label: string; kind: QrKind }) {
  const { message } = App.useApp();
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [laeuft, starte] = useTransition();

  const loeschen = () =>
    starte(async () => {
      const daten = new FormData();
      daten.set("id", id);
      await deletePresetAction(daten);
      setOffen(false);
      message.success(`„${label}“ gelöscht.`);
      // Zurück aufs Anlege-Formular: `?bearbeiten=` zeigte sonst auf einen Eintrag, den es nicht mehr gibt.
      router.replace("/admin");
    });

  return (
    <>
      <Button danger type="text" onClick={() => setOffen(true)} data-testid="preset-delete">
        Schnellzugriff löschen
      </Button>
      <Modal
        open={offen}
        title={`„${label}“ löschen?`}
        okText="Löschen"
        cancelText="Abbrechen"
        okButtonProps={{ danger: true, loading: laeuft }}
        onOk={loeschen}
        onCancel={() => setOffen(false)}
        destroyOnHidden
      >
        <p style={{ margin: 0 }}>
          {kind === "wifi"
            ? "Der Schnellzugriff verschwindet samt WLAN-Passwort für alle aus dem Generator."
            : "Der Schnellzugriff verschwindet für alle aus dem Generator."}
        </p>
      </Modal>
    </>
  );
}

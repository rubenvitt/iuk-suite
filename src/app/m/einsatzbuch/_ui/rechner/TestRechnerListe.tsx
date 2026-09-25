"use client";

import { useState } from "react";
import { App, Button, Popconfirm } from "antd";
import { Kartentabelle, nachText } from "@/core/tabelle";
import { testRechnerLoeschenAction } from "../../_actions/rechner";
import type { TestRechnerZeile } from "../../_lib/anbindung/status";
import styles from "./rechner.module.css";

/**
 * Test-Rechner als Kartentabelle (Vorbild `_ui/stammdaten/StammdatenTabelle.tsx`): auf dem
 * Telefon Karten, sonst eine Tabelle. Die Liste kommt nach jedem Löschen über die Props neu
 * (`testRechnerLoeschenAction` ruft `revalidatePath`); gemerkt wird hier nur, welche Zeile
 * gerade löscht. `testRechnerLoeschenAction` steht direkt importiert, nie als Prop (Falle 9).
 */
export function TestRechnerListe({ liste }: { liste: TestRechnerZeile[] }) {
  const { message } = App.useApp();
  const [laeuft, setLaeuft] = useState<string | null>(null);

  function loeschen(id: string): void {
    setLaeuft(id);
    void testRechnerLoeschenAction(id)
      .then((ergebnis) => {
        if (!ergebnis.ok) void message.error(ergebnis.fehler);
      })
      .catch(() => void message.error("Der Test-Rechner ließ sich nicht löschen. Bitte die Seite neu laden."))
      .finally(() => setLaeuft(null));
  }

  return (
    <Kartentabelle<TestRechnerZeile>
      rowKey="id"
      aria-label="Test-Rechner"
      dataSource={liste}
      leer={{ nichts: "Keine Test-Rechner." }}
      columns={[
        { title: "Name", key: "name", sorter: nachText<TestRechnerZeile>((r) => r.name), render: (_: unknown, r) => r.name },
        { title: "Eingerichtet", key: "eingerichtet", render: (_: unknown, r) => `${r.eingerichtetAm} von ${r.eingerichtetVon}` },
        { title: "Letzter Kontakt", key: "kontakt", render: (_: unknown, r) => r.letzterKontakt ?? "Noch kein Kontakt" },
        { title: "Anker bis", key: "anker", render: (_: unknown, r) => (r.ankerBis !== null ? `Block ${r.ankerBis}` : "Noch kein Anker") },
        {
          title: "Abweichungen",
          key: "abweichungen",
          render: (_: unknown, r) => (r.abweichungen > 0 ? <span className={styles.abweichungenZahl}>{r.abweichungen}</span> : r.abweichungen),
        },
        {
          title: "Aktionen",
          key: "aktionen",
          render: (_: unknown, r) => (
            <Popconfirm
              title={`Test-Rechner „${r.name}“ löschen?`}
              description="Rechner, Token, Schlüsselpaar und Anker werden unwiderruflich entfernt. Testeinsätze dieses Rechners lassen sich danach nicht mehr öffnen."
              okText="Endgültig löschen"
              cancelText="Abbrechen"
              okButtonProps={{ danger: true }}
              onConfirm={() => loeschen(r.id)}
            >
              <Button danger loading={laeuft === r.id} disabled={laeuft !== null && laeuft !== r.id}>
                Test-Rechner löschen
              </Button>
            </Popconfirm>
          ),
        },
      ]}
    />
  );
}

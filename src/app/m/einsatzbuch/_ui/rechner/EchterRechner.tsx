"use client";

import { useState } from "react";
import { App, Button, Card, Popconfirm } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { rechnerWiderrufenAction } from "../../_actions/rechner";
import type { EchterRechnerStatus } from "../../_lib/anbindung/status";
import styles from "./rechner.module.css";

/**
 * Karte „Echter Einsatzbuch-Rechner" (Brief §5.2). Eigene Client-Insel mit serialisierbaren
 * Props (Falle 9): `rechnerWiderrufenAction` wird direkt importiert, nicht als Prop gereicht.
 * Ohne echten Rechner zeigt sie nur den Hinweistext — die Einrichtung startet am Rechner selbst,
 * die Suite legt hier nichts an.
 *
 * Abweichungen stehen als eigene, rote Liste (Falle 3): `colorError === colorPrimary` in dieser
 * Suite, ein `Alert type="error"` sähe wie eine Primäraktion aus, und Rot auf einer Datenfläche
 * wäre hier zusätzlich falsch, weil es fachlich etwas bedeutet (eine veränderte Kette). Die Farbe
 * kommt deshalb aus einer eigenen Variable (`rechner.module.css`), nie aus antds Fehlerfarbe.
 */
export function EchterRechner({ rechner }: { rechner: EchterRechnerStatus | null }) {
  const { message } = App.useApp();
  const [laeuft, setLaeuft] = useState(false);

  function widerrufen(): void {
    if (!rechner) return;
    setLaeuft(true);
    void rechnerWiderrufenAction(rechner.id)
      .then((ergebnis) => {
        if (!ergebnis.ok) void message.error(ergebnis.fehler);
      })
      .catch(() => void message.error("Der Rechner ließ sich nicht widerrufen. Bitte die Seite neu laden."))
      .finally(() => setLaeuft(false));
  }

  return (
    <Card title="Echter Einsatzbuch-Rechner" className={styles.modul}>
      {!rechner ? (
        <p>Noch kein echter Rechner eingerichtet. Die Einrichtung startet am Rechner selbst.</p>
      ) : (
        <div style={{ display: "grid", gap: SPACE.md }}>
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: SPACE.sm, margin: 0 }}>
            <div>
              <dt>Name</dt>
              <dd>{rechner.name}</dd>
            </div>
            <div>
              <dt>Eingerichtet</dt>
              <dd>
                {rechner.eingerichtetAm} von {rechner.eingerichtetVon}
              </dd>
            </div>
            <div>
              <dt>Letzter Kontakt</dt>
              <dd>{rechner.letzterKontakt ?? "Noch kein Kontakt"}</dd>
            </div>
            <div>
              <dt>Letzte Sicherung</dt>
              <dd>{rechner.letzteSicherung ?? "Noch keine Sicherung"}</dd>
            </div>
            <div>
              <dt>Anker</dt>
              <dd>{rechner.ankerBis !== null ? `Anker bis Block ${rechner.ankerBis}` : "Noch kein Anker"}</dd>
            </div>
            <div>
              <dt>Schlüssel</dt>
              <dd>{rechner.schluesselId ?? "Unbekannt"}</dd>
            </div>
          </dl>

          {rechner.abweichungen.length > 0 && (
            <div>
              <p style={{ margin: `0 0 ${SPACE.xs}px`, fontWeight: 600 }}>Anker-Abweichungen</p>
              <ul className={styles.abweichungenListe}>
                {rechner.abweichungen.map((a) => (
                  <li key={`${a.block}-${a.zeitpunkt}`} className={styles.abweichungenZeile}>
                    Block {a.block}: erwartet {a.erwartet}, gemeldet {a.gemeldet} — {a.zeitpunkt}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Popconfirm
            title="Rechner widerrufen?"
            description="Der Rechner kann danach weder Stammdaten holen noch Anker melden. Er versiegelt weiter, bis er neu eingerichtet ist."
            okText="Widerrufen"
            cancelText="Abbrechen"
            okButtonProps={{ danger: true }}
            onConfirm={widerrufen}
          >
            <Button danger loading={laeuft} style={{ justifySelf: "start" }}>
              Rechner widerrufen
            </Button>
          </Popconfirm>
        </div>
      )}
    </Card>
  );
}

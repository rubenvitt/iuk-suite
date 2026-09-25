"use client";

import { Card } from "antd";
import { SPACE } from "@/core/theme/tokens";
import type { WiderrufenerRechnerStatus } from "../../_lib/anbindung/status";
import styles from "./rechner.module.css";

/**
 * Karte „Widerrufene echte Rechner" (Stufe 6, Task 7, Entscheidung 11): steht unter der Karte des
 * aktiven Rechners (`EchterRechner`), rein lesend — keine Aktion, kein Formular —, aber als eigene
 * Client-Insel wie `Freigaben`, damit die Seite konsistent aus RSC + Client-Karten besteht statt
 * zwei Bauarten zu mischen. Ohne widerrufene Rechner zeigt sie nichts (kein leerer Kartenrumpf).
 *
 * Abweichungen stehen wie bei `EchterRechner` als eigene, rote Liste (Falle 3): Rot kommt aus der
 * eigenen Variable in `rechner.module.css`, nie aus antds Fehlerfarbe.
 */
export function WiderrufeneRechner({ liste }: { liste: WiderrufenerRechnerStatus[] }) {
  if (liste.length === 0) return null;

  return (
    <Card title="Widerrufene echte Rechner" className={styles.modul}>
      <div style={{ display: "grid", gap: SPACE.lg }}>
        {liste.map((r) => (
          <div key={r.id} className={styles.widerrufenZeile}>
            <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: SPACE.sm, margin: 0 }}>
              <div>
                <dt>Name</dt>
                <dd>{r.name}</dd>
              </div>
              <div>
                <dt>Eingerichtet</dt>
                <dd>
                  {r.eingerichtetAm} von {r.eingerichtetVon}
                </dd>
              </div>
              <div>
                <dt>Widerrufen</dt>
                <dd>{r.widerrufenAm}</dd>
              </div>
              <div>
                <dt>Anker</dt>
                <dd>{r.ankerBis !== null ? `Anker bis Block ${r.ankerBis}` : "Kein Anker"}</dd>
              </div>
            </dl>

            {r.abweichungen.length > 0 && (
              <div style={{ marginTop: SPACE.sm }}>
                <p style={{ margin: `0 0 ${SPACE.xs}px`, fontWeight: 600 }}>Anker-Abweichungen</p>
                <ul className={styles.abweichungenListe}>
                  {r.abweichungen.map((a) => (
                    <li key={`${a.block}-${a.zeitpunkt}`} className={styles.abweichungenZeile}>
                      Block {a.block}: erwartet {a.erwartet}, gemeldet {a.gemeldet} — {a.zeitpunkt}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

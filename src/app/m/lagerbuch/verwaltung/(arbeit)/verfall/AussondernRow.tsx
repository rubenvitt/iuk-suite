"use client";

import { useRef, useState, useTransition } from "react";
import { Alert, Button, Popconfirm } from "antd";
import { aussondern } from "../../../_actions/aussondern";
import { Ikone } from "../../../_ui/ikonen";

/**
 * `Popconfirm` UND NICHT `Modal`: Aussondern schreibt eine nachvollziehbare
 * Journalzeile und am Verfallsregal werden mehrere Chargen nacheinander
 * bearbeitet. Der Ref verriegelt dabei auch zwei schnelle Bestätigungen, bevor
 * React den Pending-Zustand sichtbar gemacht hat.
 */
export function AussondernRow({
  chargeId,
  bezeichnung,
}: {
  chargeId: string;
  bezeichnung: string;
}) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const aussondernLaeuft = useRef(false);

  const bestaetigen = () => {
    if (aussondernLaeuft.current) return;
    aussondernLaeuft.current = true;
    setFehler(null);
    start(async () => {
      try {
        const ergebnis = await aussondern({
          chargeId,
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
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <Popconfirm
        title="Charge aussondern?"
        description={`Bucht den Handlager-Rest von ${bezeichnung} als Korrektur aus.`}
        okText="Aussondern"
        cancelText="Abbrechen"
        okButtonProps={{ loading: laeuft }}
        onConfirm={bestaetigen}
      >
        <Button
          size="small"
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

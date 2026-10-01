"use client";

import type { FormEvent, ReactNode } from "react";
import { Alert, Button, Drawer, Popconfirm } from "antd";
import { flyinBreite } from "@/core/theme/flyin";

/**
 * FLYIN EINES BIBLIOTHEKSEINTRAGS (Entscheidung 11): ausdrücklich speichern — Stammdaten, kein Rückgängig.
 * `flyinBreite` (Falle 13); Löschen mit Nachfrage, weil es nichts zurückholt (Pläne behalten ihre Kopien).
 */
export function BibFlyin({ offen, titel, formName, fehler, laeuft, onSchliessen, onSpeichern, onWeiter, onLoeschen, onGeoeffnet, children }: {
  offen: boolean; titel: string; formName: string; fehler: string | null; laeuft: boolean;
  /** Nach dem Öffnen (Portal steht): Fokus ins erste Feld — der Effekt im Formular käme vor dem Portal. */
  onGeoeffnet?: () => void;
  onSchliessen: () => void; onSpeichern: () => void; onWeiter?: () => void; onLoeschen?: () => void; children: ReactNode;
}) {
  const absenden = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); if (!laeuft) onSpeichern(); };
  // autoFocus={false}: rc-drawer fokussierte sonst NACH dem Fokus-Effekt des Formulars seinen Container (wie StelleFlyin des Editors).
  return (
    <Drawer open={offen} onClose={onSchliessen} title={titel} size={flyinBreite(520)} destroyOnHidden rootClassName="kp-flyin" autoFocus={false}
      afterOpenChange={(auf) => { if (auf) onGeoeffnet?.(); }}>
      {offen ? (
        <form aria-label={formName} onSubmit={absenden} className="kp-formular">
          {fehler ? <Alert type="warning" showIcon title={fehler} /> : null}
          {children}
          <div className="kp-formular-knoepfe">
            <Button type="primary" htmlType="submit" loading={laeuft}>Speichern</Button>
            {onWeiter ? <Button onClick={() => { if (!laeuft) onWeiter(); }}>Speichern und nächste</Button> : null}
            <Button onClick={onSchliessen}>Abbrechen</Button>
            {onLoeschen ? (
              <Popconfirm title="Aus der Bibliothek löschen?" description="Pläne behalten ihre Kopien." okText="Löschen" cancelText="Abbrechen" onConfirm={onLoeschen}>
                <Button danger disabled={laeuft}>Löschen</Button>
              </Popconfirm>
            ) : null}
          </div>
        </form>
      ) : null}
    </Drawer>
  );
}

/** Feldfehler am Feld (docs/design/feedback-admin.md 4.4): Text plus `aria-invalid`/`aria-describedby`, nie rot. */
export function feldHilfe(basis: string, feldFehler: Record<string, string>, name: string) {
  const id = `${basis}-${name}-fehler`;
  return {
    attr: { "aria-invalid": feldFehler[name] ? true : undefined, "aria-describedby": feldFehler[name] ? id : undefined } as const,
    text: feldFehler[name] ? <p id={id} className="kp-feldfehler">{feldFehler[name]}</p> : null,
  };
}

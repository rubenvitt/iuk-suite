"use client";

import { useState, type FormEvent } from "react";
import { Alert, App, Button, Card, Input } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { suchlageTrennenAction, suchlageVerbindenAction } from "../_actions/umsysteme";
import { Feld } from "./stammdaten/StammdatenFormular";

/**
 * Verbindung des Einsatztagebuchs zu Suchlage (IDA-359). Der Großbild-Link geht einmal an den
 * Server und kommt nie zurück: Angezeigt wird nur die Adresse.
 */
export function SuchlageVerbindung({ start }: { start: { adresse: string; sperreAbgelehnt?: boolean } | null }) {
  const { message } = App.useApp();
  const [adresse, setAdresse] = useState(start?.adresse ?? null);
  const [sperreAbgelehnt, setSperreAbgelehnt] = useState(start?.sperreAbgelehnt ?? false);
  const [ersetzen, setErsetzen] = useState(false);
  const [link, setLink] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<string | undefined>(undefined);
  const [laeuft, setLaeuft] = useState(false);

  function verbinden(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault();
    setFehler(null);
    setFeldFehler(undefined);
    setLaeuft(true);
    void suchlageVerbindenAction({ link })
      .then((ergebnis) => {
        if (ergebnis.ok) {
          void message.success("Verbunden.");
          setAdresse(ergebnis.wert.adresse);
          setSperreAbgelehnt(ergebnis.wert.sperreAbgelehnt);
          setErsetzen(false);
          setLink("");
          return;
        }
        setFehler(ergebnis.feldFehler?.link ? null : ergebnis.fehler);
        setFeldFehler(ergebnis.feldFehler?.link);
      })
      .catch(() => setFehler("Speichern ist fehlgeschlagen. Bitte noch einmal versuchen."))
      .finally(() => setLaeuft(false));
  }

  function trennen(): void {
    setFehler(null);
    setLaeuft(true);
    void suchlageTrennenAction()
      .then(() => {
        void message.success("Verbindung getrennt.");
        setAdresse(null);
        setErsetzen(false);
      })
      .catch(() => setFehler("Trennen ist fehlgeschlagen. Bitte noch einmal versuchen."))
      .finally(() => setLaeuft(false));
  }

  return (
    <Card title="Suchlage">
      <div style={{ display: "grid", gap: SPACE.md }}>
        {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
        {adresse && !ersetzen ? (
          <div style={{ display: "grid", gap: SPACE.sm }} data-suchlage-verbunden="">
            <span>
              Verbunden mit <strong>{adresse}</strong>
            </span>
            {sperreAbgelehnt ? (
              <Alert
                type="warning"
                showIcon={false}
                title="Suchlage lehnt das Sperren verknüpfter Einsätze ab. Dafür braucht es einen Großbild-Link mit „Für die IUK-Suite (Einsatztagebuch)“."
              />
            ) : null}
            <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
              <Button onClick={() => setErsetzen(true)} disabled={laeuft}>Anderen Link eintragen</Button>
              <Button onClick={trennen} loading={laeuft}>Verbindung trennen</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={verbinden} style={{ display: "grid", gap: SPACE.md }}>
            <Feld id="einstellung-suchlage-link" label="Großbild-Link aus Suchlage" fehler={feldFehler}>
              <Input
                id="einstellung-suchlage-link"
                value={link}
                placeholder="https://…/kiosk#…"
                autoComplete="off"
                status={feldFehler ? "error" : undefined}
                aria-describedby={feldFehler ? "einstellung-suchlage-link-fehler" : undefined}
                onChange={(e) => setLink(e.target.value)}
              />
            </Feld>
            <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
              <Button type="primary" htmlType="submit" loading={laeuft}>Verbinden</Button>
              {ersetzen ? <Button onClick={() => setErsetzen(false)} disabled={laeuft}>Abbrechen</Button> : null}
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}

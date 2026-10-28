"use client";

import { useId, useState, type FormEvent } from "react";
import { Alert, App, Button, Card, Input, Popconfirm } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { zeitFormat } from "@/core/zeit";
import { linkAnlegenAction, linkWiderrufenAction } from "../_actions/verwaltung";
import type { LinkDTO } from "../_lib/links";
import v from "./verwaltung.module.css";

const ZEIT = zeitFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

/**
 * Links für den Online-Monitor: Ein Rechner, der so einen Link einmal öffnet, sieht den Monitor ohne
 * Anmeldung, bis der Link widerrufen ist. Der Link steht nach dem Anlegen genau einmal da.
 * `online` ist die Adresse des Online-Monitors; ohne sie gibt es nichts anzulegen.
 */
export function OeffentlicheLinks({ liste, online }: { liste: LinkDTO[]; online: string | null }) {
  const { message } = App.useApp();
  const [bezeichnung, setBezeichnung] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [neu, setNeu] = useState<{ bezeichnung: string; adresse: string } | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const id = useId();

  function anlegen(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setFehler(null);
    setLaeuft("neu");
    const name = bezeichnung;
    void linkAnlegenAction(name)
      .then((r) => {
        if (!r.ok) {
          setFehler(r.fehler);
          return;
        }
        setBezeichnung("");
        setNeu({ bezeichnung: name.trim(), adresse: r.wert.adresse });
      })
      .catch(() => setFehler("Anlegen ist fehlgeschlagen. Bitte noch einmal versuchen."))
      .finally(() => setLaeuft(null));
  }

  function widerrufen(l: LinkDTO): void {
    setLaeuft(l.id);
    void linkWiderrufenAction(l.id)
      .then((r) => {
        if (!r.ok) void message.warning(r.fehler);
      })
      .catch(() => void message.warning("Widerrufen ist fehlgeschlagen. Bitte die Seite neu laden."))
      .finally(() => setLaeuft(null));
  }

  function kopieren(text: string): void {
    void navigator.clipboard
      .writeText(text)
      .then(() => void message.success("Kopiert."))
      .catch(() => void message.warning("Kopieren ging nicht. Bitte von Hand markieren."));
  }

  return (
    <Card title="Links für Rechner ohne Anmeldung">
      <div style={{ display: "grid", gap: SPACE.lg }}>
        <span style={SCHRIFT.neben} className={v.gedaempft}>
          Öffnet ein Rechner so einen Link, zeigt er den Online-Monitor ohne Anmeldung und bleibt dabei, auch nach einem Neustart. Wird der Link widerrufen, verliert jeder Rechner damit den Zugang nach spätestens einer Minute. Alle anderen melden sich mit ihrem Konto an.
        </span>

        {online === null ? (
          <span>Für den Online-Monitor ist noch keine Adresse eingetragen. Solange gibt es keine Links.</span>
        ) : null}

        {neu ? (
          <Alert
            type="success"
            showIcon={false}
            title={`Link für „${neu.bezeichnung}“ angelegt. Er steht nur jetzt hier.`}
            description={
              <div style={{ display: "grid", gap: SPACE.sm }}>
                <span>Diesen Link auf dem Rechner einmal öffnen, am besten als Lesezeichen oder Startseite:</span>
                <pre className={v.schluessel} data-testid="neuer-link">{neu.adresse}</pre>
                <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
                  <Button onClick={() => kopieren(neu.adresse)}>Kopieren</Button>
                  <Button onClick={() => setNeu(null)}>Fertig</Button>
                </div>
              </div>
            }
          />
        ) : null}

        {liste.length > 0 ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: SPACE.md }} aria-label="Links">
            {liste.map((l) => (
              <li key={l.id} style={{ display: "flex", gap: SPACE.md, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <strong>{l.bezeichnung}</strong>
                  <div style={SCHRIFT.neben} className={v.gedaempft}>
                    angelegt {ZEIT.format(new Date(l.angelegtAm))} von {l.angelegtVon}
                  </div>
                </div>
                <Popconfirm
                  title={`Link „${l.bezeichnung}“ widerrufen?`}
                  description="Rechner mit diesem Link sehen den Monitor danach nicht mehr."
                  okText="Widerrufen"
                  cancelText="Abbrechen"
                  onConfirm={() => widerrufen(l)}
                >
                  <Button loading={laeuft === l.id} aria-label={`Link widerrufen: ${l.bezeichnung}`}>
                    Widerrufen
                  </Button>
                </Popconfirm>
              </li>
            ))}
          </ul>
        ) : online !== null ? (
          <span>Noch kein Link angelegt.</span>
        ) : null}

        {online !== null ? (
          <form onSubmit={anlegen} style={{ display: "grid", gap: SPACE.sm }}>
            <label htmlFor={id} style={SCHRIFT.neben}>
              Neuer Link
            </label>
            <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
              <Input
                id={id}
                value={bezeichnung}
                placeholder="zum Beispiel Rechner Wache"
                status={fehler ? "error" : undefined}
                style={{ flex: "1 1 220px" }}
                onChange={(e) => setBezeichnung(e.target.value)}
              />
              <Button htmlType="submit" loading={laeuft === "neu"}>
                Link anlegen
              </Button>
            </div>
            {fehler ? <span style={SCHRIFT.neben}>{fehler}</span> : null}
          </form>
        ) : null}
      </div>
    </Card>
  );
}

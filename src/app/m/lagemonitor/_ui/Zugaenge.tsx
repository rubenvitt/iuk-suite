"use client";

import { useId, useState, type FormEvent } from "react";
import { Alert, App, Button, Card, Input, Popconfirm } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { zeitFormat } from "@/core/zeit";
import { zugangAnlegenAction, zugangWiderrufenAction } from "../_actions/verwaltung";
import type { ZugangDTO } from "../_lib/schluessel";
import v from "./verwaltung.module.css";

const ZEIT = zeitFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

/**
 * Die Schlüssel, mit denen ein Lagemonitor seine Einstellungen abholt. Der Schlüssel steht nach dem
 * Anlegen genau einmal da, zusammen mit den zwei Zeilen für die `.env` des Monitors.
 */
export function Zugaenge({ liste }: { liste: ZugangDTO[] }) {
  const { message } = App.useApp();
  const [bezeichnung, setBezeichnung] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [neu, setNeu] = useState<{ bezeichnung: string; zeilen: string } | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const id = useId();

  function anlegen(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setFehler(null);
    setLaeuft("neu");
    const name = bezeichnung;
    void zugangAnlegenAction(name)
      .then((r) => {
        if (!r.ok) {
          setFehler(r.fehler);
          return;
        }
        setBezeichnung("");
        setNeu({ bezeichnung: name.trim(), zeilen: `LAGEMONITOR_SUITE_URL=${window.location.origin}\nLAGEMONITOR_SUITE_TOKEN=${r.wert.schluessel}` });
      })
      .catch(() => setFehler("Anlegen ist fehlgeschlagen. Bitte noch einmal versuchen."))
      .finally(() => setLaeuft(null));
  }

  function widerrufen(z: ZugangDTO): void {
    setLaeuft(z.id);
    void zugangWiderrufenAction(z.id)
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
    <Card title="Zugänge für den Monitor">
      <div style={{ display: "grid", gap: SPACE.lg }}>
        <span style={SCHRIFT.neben} className={v.gedaempft}>
          Jeder Lagemonitor holt seine Einstellungen mit einem eigenen Schlüssel ab. Wird ein Schlüssel widerrufen, zeigt der Monitor weiter den letzten Stand und meldet unten, dass er nichts Neues bekommt.
        </span>

        {neu ? (
          <Alert
            type="success"
            showIcon={false}
            title={`Schlüssel für „${neu.bezeichnung}“ angelegt. Er steht nur jetzt hier.`}
            description={
              <div style={{ display: "grid", gap: SPACE.sm }}>
                <span>Diese zwei Zeilen kommen in die Datei <code>.env</code> des Lagemonitors, danach den Dienst neu starten:</span>
                <pre className={v.schluessel} data-testid="neuer-schluessel">{neu.zeilen}</pre>
                <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
                  <Button onClick={() => kopieren(neu.zeilen)}>Kopieren</Button>
                  <Button onClick={() => setNeu(null)}>Fertig</Button>
                </div>
              </div>
            }
          />
        ) : null}

        {liste.length === 0 ? (
          <span>Noch kein Zugang angelegt. Ohne Zugang zeigt der Monitor seine eigenen Vorgaben.</span>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: SPACE.md }} aria-label="Zugänge">
            {liste.map((z) => (
              <li key={z.id} style={{ display: "flex", gap: SPACE.md, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <strong>{z.bezeichnung}</strong>
                  <div style={SCHRIFT.neben} className={v.gedaempft}>
                    angelegt {ZEIT.format(new Date(z.angelegtAm))} von {z.angelegtVon} ·{" "}
                    {z.zuletztAbgeholtAm ? `zuletzt abgeholt ${ZEIT.format(new Date(z.zuletztAbgeholtAm))}` : "noch nie abgeholt"}
                  </div>
                </div>
                <Popconfirm
                  title={`Zugang „${z.bezeichnung}“ widerrufen?`}
                  description="Der Monitor bekommt danach keine neuen Einstellungen mehr."
                  okText="Widerrufen"
                  cancelText="Abbrechen"
                  onConfirm={() => widerrufen(z)}
                >
                  <Button loading={laeuft === z.id} aria-label={`Zugang widerrufen: ${z.bezeichnung}`}>
                    Widerrufen
                  </Button>
                </Popconfirm>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={anlegen} style={{ display: "grid", gap: SPACE.sm }}>
          <label htmlFor={id} style={SCHRIFT.neben}>
            Neuer Zugang
          </label>
          <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
            <Input
              id={id}
              value={bezeichnung}
              placeholder="zum Beispiel FüKw Uelzen"
              status={fehler ? "error" : undefined}
              style={{ flex: "1 1 220px" }}
              onChange={(e) => setBezeichnung(e.target.value)}
            />
            <Button htmlType="submit" loading={laeuft === "neu"}>
              Zugang anlegen
            </Button>
          </div>
          {fehler ? <span style={SCHRIFT.neben}>{fehler}</span> : null}
        </form>
      </div>
    </Card>
  );
}

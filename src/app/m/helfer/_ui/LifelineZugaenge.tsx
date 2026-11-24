"use client";

import { useId, useState, type FormEvent } from "react";
import { Alert, App, Button, Card, Input, Popconfirm } from "antd";
import { useRouter } from "next/navigation";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { zeitFormat } from "@/core/zeit";
import { zugangAnlegenAction, zugangWiderrufenAction } from "../_actions/verwaltung";
import type { ZugangDTO } from "../_lib/schluessel";
import s from "./helfer.module.css";

const ZEIT = zeitFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

/**
 * Die Schlüssel, mit denen Lifeline Hub Personal und Qualifikationen abholt (LLH-1194). Nach dem Anlegen stehen
 * Adresse und Schlüssel genau einmal da; beides kommt in Lifeline Hub unter Anbindungen in den Adapter
 * „Stammdaten-Abruf“. Vorbild ist `lagemonitor/_ui/Zugaenge.tsx` (eigene Kopie, keine Modulgrenze).
 */
export function LifelineZugaenge({ liste }: { liste: ZugangDTO[] }) {
  const { message } = App.useApp();
  const router = useRouter();
  const [bezeichnung, setBezeichnung] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [neu, setNeu] = useState<{ bezeichnung: string; adresse: string; schluessel: string } | null>(null);
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
        setNeu({ bezeichnung: name.trim(), adresse: `${window.location.origin}/api/stammdaten`, schluessel: r.wert.schluessel });
        router.refresh();
      })
      .catch(() => setFehler("Anlegen ist fehlgeschlagen. Bitte noch einmal versuchen."))
      .finally(() => setLaeuft(null));
  }

  function widerrufen(z: ZugangDTO): void {
    setLaeuft(z.id);
    void zugangWiderrufenAction(z.id)
      .then((r) => {
        if (!r.ok) void message.warning(r.fehler);
        else router.refresh();
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
    <Card title="Zugang für Lifeline Hub">
      <div style={{ display: "grid", gap: SPACE.lg }}>
        <span>
          Lifeline Hub holt mit einem Zugang regelmäßig die fürs Einsatztagebuch bereitgestellten Personen mit Name und
          Qualifikationen ab und legt sie dort zur Bestätigung vor.
        </span>
        {neu ? (
          <Alert
            type="success"
            showIcon={false}
            title={`Zugang „${neu.bezeichnung}“ angelegt. Der Schlüssel steht nur jetzt hier.`}
            description={
              <div style={{ display: "grid", gap: SPACE.sm }} data-testid="neuer-zugang">
                <span>Trag beides in Lifeline Hub unter Anbindungen beim Adapter „Stammdaten-Abruf“ ein:</span>
                <span>Adresse</span>
                <pre className={s.schluessel}>{neu.adresse}</pre>
                <span>Zugangsschlüssel</span>
                <pre className={s.schluessel}>{neu.schluessel}</pre>
                <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
                  <Button onClick={() => kopieren(neu.adresse)}>Adresse kopieren</Button>
                  <Button onClick={() => kopieren(neu.schluessel)}>Schlüssel kopieren</Button>
                  <Button data-testid="neuer-zugang-fertig" onClick={() => setNeu(null)}>Fertig</Button>
                </div>
              </div>
            }
          />
        ) : null}

        {liste.length === 0 ? (
          <span data-testid="keine-zugaenge">Noch kein Zugang angelegt.</span>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: SPACE.md }} aria-label="Zugänge">
            {liste.map((z) => (
              <li key={z.id} style={{ display: "flex", gap: SPACE.md, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <strong>{z.bezeichnung}</strong>
                  <div style={SCHRIFT.neben} className={s.gedaempft}>
                    angelegt {ZEIT.format(new Date(z.angelegtAm))} von {z.angelegtVon} ·{" "}
                    {z.zuletztAbgeholtAm ? `zuletzt abgeholt ${ZEIT.format(new Date(z.zuletztAbgeholtAm))}` : "noch nie abgeholt"}
                  </div>
                </div>
                <Popconfirm
                  title={`Zugang „${z.bezeichnung}“ widerrufen?`}
                  description="Lifeline Hub bekommt danach keine neuen Personaldaten mehr."
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
              placeholder="zum Beispiel Lifeline Hub"
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

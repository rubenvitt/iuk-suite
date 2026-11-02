"use client";

import { useState, type FormEvent } from "react";
import { App, Button, Card, Popconfirm, Select } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { zeitFormat } from "@/core/zeit";
import { fahrzeugAnlegenAction, fahrzeugEntfernenAction } from "../_actions/verwaltung";
import type { FahrzeugAuswahl, FahrzeugDTO } from "../_lib/fahrzeuge";
import v from "./verwaltung.module.css";

const ZEIT = zeitFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });
const ZEICHEN_PX = 48;

/**
 * Fahrzeuge, die alle Monitore als taktisches Zeichen mit Funkrufname zeigen (LGM-10). Die Position meldet der
 * Monitor im Fahrzeug mit seinem Zugang; ein Fahrzeug ohne Zugang steht erst auf der Karte, wenn es einen bekommt.
 */
export function Fahrzeuge({ liste, auswahl }: { liste: FahrzeugDTO[]; auswahl: FahrzeugAuswahl }) {
  const { message } = App.useApp();
  const [stammId, setStammId] = useState<string | null>(null);
  const [zeichen, setZeichen] = useState<string | null>(null);
  const [zugangId, setZugangId] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);

  function anlegen(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setFehler(null);
    setLaeuft("neu");
    void fahrzeugAnlegenAction({ stammId: stammId ?? "", zeichen: zeichen ?? "", zugangId })
      .then((r) => {
        if (!r.ok) {
          setFehler(r.feldFehler ? Object.values(r.feldFehler).join(" ") : r.fehler);
          return;
        }
        setStammId(null);
        setZeichen(null);
        setZugangId(null);
      })
      .catch(() => setFehler("Hinzufügen ist fehlgeschlagen. Bitte noch einmal versuchen."))
      .finally(() => setLaeuft(null));
  }

  function entfernen(f: FahrzeugDTO): void {
    setLaeuft(f.id);
    void fahrzeugEntfernenAction(f.id)
      .then((r) => {
        if (!r.ok) void message.warning(r.fehler);
      })
      .catch(() => void message.warning("Entfernen ist fehlgeschlagen. Bitte die Seite neu laden."))
      .finally(() => setLaeuft(null));
  }

  return (
    <Card title="Fahrzeuge auf der Karte">
      <div style={{ display: "grid", gap: SPACE.lg }}>
        {liste.length === 0 ? (
          <span>Noch kein Fahrzeug auf der Karte.</span>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: SPACE.md }} aria-label="Fahrzeuge">
            {liste.map((f) => {
              const name = f.funkrufname ?? "Fahrzeug fehlt in der Fahrzeugverwaltung";
              return (
                <li key={f.id} style={{ display: "flex", gap: SPACE.md, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: SPACE.md, alignItems: "center" }}>
                    {f.svg ? (
                      // eslint-disable-next-line @next/next/no-img-element -- ein Data-URI-SVG, kein Bild aus dem Netz
                      <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(f.svg)}`} alt={f.zeichenTitel} width={ZEICHEN_PX} height={ZEICHEN_PX} />
                    ) : null}
                    <div>
                      <strong>{name}</strong>
                      <div style={SCHRIFT.neben} className={v.gedaempft}>
                        {f.zeichenTitel} · {f.zugang ? `meldet über „${f.zugang}“` : "kein Zugang, meldet nicht"} ·{" "}
                        {f.gemeldetAm ? `Position von ${ZEIT.format(new Date(f.gemeldetAm))}` : "noch keine Position"}
                      </div>
                    </div>
                  </div>
                  <Popconfirm
                    title={`„${name}“ von der Karte nehmen?`}
                    description="Die letzte Position wird dabei gelöscht."
                    okText="Entfernen"
                    cancelText="Abbrechen"
                    onConfirm={() => entfernen(f)}
                  >
                    <Button loading={laeuft === f.id} aria-label={`Fahrzeug entfernen: ${name}`}>
                      Entfernen
                    </Button>
                  </Popconfirm>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={anlegen} style={{ display: "grid", gap: SPACE.sm }}>
          <span style={SCHRIFT.neben}>Neues Fahrzeug</span>
          <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
            <Select
              aria-label="Fahrzeug"
              placeholder="Fahrzeug aus der Fahrzeugverwaltung"
              value={stammId}
              onChange={setStammId}
              showSearch={{ optionFilterProp: "label" }}
              options={auswahl.stamm.map((s) => ({ value: s.id, label: s.funkrufname }))}
              notFoundContent="Kein freies Fahrzeug in der Fahrzeugverwaltung."
              style={{ flex: "1 1 220px" }}
            />
            <Select
              aria-label="Taktisches Zeichen"
              placeholder="Taktisches Zeichen"
              value={zeichen}
              onChange={setZeichen}
              showSearch={{ optionFilterProp: "label" }}
              options={auswahl.zeichen.map((z) => ({ value: z.schluessel, label: z.titel }))}
              style={{ flex: "1 1 220px" }}
            />
            <Select
              aria-label="Zugang, der die Position meldet"
              placeholder="Zugang, der die Position meldet"
              value={zugangId}
              onChange={(w) => setZugangId(w ?? null)}
              allowClear
              options={auswahl.zugaenge.map((z) => ({ value: z.id, label: z.bezeichnung }))}
              notFoundContent="Kein freier Zugang."
              style={{ flex: "1 1 220px" }}
            />
            <Button htmlType="submit" loading={laeuft === "neu"}>
              Fahrzeug hinzufügen
            </Button>
          </div>
          {fehler ? <span style={SCHRIFT.neben}>{fehler}</span> : null}
        </form>
      </div>
    </Card>
  );
}

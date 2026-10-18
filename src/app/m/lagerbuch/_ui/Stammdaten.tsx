"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Alert, Button, Card, Space } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { SCHRIFT } from "../_lib/schrift";
import { Ikone } from "./ikonen";
import s from "./verwaltung.module.css";

export type StammdatenFeld = { name: string; wert: ReactNode };

/**
 * STAMMDATEN EINES GERÄTS — LESEN ZUERST, BEARBEITEN AUSDRÜCKLICH (IDA-239).
 *
 * BZ-Gerät und Sauerstoffflasche trugen ihre Stammdaten als immer offene
 * Eingabefelder, die beim Verlassen bzw. nach 400 ms speicherten — zehn Felder
 * zwischen den Kennzahlen und der Hauptaufgabe, und ein Tippfehler in einer
 * Referenzgrenze ging ohne Rückweg durch. Jetzt: eine Liste zum Lesen,
 * „Bearbeiten" öffnet die Felder, „Speichern" schreibt, „Abbrechen" verwirft.
 * Dasselbe Muster wie die Stammdaten der Artikelschublade (IDA-235).
 *
 * Die Felder selbst und das Speichern gehören dem Aufrufer — nur Rahmen,
 * Lesemodus, Knöpfe und Meldung stehen hier.
 *
 * FALLE 24 SINNGEMÄSS: beim Umschalten verschwindet der geklickte Knopf, und
 * der Fokus fiele auf `body`. Er wird deshalb nach einem EIGENEN Umschalten
 * neu gesetzt — und nur, wenn er wirklich verloren ist, damit niemand, der
 * inzwischen woanders tippt, seine Eingabe verliert.
 */
export function Stammdaten({
  titel = "Stammdaten",
  felder,
  bearbeiten,
  onBearbeiten,
  eingaben,
  laeuft,
  onSpeichern,
  fehler,
  hinweis,
  zusatz,
}: {
  titel?: string;
  felder: StammdatenFeld[];
  bearbeiten: boolean;
  onBearbeiten: (an: boolean) => void;
  /** Die Eingabefelder im Bearbeitungsmodus. */
  eingaben: ReactNode;
  laeuft: boolean;
  onSpeichern: () => void;
  fehler: string | null;
  /** Ein Satz unter den Feldern (z. B. was eine Grenze in bar bedeutet). */
  hinweis?: ReactNode;
  /** Unter der Liste, abgesetzt: Status und Löschen. */
  zusatz?: ReactNode;
}) {
  const bearbeitenKnopf = useRef<HTMLButtonElement>(null);
  const formular = useRef<HTMLDivElement>(null);
  const umgeschaltet = useRef(false);

  useEffect(() => {
    if (!umgeschaltet.current) return;
    umgeschaltet.current = false;
    const aktiv = document.activeElement;
    const verloren = aktiv === null || aktiv === document.body || !aktiv.isConnected;
    if (!verloren) return;
    if (bearbeiten) formular.current?.querySelector<HTMLElement>("input")?.focus();
    else bearbeitenKnopf.current?.focus();
  }, [bearbeiten]);

  function umschalten(an: boolean): void {
    umgeschaltet.current = true;
    onBearbeiten(an);
  }

  return (
    <Card
      title={titel}
      extra={bearbeiten ? null : (
        <Button
          ref={bearbeitenKnopf}
          icon={<Ikone name="stift" groesse={16} />}
          onClick={() => umschalten(true)}
        >
          Bearbeiten
        </Button>
      )}
    >
      <div style={{ display: "grid", gap: SPACE.md }}>
        {bearbeiten ? (
          <form
            data-rolle="stammdaten-form"
            onSubmit={(ereignis) => {
              ereignis.preventDefault();
              onSpeichern();
            }}
            style={{ display: "grid", gap: SPACE.md }}
          >
            <div
              ref={formular}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(210px, 100%), 1fr))",
                gap: SPACE.md,
              }}
            >
              {eingaben}
            </div>
            {hinweis ? <span style={SCHRIFT.neben}>{hinweis}</span> : null}
            {fehler ? (
              <Alert type="warning" showIcon={false} title={fehler} role="alert" />
            ) : null}
            <Space wrap>
              <Button type="primary" htmlType="submit" loading={laeuft}>
                Speichern
              </Button>
              <Button disabled={laeuft} onClick={() => umschalten(false)}>
                Abbrechen
              </Button>
            </Space>
          </form>
        ) : (
          <>
            <dl className={s.stammdatenListe} data-rolle="stammdaten-liste">
              {felder.map((feld) => (
                <div key={feld.name}>
                  <dt style={SCHRIFT.feldname}>{feld.name}</dt>
                  <dd style={{ ...SCHRIFT.text, margin: 0, overflowWrap: "anywhere" }}>
                    {feld.wert}
                  </dd>
                </div>
              ))}
            </dl>
            {hinweis ? <span style={SCHRIFT.neben}>{hinweis}</span> : null}
          </>
        )}
        {zusatz ? (
          <div
            style={{
              borderBlockStart: "1px solid var(--lb-linie)",
              paddingBlockStart: SPACE.md,
            }}
          >
            {zusatz}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/** Feldname über der Eingabe — die Beschriftung umschliesst das Feld. */
export function StammdatenEingabe({ label, children }: { label: string; children: ReactNode }) {
  return (
    // 4 = SPACE.xs — enger Abstand zwischen Feldname und Eingabe.
    <label style={{ display: "grid", gap: SPACE.xs }}>
      <span style={SCHRIFT.feldname}>{label}</span>
      {children}
    </label>
  );
}

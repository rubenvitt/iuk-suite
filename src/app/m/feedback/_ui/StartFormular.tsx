"use client";

import { useActionState, useRef, useState } from "react";
import { Button, Col, Collapse, Input, Popconfirm, Row } from "antd";
import { startFeedbackAction } from "../actions";
import { computeClosesAt } from "../_lib/lifecycle";
import { FORM_START, feldFehler, feldWert } from "../_lib/formState";
import { T } from "./typo";
import { formatZeitpunkt, tagAusEingabe } from "./datum";

/**
 * DAS STARTFORMULAR (Entwurf §2.3, §4.4, §4.5).
 *
 * Client-Insel aus drei Gründen, jeder für sich hinreichend: `useActionState`
 * (der Feldfehler muss ohne Seitenwechsel ans Feld), das kontrollierte
 * Datumsfeld (die Frist unter dem Knopf wird beim Tippen neu GERECHNET, nicht
 * beschriftet) und der `Popconfirm` des Slots „nächster Dienstabend".
 *
 * Was hier NICHT passiert: Abend anlegen, Umfrage anlegen, aktivieren. Das ist
 * ein Aufruf — `startFeedbackAction` → `createAndStartSurvey`. Drei Felder statt
 * vier: `notes` hatte im Ist-Zustand keinen Leser (§2.3).
 *
 * `DatePicker` kommt bewusst nicht vor: `<Input type="date">` ist
 * server-render-fest, öffnet am Handy die native Tastatur, braucht kein
 * Locale-Bündel und ist ohne Client-JS vorbelegbar.
 */

export type StartVariante = "primaer" | "naechster";

export type StartFormularProps = {
  groupId: number;
  /** Heute in `Europe/Berlin` (`YYYY-MM-DD`), serverseitig berechnet. */
  heute: string;
  /** Teilnehmerzahl des letzten Abends — Vorbelegung, nie geraten. */
  teilnehmerVorbelegung: number | null;
  /** `group.closeAfterHours ?? DEFAULT_CLOSE_AFTER_HOURS` — nur für die Vorschau. */
  stunden: number;
  variante?: StartVariante;
};

export function StartFormular({
  groupId,
  heute,
  teilnehmerVorbelegung,
  stunden,
  variante = "primaer",
}: StartFormularProps) {
  const [state, formAction, isPending] = useActionState(startFeedbackAction, FORM_START);
  const [datum, setDatum] = useState(feldWert(state, "date", heute));
  const formular = useRef<HTMLFormElement>(null);

  const datumsFehler = feldFehler(state, "date");
  const gewaehlt = tagAusEingabe(datum);
  const beschriftung =
    variante === "primaer" ? "Feedback starten" : "Laufende beenden & neue starten";

  const felder = (
    <form action={formAction} ref={formular} className="fb-form">
      <input type="hidden" name="groupId" value={groupId} />
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}>
          <label htmlFor={`fb-date-${variante}`} style={{ ...T.kicker, display: "block" }}>
            Datum
          </label>
          <Input
            id={`fb-date-${variante}`}
            name="date"
            type="date"
            required
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            status={datumsFehler ? "error" : undefined}
            aria-invalid={datumsFehler ? true : undefined}
            aria-describedby={datumsFehler ? `fb-date-${variante}-err` : undefined}
          />
          {datumsFehler && (
            <p id={`fb-date-${variante}-err`} style={{ ...T.meta, margin: "4px 0 0" }}>
              {datumsFehler}
            </p>
          )}
        </Col>
        <Col xs={24} sm={10}>
          <label htmlFor={`fb-topic-${variante}`} style={{ ...T.kicker, display: "block" }}>
            Thema
          </label>
          <Input
            id={`fb-topic-${variante}`}
            name="topic"
            defaultValue={feldWert(state, "topic", "")}
            placeholder="z. B. Erste Hilfe Auffrischung"
          />
        </Col>
        <Col xs={12} sm={6}>
          <label htmlFor={`fb-anzahl-${variante}`} style={{ ...T.kicker, display: "block" }}>
            Teilnehmer
          </label>
          <Input
            id={`fb-anzahl-${variante}`}
            name="participantCount"
            type="number"
            min={0}
            defaultValue={feldWert(
              state,
              "participantCount",
              teilnehmerVorbelegung?.toString() ?? "",
            )}
          />
        </Col>
      </Row>

      {/*
       * Knopf und Frist untereinander, nie nebeneinander: auf 390px ist der Knopf
       * volle Breite (`fb-block-mobil`), am Laptop bleibt er so breit, wie seine
       * Beschriftung ihn macht (§2.3).
       */}
      <div
        style={{
          marginTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "flex-start",
        }}
      >
        {variante === "primaer" ? (
          <Button
            type="primary"
            htmlType="submit"
            loading={isPending}
            disabled={isPending}
            className="fb-block-mobil"
          >
            {beschriftung}
          </Button>
        ) : (
          // Zweistufig ist reine UI: `createAndStartSurvey` schließt die laufende
          // Umfrage in DERSELBEN Transaktion — es kann kein Zwischenzustand
          // entstehen, in dem zwei laufen oder keine läuft.
          <Popconfirm
            title="Laufende Umfrage beenden und neue starten?"
            description="Die laufende Umfrage wird geschlossen. Ihre Auswertung bleibt erhalten."
            okText="Beenden & starten"
            cancelText="Abbrechen"
            okButtonProps={{ loading: isPending }}
            onConfirm={() => formular.current?.requestSubmit()}
          >
            <Button
              type="primary"
              loading={isPending}
              disabled={isPending}
              className="fb-block-mobil"
            >
              {beschriftung}
            </Button>
          </Popconfirm>
        )}
        {gewaehlt && (
          <p style={{ ...T.meta, margin: 0 }}>
            Läuft dann bis {formatZeitpunkt(computeClosesAt(gewaehlt, stunden))}
          </p>
        )}
      </div>
    </form>
  );

  if (variante === "primaer") return felder;

  return (
    <Collapse
      ghost
      items={[
        {
          key: "naechster",
          label: (
            <span>
              <span style={{ ...T.body, fontWeight: 600 }}>Nächsten Dienstabend starten</span>
              <span style={{ ...T.meta, display: "block" }}>beendet die laufende Umfrage</span>
            </span>
          ),
          children: felder,
        },
      ]}
    />
  );
}

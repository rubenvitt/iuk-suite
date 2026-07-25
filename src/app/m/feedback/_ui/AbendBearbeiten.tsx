"use client";

import { useState } from "react";
import { Button, Input, Modal } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { updateEveningAction } from "../actions";
import { T } from "./typo";
import { tagInZone } from "./datum";

/**
 * DIE ZEILENBEARBEITUNG EINES DIENSTABENDS (Entwurf §2.5 „Bearbeiten", §2.3, §2.4).
 *
 * Sie liegt in einer eigenen Datei, weil sie ZWEI Aufrufer hat und die beiden
 * nicht dieselbe Zone sind:
 *
 * 1. Zone d (`Verlauf`) — der „…"-Menuepunkt „Bearbeiten" einer vergangenen Zeile.
 * 2. Zone b (`Lagekarte`) — der Textknopf „Teilnehmerzahl nachtragen" der
 *    LAUFENDEN Umfrage (§2.4, wortgenau). Ohne ihn waere genau der Hauptfall
 *    unerreichbar: `cockpitZustand.verlauf` schliesst den laufenden Abend aus
 *    (§2.2), Zone d zeigt ihn also nicht — und die Teilnehmerzahl ist der Nenner
 *    jeder Ruecklaufquote und wird typischerweise erst am Abend selbst bekannt.
 *    Nur ueber diesen Weg ist auch die Neuankerung der Frist erreichbar, die
 *    `updateEveningAction` bei einem geaenderten Datum vornimmt.
 *
 * `Lagekarte` ist eine Server Component; der Knopf traegt Zustand und muss
 * deshalb als eigene Client-Insel herueberkommen — nicht als `useState` in der
 * Karte.
 *
 * Kein `useActionState`: §4.4 nennt GENAU DREI Formulare mit Feldfehlern, und
 * dieses ist keins davon. Dasselbe Muster wie `NachtragenDialog`, inklusive des
 * Schliessens NACH der Action (`destroyOnHidden` baut das Formular sonst mitten
 * im Absenden aus).
 */

export type AbendFelder = {
  eveningId: number;
  /** Mitternacht UTC, wie `evenings.date` es speichert. */
  datum: Date;
  thema: string | null;
  /** Der Nenner der Ruecklaufquote — `null` heisst: es gibt keinen (§2.3). */
  teilnehmer: number | null;
  /** `notes` — §2.3 hat das Feld hierher verwiesen, es hat sonst keinen Leser. */
  notizen?: string | null;
};

const FELD = { display: "flex", flexDirection: "column", gap: SPACE.xs } as const;

export function AbendBearbeiten({
  abend,
  offen,
  schliessen,
}: {
  abend: AbendFelder;
  offen: boolean;
  schliessen: () => void;
}) {
  // Ueber `datum.ts`, nicht `toISOString()`: die Vorbelegung eines Datumsfelds
  // kippt damit nicht auf den Vortag (§4.5).
  const isoTag = tagInZone(abend.datum);

  return (
    <Modal
      open={offen}
      onCancel={schliessen}
      title="Dienstabend bearbeiten"
      footer={null}
      destroyOnHidden
    >
      <form
        data-testid="abend-bearbeiten"
        action={async (daten: FormData) => {
          await updateEveningAction(daten);
          schliessen();
        }}
        className="fb-form"
        style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}
      >
        <input type="hidden" name="id" value={abend.eveningId} />
        <label style={FELD}>
          <span style={T.kicker}>Datum</span>
          <Input type="date" name="date" defaultValue={isoTag} required />
          <span style={T.meta}>
            Ein anderes Datum verschiebt die Frist einer laufenden Umfrage mit.
          </span>
        </label>
        <label style={FELD}>
          <span style={T.kicker}>Thema</span>
          <Input name="topic" defaultValue={abend.thema ?? ""} placeholder="z. B. Funkübung" />
        </label>
        <label style={FELD}>
          <span style={T.kicker}>Teilnehmerzahl</span>
          <Input
            type="number"
            name="participantCount"
            min={0}
            defaultValue={abend.teilnehmer?.toString() ?? ""}
            placeholder="optional"
          />
          <span style={T.meta}>Der Nenner der Rücklaufquote — nachtragbar, nie geraten.</span>
        </label>
        <label style={FELD}>
          <span style={T.kicker}>Notizen</span>
          <Input name="notes" defaultValue={abend.notizen ?? ""} placeholder="optional" />
        </label>
        <Button type="primary" htmlType="submit">
          Speichern
        </Button>
      </form>
    </Modal>
  );
}

/**
 * „Teilnehmerzahl nachtragen" (§2.4, wortgenau) — der Weg zur Zeilenbearbeitung
 * des LAUFENDEN Abends. Ein leiser Textknopf, kein zweites Formular in der Karte:
 * die Karte haengt im Gruppenraum, waehrend die Leute noch tippen.
 */
export function TeilnehmerzahlNachtragen({ abend }: { abend: AbendFelder }) {
  const [offen, setOffen] = useState(false);

  return (
    <>
      <Button type="text" style={{ paddingInline: 0 }} onClick={() => setOffen(true)}>
        Teilnehmerzahl nachtragen
      </Button>
      <AbendBearbeiten abend={abend} offen={offen} schliessen={() => setOffen(false)} />
    </>
  );
}

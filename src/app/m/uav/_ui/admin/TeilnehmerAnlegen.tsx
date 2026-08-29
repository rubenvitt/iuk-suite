"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Alert, Button, Input } from "antd";
import { teilnehmerAnlegenAction } from "../../_actions/teilnehmer";
import { SPACE } from "@/core/theme/tokens";
import { SCHRIFT } from "@/core/theme/schrift";
import { Datumsfeld } from "./Datumsfeld";
import s from "./admin.module.css";

/**
 * Formular „Teilnehmer anlegen" (Aufgabe 15) — ruft die Server Action direkt
 * auf (kein `<form action={fn}>`, weil ein fehlgeschlagenes `parse()` sonst
 * unbehandelt bliebe) und meldet einen Fehlschlag über `Alert` statt einer
 * Absturzseite. `revalidatePath` in der Action bringt die Tabelle daneben auf
 * den neuen Stand, ohne dass diese Komponente selbst etwas invalidieren muss.
 *
 * DER VERTRAG ZUR ACTION IST UNVERAENDERT: `teilnehmerAnlegenAction` bekommt
 * weiterhin ein `FormData` mit `name` und — nur wenn gesetzt — `beginn` im
 * Format `YYYY-MM-DD`. Das Datumsfeld hat seine Bauform gewechselt
 * (`Datumsfeld.tsx`, Begründung dort), nicht seinen Wert.
 *
 * DIE ZEILE STEHT AUF DEM TELEFON UNTEREINANDER (`admin.module.css`): das rohe
 * `flex-wrap` von vorher brach zwar um, ließ die Felder dabei aber auf ihrer
 * Inhaltsbreite stehen — „Beginn" war halb so breit wie „Name", der Knopf saß
 * daneben in einer eigenen Zeile. Volle Breite untereinander ist die Vorgabe aus
 * `docs/design/README.md`.
 */
export function TeilnehmerAnlegen() {
  const [name, setName] = useState("");
  const [beginn, setBeginn] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function anlegen(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault();
    const gestutzterName = name.trim();
    if (!gestutzterName) return;
    setFehler(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("name", gestutzterName);
        if (beginn) fd.set("beginn", beginn);
        await teilnehmerAnlegenAction(fd);
        setName("");
        setBeginn("");
      } catch {
        setFehler("Teilnehmer konnte nicht angelegt werden.");
      }
    });
  }

  return (
    <>
      <form onSubmit={anlegen} className={s.formular} style={{ marginBlockEnd: SPACE.lg }}>
        <div className={s.feld}>
          <label htmlFor="tn-name" style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
            Name
          </label>
          <Input
            id="tn-name"
            value={name}
            onChange={(ereignis) => setName(ereignis.target.value)}
            placeholder="Name des Teilnehmers"
          />
        </div>
        <div className={s.feld}>
          <label htmlFor="tn-beginn" style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
            Beginn (optional)
          </label>
          <Datumsfeld id="tn-beginn" wert={beginn} aufAenderung={setBeginn} platzhalter="Tag auswählen" />
        </div>
        <Button className={s.aktion} type="primary" htmlType="submit" loading={pending} disabled={!name.trim()}>
          Teilnehmer anlegen
        </Button>
      </form>
      {/*
        * DIE MELDUNG STEHT UNTER DEM FORMULAR UND NICHT MEHR DARIN. Als letztes
        * Flex-Kind saß sie neben dem Knopf und war dort so breit wie ihr Text —
        * auf dem Telefon eine vierte umgebrochene Zeile ohne erkennbaren Bezug.
        *
        * `type="warning"` und nicht `"error"`: `colorError === colorPrimary ===
        * #c8000f` (Falle 3), ein roter Kasten läse sich hier als Primäraktion.
        */}
      {fehler ? (
        <Alert
          type="warning"
          showIcon={false}
          title={fehler}
          style={{ marginBlockEnd: SPACE.lg }}
        />
      ) : null}
    </>
  );
}

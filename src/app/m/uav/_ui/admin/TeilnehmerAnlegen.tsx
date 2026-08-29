"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Alert, Button, Input } from "antd";
import { teilnehmerAnlegenAction } from "../../_actions/teilnehmer";
import { SPACE } from "@/core/theme/tokens";
import { SCHRIFT } from "@/core/theme/schrift";

/**
 * Formular „Teilnehmer anlegen" (Aufgabe 15) — ruft die Server Action direkt
 * auf (kein `<form action={fn}>`, weil ein fehlgeschlagenes `parse()` sonst
 * unbehandelt bliebe) und meldet einen Fehlschlag über `Alert` statt einer
 * Absturzseite. `revalidatePath` in der Action bringt die Tabelle daneben auf
 * den neuen Stand, ohne dass diese Komponente selbst etwas invalidieren muss.
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
    <form
      onSubmit={anlegen}
      style={{ display: "flex", gap: SPACE.md, alignItems: "flex-end", flexWrap: "wrap", marginBlockEnd: SPACE.lg }}
    >
      <div>
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
      <div>
        <label htmlFor="tn-beginn" style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
          Beginn (optional)
        </label>
        <input id="tn-beginn" type="date" value={beginn} onChange={(ereignis) => setBeginn(ereignis.target.value)} />
      </div>
      <Button type="primary" htmlType="submit" loading={pending} disabled={!name.trim()}>
        Teilnehmer anlegen
      </Button>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
    </form>
  );
}

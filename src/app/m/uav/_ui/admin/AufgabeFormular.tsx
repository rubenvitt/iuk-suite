"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Input, InputNumber, Popconfirm, Select, Switch } from "antd";
import { aufgabeAendernAction, aufgabeAnlegenAction, aufgabeLoeschenAction } from "../../_actions/katalog";
import type { TaskDTO, Teil } from "../../_lib/typen";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/*
 * DAS AUFGABEN-FORMULAR (Aufgabe 17) — eine `"use client"`-Komponente (Falle 1:
 * `Input.TextArea`/`Select` sind Compound- bzw. Client-Zugriffe, in einer
 * Server Component wäre das ein HTTP 500). Ohne `aufgabe`-Prop legt es an,
 * mit `aufgabe` ändert (und darf löschen) es den vorhandenen Eintrag —
 * Vorbild `uav-praxis/src/admin/CatalogPage.tsx`s `TaskFormular`.
 *
 * DIE LISTENFELDER SIND TEXTAREAS, „EINE ZEILE JE EINTRAG" (Brief) — einfacher
 * als der Alt-App-Editor mit Einzelfeld-je-Eintrag, gleiches Ergebnis:
 * `zeilenAus`/`zeilenEin` sind die einzige Übersetzung zwischen dem
 * mehrzeiligen Text und `string[]`.
 */

interface FormZustand {
  teil: Teil;
  nummer: string;
  titel: string;
  lernziel: string;
  schritte: string;
  durchfuehrungshinweise: string;
  sicherheitshinweise: string;
  zielanzahlDefault: number;
  aktiv: boolean;
  bildUrl: string;
}

function zeilenEin(werte: string[]): string {
  return werte.join("\n");
}

function zeilenAus(text: string): string[] {
  return text
    .split("\n")
    .map((zeile) => zeile.trim())
    .filter(Boolean);
}

function zustandAus(aufgabe?: TaskDTO): FormZustand {
  return {
    teil: aufgabe?.teil ?? 1,
    nummer: aufgabe?.nummer ?? "",
    titel: aufgabe?.titel ?? "",
    lernziel: aufgabe?.lernziel ?? "",
    schritte: zeilenEin(aufgabe?.schritte ?? []),
    durchfuehrungshinweise: zeilenEin(aufgabe?.durchfuehrungshinweise ?? []),
    sicherheitshinweise: zeilenEin(aufgabe?.sicherheitshinweise ?? []),
    zielanzahlDefault: aufgabe?.zielanzahlDefault ?? 1,
    aktiv: aufgabe?.aktiv ?? true,
    bildUrl: aufgabe?.bildUrl ?? "",
  };
}

export function AufgabeFormular({
  aufgabe,
  onGespeichert,
  onGeloescht,
  onAbbrechen,
}: {
  /** Fehlt sie: Anlege-Modus. Vorhanden: Änderungs-Modus (mit Löschen). */
  aufgabe?: TaskDTO;
  onGespeichert: (aufgabe: TaskDTO) => void;
  onGeloescht?: (id: string) => void;
  onAbbrechen: () => void;
}) {
  const [zustand, setZustand] = useState<FormZustand>(() => zustandAus(aufgabe));
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function eingabe() {
    return {
      teil: zustand.teil,
      nummer: zustand.nummer.trim(),
      titel: zustand.titel.trim(),
      lernziel: zustand.lernziel.trim(),
      schritte: zeilenAus(zustand.schritte),
      durchfuehrungshinweise: zeilenAus(zustand.durchfuehrungshinweise),
      sicherheitshinweise: zeilenAus(zustand.sicherheitshinweise),
      zielanzahlDefault: zustand.zielanzahlDefault,
      aktiv: zustand.aktiv,
      bildUrl: zustand.bildUrl.trim() || null,
    };
  }

  function speichern(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault();
    if (!zustand.nummer.trim() || !zustand.titel.trim()) return;
    setFehler(null);
    setBusy(true);
    void (aufgabe ? aufgabeAendernAction(aufgabe.id, eingabe()) : aufgabeAnlegenAction(eingabe()))
      .then((ergebnis) => onGespeichert(ergebnis))
      .catch(() => {
        setFehler(aufgabe ? "Aufgabe konnte nicht gespeichert werden." : "Aufgabe konnte nicht angelegt werden.");
      })
      .finally(() => setBusy(false));
  }

  function loeschen(): void {
    if (!aufgabe) return;
    setFehler(null);
    setBusy(true);
    void aufgabeLoeschenAction(aufgabe.id)
      .then(() => onGeloescht?.(aufgabe.id))
      .catch(() => {
        setFehler("Aufgabe konnte nicht gelöscht werden.");
        setBusy(false);
      });
  }

  return (
    <form onSubmit={speichern} style={{ display: "grid", gap: SPACE.md }}>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}

      <div style={{ display: "flex", gap: SPACE.md, flexWrap: "wrap" }}>
        <div>
          <label htmlFor="af-teil" style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
            Teil
          </label>
          <Select
            id="af-teil"
            value={zustand.teil}
            style={{ width: 110 }}
            onChange={(wert) => setZustand({ ...zustand, teil: wert as Teil })}
            options={[
              { value: 1, label: "Teil 1" },
              { value: 2, label: "Teil 2" },
              { value: 3, label: "Teil 3" },
            ]}
          />
        </div>
        <div>
          <label htmlFor="af-nummer" style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
            Nummer
          </label>
          <Input
            id="af-nummer"
            value={zustand.nummer}
            onChange={(ereignis) => setZustand({ ...zustand, nummer: ereignis.target.value })}
            placeholder="z. B. 1.1"
          />
        </div>
        <div>
          <label htmlFor="af-ziel" style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
            Zielanzahl
          </label>
          <InputNumber
            id="af-ziel"
            min={1}
            precision={0}
            value={zustand.zielanzahlDefault}
            onChange={(wert) => setZustand({ ...zustand, zielanzahlDefault: Math.max(1, Math.floor(Number(wert) || 1)) })}
          />
        </div>
      </div>

      <div>
        <label htmlFor="af-titel" style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
          Titel
        </label>
        <Input id="af-titel" value={zustand.titel} onChange={(ereignis) => setZustand({ ...zustand, titel: ereignis.target.value })} />
      </div>

      <div>
        <label htmlFor="af-lernziel" style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
          Lernziel
        </label>
        <Input.TextArea
          id="af-lernziel"
          value={zustand.lernziel}
          onChange={(ereignis) => setZustand({ ...zustand, lernziel: ereignis.target.value })}
          autoSize={{ minRows: 2, maxRows: 4 }}
        />
      </div>

      <div>
        <label htmlFor="af-bild" style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
          Bild-URL (optional)
        </label>
        <Input
          id="af-bild"
          value={zustand.bildUrl}
          onChange={(ereignis) => setZustand({ ...zustand, bildUrl: ereignis.target.value })}
          placeholder="z. B. /illustrations/1-1.webp"
        />
      </div>

      <ListenFeld
        id="af-schritte"
        titel="Schritte"
        wert={zustand.schritte}
        onChange={(wert) => setZustand({ ...zustand, schritte: wert })}
      />
      <ListenFeld
        id="af-durchfuehrung"
        titel="Durchführungshinweise"
        wert={zustand.durchfuehrungshinweise}
        onChange={(wert) => setZustand({ ...zustand, durchfuehrungshinweise: wert })}
      />
      <ListenFeld
        id="af-sicherheit"
        titel="Sicherheitshinweise"
        wert={zustand.sicherheitshinweise}
        onChange={(wert) => setZustand({ ...zustand, sicherheitshinweise: wert })}
      />

      <label style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
        <Switch checked={zustand.aktiv} onChange={(checked) => setZustand({ ...zustand, aktiv: checked })} />
        aktiv (im Teilnehmer-Katalog sichtbar)
      </label>

      <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
        <Button
          type="primary"
          htmlType="submit"
          loading={busy}
          disabled={!zustand.nummer.trim() || !zustand.titel.trim()}
        >
          Speichern
        </Button>
        <Button onClick={onAbbrechen}>Abbrechen</Button>
        {aufgabe ? (
          <Popconfirm
            title="Aufgabe löschen?"
            description={`„${aufgabe.nummer} ${aufgabe.titel}“ wirklich löschen?`}
            okText="Löschen"
            okButtonProps={{ danger: true }}
            cancelText="Abbrechen"
            onConfirm={loeschen}
          >
            <Button danger loading={busy}>
              Löschen
            </Button>
          </Popconfirm>
        ) : null}
      </div>
    </form>
  );
}

function ListenFeld({
  id,
  titel,
  wert,
  onChange,
}: {
  id: string;
  titel: string;
  wert: string;
  onChange: (wert: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
        {titel} (eine Zeile je Eintrag)
      </label>
      <Input.TextArea id={id} value={wert} onChange={(ereignis) => onChange(ereignis.target.value)} autoSize={{ minRows: 2, maxRows: 6 }} />
    </div>
  );
}

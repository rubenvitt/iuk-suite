"use client";

import { useState, useTransition } from "react";
import { Alert, AutoComplete, Button, Checkbox, Input } from "antd";
import { bearbeiteServiceAction, createServiceAction } from "@/app/m/portal/actions";
import type { GruppenOption } from "@/app/m/portal/_lib/gruppen";
import {
  SichtbarkeitFelder,
  sichtbarkeitVollstaendig,
  type Sichtbarkeit,
} from "@/app/m/portal/admin/sichtbarkeit-felder";
import type { ServiceRow } from "@/app/m/portal/admin/service-table";

import { SPACE } from "@/core/theme/tokens";
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: SPACE.xs, minInlineSize: 0 };

/**
 * DAS EINE FORMULAR FÜR „DIENST ANLEGEN" UND „DIENST BEARBEITEN" (IDA-391): alles, was die Kachel
 * zeigt. Ohne `dienst` legt es an, mit `dienst` ändert es genau diesen. Die Kennung fragt es nicht
 * ab — `legeDienstAn` leitet sie aus dem Namen ab.
 *
 * `onSubmit` mit eigenem `FormData` statt `<form action>`: React setzt ein Formular nach einer
 * `action` zurück, und eine abgelehnte Adresse ließe dann alle Felder leer zurück.
 * Die Actions werden DIREKT importiert (Falle 9, `CLAUDE.md`; DRK-398).
 */
export function ServiceForm({
  gruppen,
  kategorien,
  gruppenNichtAbrufbar = false,
  dienst,
  onFertig,
  onAbbrechen,
}: {
  gruppen: GruppenOption[];
  kategorien: string[];
  gruppenNichtAbrufbar?: boolean;
  dienst?: ServiceRow;
  onFertig?: () => void;
  onAbbrechen?: () => void;
}) {
  const [sichtbarkeit, setSichtbarkeit] = useState<Sichtbarkeit>(
    dienst ? { isPublic: dienst.isPublic, requiredGroups: dienst.requiredGroups } : { isPublic: true, requiredGroups: [] },
  );
  const [kategorie, setKategorie] = useState(dienst?.category ?? "");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const praefix = dienst ? `svc-${dienst.id}` : "svc";

  return (
    <form
      data-testid="dienst-formular"
      aria-label={dienst ? "Dienst bearbeiten" : "Dienst anlegen"}
      onSubmit={(e) => {
        e.preventDefault();
        const daten = new FormData(e.currentTarget);
        starte(async () => {
          const ergebnis = dienst ? await bearbeiteServiceAction(daten) : await createServiceAction(daten);
          if (ergebnis.ok) {
            setFehler(null);
            onFertig?.();
          } else {
            setFehler(ergebnis.fehler);
          }
        });
      }}
      style={{ display: "flex", flexDirection: "column", gap: SPACE.md, minInlineSize: 0 }}
    >
      {dienst ? <input type="hidden" name="id" value={dienst.id} /> : null}
      {fehler ? <Alert type="error" showIcon title={fehler} /> : null}
      <label htmlFor={`${praefix}-name`} style={field}>
        Name
        <Input id={`${praefix}-name`} name="name" required defaultValue={dienst?.name} autoComplete="off" />
      </label>
      <label htmlFor={`${praefix}-url`} style={field}>
        Adresse
        <Input id={`${praefix}-url`} name="url" type="url" required defaultValue={dienst?.url} placeholder="https://" />
      </label>
      <label htmlFor={`${praefix}-beschreibung`} style={field}>
        Beschreibung
        <Input.TextArea
          id={`${praefix}-beschreibung`}
          name="description"
          defaultValue={dienst?.description}
          autoSize={{ minRows: 2, maxRows: 5 }}
        />
      </label>
      <label htmlFor={`${praefix}-kategorie`} style={field}>
        Kategorie
        {/* antds AutoComplete ist kein natives Formularfeld — der Wert geht über das versteckte Feld. */}
        <input type="hidden" name="category" value={kategorie} />
        <AutoComplete
          id={`${praefix}-kategorie`}
          value={kategorie}
          onChange={(wert) => setKategorie(wert ?? "")}
          options={kategorien.map((k) => ({ value: k }))}
          showSearch={{
            filterOption: (eingabe, option) =>
              String(option?.value ?? "").toLowerCase().includes(eingabe.toLowerCase()),
          }}
          style={{ inlineSize: "100%" }}
        />
      </label>
      <label htmlFor={`${praefix}-bild`} style={field}>
        Bildadresse
        <Input id={`${praefix}-bild`} name="iconUrl" type="url" defaultValue={dienst?.iconUrl ?? undefined} placeholder="https://" />
      </label>
      <Checkbox name="openInNewTab" defaultChecked={dienst?.openInNewTab ?? true}>
        In neuem Tab öffnen
      </Checkbox>
      {/* Nur der Ausfall wird genannt, nicht „nicht eingerichtet": ohne Key in Pocket ID (lokal, e2e)
          ist die Liste aus der Suite der Normalfall. */}
      {gruppenNichtAbrufbar ? (
        <p style={{ marginBlock: 0, color: "var(--iuk-gedaempft)" }}>
          Die Gruppen aus Pocket ID sind gerade nicht abrufbar.
        </p>
      ) : null}
      <SichtbarkeitFelder idPraefix={praefix} optionen={gruppen} wert={sichtbarkeit} onChange={setSichtbarkeit} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE.sm }}>
        <Button htmlType="submit" type="primary" loading={laeuft} disabled={!sichtbarkeitVollstaendig(sichtbarkeit)}>
          {dienst ? "Speichern" : "Anlegen"}
        </Button>
        {onAbbrechen ? <Button onClick={onAbbrechen}>Abbrechen</Button> : null}
      </div>
    </form>
  );
}

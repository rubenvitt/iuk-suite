"use client";

import { Checkbox, Select } from "antd";
import { SPACE } from "@/core/theme/tokens";
import type { GruppenOption } from "@/app/m/portal/_lib/gruppen";

export type Sichtbarkeit = { isPublic: boolean; requiredGroups: string[] };

/** Abschickbar ist, was jemand sieht: öffentlich, oder mindestens eine Gruppe. */
export function sichtbarkeitVollstaendig(wert: Sichtbarkeit): boolean {
  return wert.isPublic || wert.requiredGroups.length > 0;
}

/**
 * „Öffentlich" und die Gruppenwahl, gemeinsam fürs Anlegen und fürs Ändern.
 *
 * `mode="tags"` statt `"multiple"`: die Vorschläge kommen aus Pocket ID, und
 * fällt das Verzeichnis aus, bleibt eine Gruppe eintippbar — der Wert muss nur
 * wörtlich im `groups`-Claim stehen (`hasAnyGroup` in `core/groups`).
 *
 * Je Gruppe ein verstecktes `requiredGroups`-Feld, weil antds `Select` kein
 * natives Formularelement ist (dieselbe Bauform wie `zeitzone-form.tsx`).
 * Die Checkbox trägt kein `value`-Attribut und sendet angehakt "on" — genau das
 * liest `sichtbarkeitAusFormular`.
 */
export function SichtbarkeitFelder({
  idPraefix,
  optionen,
  wert,
  onChange,
}: {
  idPraefix: string;
  optionen: GruppenOption[];
  wert: Sichtbarkeit;
  onChange: (wert: Sichtbarkeit) => void;
}) {
  const auswahlId = `${idPraefix}-gruppen`;
  return (
    <>
      <Checkbox
        name="isPublic"
        checked={wert.isPublic}
        onChange={(e) => onChange({ ...wert, isPublic: e.target.checked })}
      >
        Öffentlich sichtbar
      </Checkbox>
      {!wert.isPublic && (
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <label htmlFor={auswahlId}>Sichtbar für Gruppen</label>
          {wert.requiredGroups.map((g) => (
            <input key={g} type="hidden" name="requiredGroups" value={g} />
          ))}
          <Select<string[]>
            id={auswahlId}
            mode="tags"
            allowClear
            value={wert.requiredGroups}
            onChange={(gruppen) => onChange({ ...wert, requiredGroups: gruppen })}
            options={optionen.map((g) => ({
              value: g.wert,
              label: g.anzeige === g.wert ? g.wert : `${g.anzeige} (${g.wert})`,
            }))}
            showSearch={{ optionFilterProp: ["label", "value"] }}
            placeholder="Gruppe wählen oder eintippen"
            status={wert.requiredGroups.length === 0 ? "warning" : undefined}
            style={{ inlineSize: "100%" }}
          />
          <span style={{ color: "var(--iuk-gedaempft)" }}>
            {wert.requiredGroups.length === 0
              ? "Ohne Gruppe sieht niemand die Kachel."
              : "Nur Mitglieder dieser Gruppen sehen die Kachel."}
          </span>
        </div>
      )}
    </>
  );
}

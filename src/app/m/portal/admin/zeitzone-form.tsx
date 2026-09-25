"use client";

import { useState } from "react";
import { Button, Select } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { setzeZeitzoneAction } from "@/app/m/portal/actions";

/**
 * Die Anzeigezone der Suite (DRK-469). Die Liste kommt vom Server
 * (`waehlbareZeitzonen()`), nicht aus dem `Intl` des Browsers: gespeichert wird
 * nur, was der Server kennt, und die Auswahl soll nichts anbieten, was er
 * ablehnt.
 *
 * Ein verstecktes Feld trägt den Wert, weil antds `Select` kein natives
 * Formularelement ist und das `<form action>` ihn sonst nicht mitschickt.
 *
 * Die Action wird DIREKT importiert, nicht als Prop durchgereicht (Falle 9,
 * `CLAUDE.md`; DRK-398).
 */
export function ZeitzoneForm({ wert, zonen }: { wert: string; zonen: string[] }) {
  const [zone, setZone] = useState(wert);
  return (
    <form action={setzeZeitzoneAction} data-testid="zeitzone-form">
      <input type="hidden" name="zeitzone" value={zone} />
      <Select
        showSearch={{ optionFilterProp: ["label", "value"] }}
        value={zone}
        onChange={setZone}
        options={zonen.map((z) => ({ value: z, label: z.replaceAll("_", " ") }))}
        aria-label="Zeitzone der Suite"
        style={{ inlineSize: "100%", maxInlineSize: 360 }}
      />
      <div>
        <Button htmlType="submit" type="primary" style={{ marginBlockStart: SPACE.md }}>
          Speichern
        </Button>
      </div>
    </form>
  );
}

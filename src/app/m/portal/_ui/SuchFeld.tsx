"use client";

import { Button, Input } from "antd";

import { HOECHSTLAENGE } from "@/core/suche";
import { SPACE } from "@/core/theme/tokens";

/**
 * Das Suchfeld der suiteweiten Suche: ein schlichtes GET-Formular auf `/suche`. Es funktioniert
 * ohne JavaScript, und der Zurück-Knopf des Browsers führt zur vorigen Suche. Eine Client-Insel
 * wie das Suchfeld in `DiensteRaster`, damit die Seite darüber eine reine Server Component ohne
 * Bedienelemente bleibt; der Zustand liegt in der Adresse, nicht hier.
 */
export function SuchFeld({ begriff }: { begriff: string }) {
  return (
    <form
      action="/suche"
      method="get"
      role="search"
      style={{ display: "flex", gap: SPACE.sm, maxInlineSize: 560 }}
    >
      <Input
        data-testid="suche-eingabe"
        type="search"
        name="q"
        defaultValue={begriff}
        maxLength={HOECHSTLAENGE}
        placeholder="Seriennummer, Funkkenner, Kennzeichen, Artikel …"
        aria-label="In allen Modulen suchen"
        autoFocus={begriff === ""}
        autoComplete="off"
      />
      <Button type="primary" htmlType="submit" data-testid="suche-los">
        Suchen
      </Button>
    </form>
  );
}

"use client";

import { Button, Input } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { setzeAnsprechpartnerAction } from "@/app/m/portal/actions";

/**
 * Der Kontakt, den der Portal-Leerzustand nennt. Freitext und bewusst kein
 * Namens-/E-Mail-Paar: was hier hilft, unterscheidet sich je Kreisverband
 * („IuK-Gruppe, iuk@…" oder eine Telefonnummer), und ein zu enges Schema
 * zwänge zu einer Angabe, die nicht stimmt.
 *
 * Die Action wird DIREKT importiert, nicht als Prop durchgereicht (Falle 9,
 * `CLAUDE.md`; DRK-398): ein Aufrufer, eine Action.
 */
export function AnsprechpartnerForm({ wert }: { wert: string | null }) {
  return (
    <form action={setzeAnsprechpartnerAction} data-testid="ansprechpartner-form">
      <Input.TextArea
        name="ansprechpartner"
        defaultValue={wert ?? ""}
        rows={2}
        placeholder="z. B. IuK-Gruppe — iuk@kreisverband.example"
        aria-label="Ansprechpartner für Zugänge"
      />
      <Button htmlType="submit" type="primary" style={{ marginBlockStart: SPACE.md }}>
        Speichern
      </Button>
    </form>
  );
}

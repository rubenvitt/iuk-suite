"use client";

import { Button, Input } from "antd";

/**
 * Der Kontakt, den der Portal-Leerzustand nennt. Freitext und bewusst kein
 * Namens-/E-Mail-Paar: was hier hilft, unterscheidet sich je Kreisverband
 * („IuK-Gruppe, iuk@…" oder eine Telefonnummer), und ein zu enges Schema
 * zwänge zu einer Angabe, die nicht stimmt.
 */
export function AnsprechpartnerForm({
  wert,
  action,
}: {
  wert: string | null;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} data-testid="ansprechpartner-form">
      <Input.TextArea
        name="ansprechpartner"
        defaultValue={wert ?? ""}
        rows={2}
        placeholder="z. B. IuK-Gruppe — iuk@kreisverband.example"
        aria-label="Ansprechpartner für Zugänge"
      />
      <Button htmlType="submit" type="primary" style={{ marginBlockStart: 12 }}>
        Speichern
      </Button>
    </form>
  );
}

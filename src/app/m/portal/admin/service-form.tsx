import { Button, Checkbox, Input } from "antd";
import { createServiceAction } from "@/app/m/portal/actions";

const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };

export function ServiceForm() {
  return (
    <form
      action={createServiceAction}
      style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480, marginTop: 16 }}
    >
      <label htmlFor="svc-slug" style={field}>
        Slug
        <Input id="svc-slug" name="slug" required />
      </label>
      <label htmlFor="svc-name" style={field}>
        Name
        <Input id="svc-name" name="name" required />
      </label>
      <label htmlFor="svc-url" style={field}>
        URL
        <Input id="svc-url" name="url" type="url" required />
      </label>
      {/* Ohne `value`-Attribut sendet ein angehakter Checkbox-Input "on" —
          genau das prüft createServiceAction (`formData.get("isPublic") === "on"`).
          Bewusst OHNE `TAP_ROW` (@/core/theme/tokens): der Portal-Admin ist ein
          Schreibtisch-Bereich, keine Einsatz-Oberflaeche, und trug auch im
          Tailwind-Bestand kein vergroessertes Tap-Ziel (`px-2 py-1`). Das steht
          hier, damit die Stelle beim naechsten Durchgang nicht als Versehen
          gilt. */}
      <Checkbox name="isPublic" defaultChecked>
        Öffentlich sichtbar
      </Checkbox>
      <Button htmlType="submit" type="primary" style={{ alignSelf: "flex-start" }}>
        Anlegen
      </Button>
    </form>
  );
}

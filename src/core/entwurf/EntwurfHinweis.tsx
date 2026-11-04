"use client";

import { Alert, Button, Space } from "antd";
import type { Entwurf } from "./useEntwurf";
import { useEntwurfMeldung } from "./useEntwurfMeldung";

/**
 * Die Statuszeile eines Entwurfs für antd-Flächen (Verwaltung, Formulare im
 * Suite-Rahmen). Module mit eigenem Markup (Lagerbuch-Helfer) nehmen
 * `useEntwurfMeldung` und zeichnen selbst.
 *
 * „Nicht gesendet" ist ein Fehlerzustand und trägt deshalb `warning` wie die übrigen Fehlerzeilen der Suite;
 * „wiederhergestellt" ist reine Information (Falle 3: Rot nur für Fehler).
 */
export function EntwurfHinweis({ entwurf, verwerfbar = true }: {
  entwurf: Entwurf<unknown>;
  /** „Verwerfen" anbieten, solange ein wiederhergestellter Entwurf ruht. */
  verwerfbar?: boolean;
}) {
  const m = useEntwurfMeldung(entwurf);
  if (!m) return null;
  const aktion = m.art === "nicht-gesendet"
    ? <Button onClick={entwurf.jetztSenden}>Jetzt senden</Button>
    : m.art === "wiederhergestellt" && verwerfbar
      ? <Button onClick={entwurf.verwerfen}>Verwerfen</Button>
      : null;
  return (
    <Alert
      role="status"
      data-rolle="entwurf-hinweis"
      data-art={m.art}
      type={m.art === "nicht-gesendet" ? "warning" : "info"}
      showIcon={false}
      title={m.text}
      action={aktion ? <Space>{aktion}</Space> : undefined}
    />
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Collapse, Input } from "antd";
import { T } from "./typo";

/**
 * DER KI-PROMPT ALS AUFKLAPPBARER ABSCHNITT DER AUSWERTUNG (Entwurf §3.2 Punkt 4).
 *
 * Vorher war er eine eigene Route (`…/evenings/{eid}/prompt`), die aus der
 * Oberfläche nur über einen Textlink erreichbar war und dieselben Zahlen ein
 * zweites Mal lud. §3.2 macht daraus einen Abschnitt DIESER Seite: wer den Prompt
 * braucht, hat die Auswertung schon offen.
 *
 * CLIENT-INSEL, und zwar zwingend (§4.13, Falle 1): `Collapse.items` mit
 * `children`, `Input.TextArea` und der Kopierknopf sind alle drei in einer Server
 * Component nicht möglich — `Input.TextArea` ist ein Compound-Zugriff (HTTP 500,
 * den `pnpm build` nicht sieht), `Collapse` bringt Zustand mit.
 *
 * ZU, nicht offen: die Seite beantwortet „wie war der Abend", nicht „gib mir
 * Text für ein Sprachmodell". Der Prompt ist ein Werkzeug für den, der danach
 * greift.
 *
 * Die Rückmeldung sitzt AM KNOPF wie bei `KopierZeile` — dieselbe Entscheidung,
 * derselbe Grund (kein Toast in der Bildschirmecke für eine Bestätigung, die man
 * am gedrückten Knopf erwartet).
 */

export type PromptBlockProps = {
  /**
   * Der fertige Prompt aus `buildAnalysisPrompt` — oder `null`, solange die
   * Umfrage läuft. Gebaut wird er in der Seite: `_lib/prompt.ts` liest Zahlen,
   * die nur der Server hat.
   */
  prompt: string | null;
};

/** 2 s wie in `KopierZeile` — ein Modul, eine Rückmeldedauer. */
const RUECKMELDUNG_MS = 2000;

export function PromptBlock({ prompt }: PromptBlockProps) {
  const [kopiert, setKopiert] = useState(false);
  const uhr = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (uhr.current) clearTimeout(uhr.current);
    },
    [],
  );

  const kopieren = async () => {
    if (prompt === null) return;
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      // Ohne Berechtigung bleibt der Text im Feld markierbar — kein Alarm.
      return;
    }
    setKopiert(true);
    if (uhr.current) clearTimeout(uhr.current);
    uhr.current = setTimeout(() => setKopiert(false), RUECKMELDUNG_MS);
  };

  return (
    <Collapse
      ghost
      items={[
        {
          key: "prompt",
          label: <span style={T.kicker}>KI-PROMPT</span>,
          /*
           * `forceRender`: antd baut den Inhalt eines geschlossenen Panels sonst
           * erst beim ersten Aufklappen. Der Prompt kommt aber vollständig vom
           * Server — ohne diese Zeile stünde er nicht im ausgelieferten HTML, und
           * wer den Abschnitt ohne JavaScript öffnet, fände ein leeres Fach.
           */
          forceRender: true,
          children:
            prompt === null ? (
              <p style={{ ...T.body, margin: 0 }}>
                Die Umfrage ist noch aktiv. Der KI-Prompt steht zur Verfügung, sobald sie
                geschlossen wurde.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Input.TextArea
                  readOnly
                  value={prompt}
                  rows={16}
                  // Mono 13 laut §3.2 Punkt 4 — die einzige Monoschrift des
                  // Moduls neben der Teilnahme-Adresse.
                  style={{ fontFamily: "monospace", fontSize: 13 }}
                />
                <div>
                  <Button onClick={kopieren} className="fb-block-mobil">
                    {kopiert ? "Kopiert ✓" : "Kopieren"}
                  </Button>
                </div>
              </div>
            ),
        },
      ]}
    />
  );
}

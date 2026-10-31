"use client";

import { useState, useTransition } from "react";
import { Button } from "antd";

import { sendeFaelligkeitenJetztAction, type JetztSendenErgebnis } from "@/app/m/portal/actions";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * „Jetzt senden" für den Suite-Betrieb (IDA-297). Die Action wird direkt importiert, nicht als Prop
 * gereicht (Falle 9). Das Ergebnis steht als Satz neben dem Knopf — kein `Alert type="error"`, das sähe
 * aus wie eine Primäraktion (Falle 3).
 */
export function FaelligkeitenJetztSenden() {
  const [ergebnis, setErgebnis] = useState<JetztSendenErgebnis | null>(null);
  const [laeuft, starte] = useTransition();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: SPACE.md }}>
      <Button
        loading={laeuft}
        data-testid="faellig-jetzt-senden"
        onClick={() => starte(async () => setErgebnis(await sendeFaelligkeitenJetztAction()))}
      >
        Jetzt senden
      </Button>
      {ergebnis && (
        <span role="status" style={{ ...SCHRIFT.text, fontWeight: ergebnis.ok ? 400 : 600 }}>
          {ergebnis.text}
        </span>
      )}
    </div>
  );
}

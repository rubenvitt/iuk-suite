"use client";

import { Input } from "antd";
import { stundenZeile, type StundenBefund } from "../../_lib/stunden";
import s from "../wartung.module.css";

/**
 * Das Feld für den Stand am Zähler (IDA-381), am Gerät und in der Prüfung. Ein Textfeld statt `InputNumber`:
 * dessen `precision` verschluckte das Komma („231,5“ → 2315). Gelesen wird mit `pruefeStundenEingabe`.
 */
export function StundenFeld({ id, label, text, setText, befund, zuletzt, warnen, onEnter }: {
  id: string;
  label: string;
  text: string;
  setText: (t: string) => void;
  befund: StundenBefund;
  zuletzt: number | null;
  /** Auch ohne Lesefehler warnen (z. B. eine Ablehnung des Servers). */
  warnen?: string | null;
  onEnter?: () => void;
}) {
  const warnung = befund.art === "ungueltig" || befund.art === "kleiner" || !!warnen;
  return (
    <>
      <Input
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        suffix="h"
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        aria-invalid={befund.art === "ungueltig" || undefined}
        status={warnung ? "warning" : undefined}
        onPressEnter={onEnter}
      />
      <div className={`${s.neben} ${s.klein}`} style={{ marginTop: 4 }} aria-live="polite" data-rolle="stunden-zeile">
        {warnen ?? stundenZeile(befund, zuletzt)}
      </div>
    </>
  );
}

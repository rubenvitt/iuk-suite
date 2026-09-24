/**
 * Eingabefeld wie `TextField` der Vorlage (`components/verwaltung/forms/TextField.jsx`): 44 px,
 * Kontur `--border-control` (3:1), Schrift 16 px. Mit `label` umschließt ein `<label>` das Feld,
 * damit der zugängliche Name ohne `id` am Eingabefeld hängt; ohne `label` braucht der Aufrufer
 * ein `aria-label`.
 */
import type { ComponentPropsWithoutRef } from "react";

interface FeldProps extends Omit<ComponentPropsWithoutRef<"input">, "value" | "onChange" | "className"> {
  label?: string;
  hilfe?: string;
  wert: string;
  beiAenderung: (wert: string) => void;
}

export function Feld({ label, hilfe, wert, beiAenderung, ...rest }: FeldProps) {
  const eingabe = (
    <span className="feld-rahmen">
      <input className="feld-eingabe" value={wert} onChange={(e) => beiAenderung(e.target.value)} {...rest} />
    </span>
  );
  const hilfeText = hilfe ? <span className="feld-hilfe">{hilfe}</span> : null;
  if (!label) {
    return (
      <div className="feld">
        {eingabe}
        {hilfeText}
      </div>
    );
  }
  return (
    <label className="feld">
      <span className="feld-label">{label}</span>
      {eingabe}
      {hilfeText}
    </label>
  );
}

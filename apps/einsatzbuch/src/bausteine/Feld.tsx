/**
 * Eingabefeld wie `TextField` der Vorlage (`components/verwaltung/forms/TextField.jsx`): 44 px,
 * Kontur `--border-control` (3:1), Schrift 16 px. Mit `label` umschließt ein `<label>` das Feld,
 * damit der zugängliche Name ohne `id` am Eingabefeld hängt; ohne `label` braucht der Aufrufer
 * ein `aria-label`. `fehler` steht unter dem Feld (wie `fehler` am `TextField` der Vorlage) und
 * markiert die Eingabe als ungültig.
 */
import type { ComponentPropsWithRef } from "react";

interface FeldProps extends Omit<ComponentPropsWithRef<"input">, "value" | "onChange" | "className"> {
  label?: string;
  hilfe?: string;
  fehler?: string;
  wert: string;
  beiAenderung: (wert: string) => void;
}

export function Feld({ label, hilfe, fehler, wert, beiAenderung, ...rest }: FeldProps) {
  const eingabe = (
    <span className={fehler ? "feld-rahmen feld-rahmen-fehler" : "feld-rahmen"}>
      <input className="feld-eingabe" value={wert} onChange={(e) => beiAenderung(e.target.value)} aria-invalid={fehler ? true : undefined} {...rest} />
    </span>
  );
  const hilfeText = (
    <>
      {hilfe ? <span className="feld-hilfe">{hilfe}</span> : null}
      {fehler ? (
        <span className="feld-fehler" role="alert">
          {fehler}
        </span>
      ) : null}
    </>
  );
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

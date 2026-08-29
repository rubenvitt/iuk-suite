"use client";

import { useState } from "react";

type Props = {
  value: number;
  onValueChange: (wert: number) => void;
  min?: number;
  id?: string;
  className?: string;
};

/**
 * Zahleneingabe, die den leeren Zwischenzustand beim Tippen erlaubt.
 *
 * Ein an `value` (number) gebundenes `<input type="number">` kann „leer" nicht
 * darstellen – jeder geleerte Stand würde sofort auf einen Zahlenwert geklemmt.
 * Deshalb hält die Komponente einen lokalen Entwurfs-String: leere/ungültige
 * Zwischenstände bleiben lokal, nach oben gemeldet werden nur Werte >= min.
 * Beim Verlassen wird die Anzeige auf den letzten gültigen `value` resynct
 * (kein Datenverlust, keine überflüssige Mutation).
 *
 * 1:1 aus uav-praxis/src/components/AnzahlFeld.tsx.
 */
export function AnzahlFeld({ value, onValueChange, min = 1, id, className }: Props) {
  const [entwurf, setEntwurf] = useState(() => String(value));
  const [letzterWert, setLetzterWert] = useState(value);

  // Externe Wert-Änderungen (Aufgabenwechsel, Reset) in die Anzeige spiegeln –
  // während des Renderings statt im Effect (React-Pattern für abgeleiteten State).
  if (value !== letzterWert) {
    setLetzterWert(value);
    setEntwurf(String(value));
  }

  return (
    <input
      id={id}
      className={className}
      type="number"
      min={min}
      inputMode="numeric"
      value={entwurf}
      onChange={(e) => {
        const roh = e.target.value;
        setEntwurf(roh);
        // Leere/ungültige Eingaben nur lokal halten – erst beim Verlassen
        // normalisieren. Nur gültige Werte >= min nach oben melden.
        const zahl = Number(roh);
        if (roh.trim() !== "" && Number.isFinite(zahl) && zahl >= min) {
          onValueChange(zahl);
        }
      }}
      onBlur={() => setEntwurf(String(value))}
    />
  );
}

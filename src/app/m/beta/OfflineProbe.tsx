"use client";

import { useState } from "react";

/**
 * Stellvertreter für die spätere QR-Generierung: rein clientseitige Berechnung
 * ohne Server-Roundtrip. Offline muss nicht nur das HTML aus dem Cache kommen,
 * sondern die Hydration durchlaufen und diese Interaktion funktionieren —
 * sonst wäre "offline" nur ein Standbild.
 */
export function OfflineProbe() {
  const [text, setText] = useState("");
  return (
    <div className="mt-4 space-y-2">
      <label className="block text-sm" htmlFor="probe">
        Eingabe
      </label>
      <input
        id="probe"
        className="border px-2 py-1"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <output data-testid="probe-output" className="block font-mono">
        {text.split("").reverse().join("")}
      </output>
    </div>
  );
}

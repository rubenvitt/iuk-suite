"use client";

import { useState } from "react";
import { Input } from "antd";

import { SPACE } from "@/core/theme/tokens";
/**
 * Stellvertreter für die spätere QR-Generierung: rein clientseitige Berechnung
 * ohne Server-Roundtrip. Offline muss nicht nur das HTML aus dem Cache kommen,
 * sondern die Hydration durchlaufen und diese Interaktion funktionieren —
 * sonst wäre "offline" nur ein Standbild.
 */
export function OfflineProbe() {
  const [text, setText] = useState("");
  return (
    <div style={{ marginTop: SPACE.lg, display: "flex", flexDirection: "column", gap: SPACE.sm }}>
      <label htmlFor="probe">Eingabe</label>
      <Input id="probe" value={text} onChange={(e) => setText(e.target.value)} />
      <output data-testid="probe-output" style={{ fontFamily: "var(--font-geist-mono), monospace" }}>
        {text.split("").reverse().join("")}
      </output>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";

import { oeffneRueckmeldung } from "@/core/rueckmeldung/flyinZustand";

/**
 * DIE PORTAL-KACHEL ALS KNOPF (IDA-214) — im Formular-Weg öffnet sie das
 * Rückmelde-Flyin, das in der Kopfzeile montiert ist.
 *
 * ⚠️ DIE KLASSE `portal-kachel-link` BLEIBT AM ÄUSSEREN ELEMENT, obwohl es kein
 * Link mehr ist: an ihr hängen Kante und Fokusabgriff aus `portal.css`, und
 * `e2e/portal.spec.ts` misst sie. Die Inline-Styles nehmen dem `<button>` nur
 * das Aussehen eines Browser-Knopfes; aussehen soll er wie die Kachel daneben.
 */
export function RueckmeldungKachelKnopf({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      data-testid="portal-feedback"
      className="portal-kachel-link"
      onClick={oeffneRueckmeldung}
      style={{
        display: "block",
        inlineSize: "100%",
        padding: 0,
        border: 0,
        background: "none",
        font: "inherit",
        color: "inherit",
        textAlign: "start",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

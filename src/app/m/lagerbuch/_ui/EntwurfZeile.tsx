"use client";

import { EntwurfHinweis } from "@/core/entwurf/EntwurfHinweis";
import type { Entwurf } from "@/core/entwurf/useEntwurf";
import { useEntwurfMeldung } from "@/core/entwurf/useEntwurfMeldung";
import { SPACE } from "@/core/theme/tokens";

/**
 * `EntwurfHinweis` über einem Verwaltungsformular — IDA-358. Der Abstand nach
 * unten steht nur, wenn die Zeile steht; ein leerer Kasten mit Rand schöbe das
 * Formular sonst bei jedem Aufbau um eine Zeile nach unten.
 */
export function EntwurfZeile({ entwurf }: { entwurf: Omit<Entwurf<unknown>, "sende"> }) {
  const meldung = useEntwurfMeldung(entwurf);
  if (!meldung) return null;
  return (
    <div style={{ marginBlockEnd: SPACE.md }}>
      <EntwurfHinweis entwurf={entwurf} />
    </div>
  );
}

import { exportierePlanAction } from "../../_actions/austausch";
import { NETZFEHLER } from "../../_lib/ergebnis";

/**
 * EXPORT ALS DATEI (`_lib/austausch.ts`): die Datei baut der Server aus dem GESPEICHERTEN Stand, der Browser legt sie
 * nur ab (Vorbild `_ui/druck/SvgHerunterladen.tsx`). Gibt `null` bei Erfolg zurück, sonst den Satz für die Meldung.
 */
export async function exportiere(planId: string): Promise<string | null> {
  const r = await exportierePlanAction(planId).catch(() => ({ ok: false as const, fehler: NETZFEHLER }));
  if (!r.ok) return r.fehler;
  const url = URL.createObjectURL(new Blob([JSON.stringify(r.datei, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = r.dateiname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return null;
}

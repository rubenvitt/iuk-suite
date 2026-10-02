"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "antd";
import { importierePlanAction } from "../_actions/austausch";
import { AUSTAUSCH_ENDUNG, AUSTAUSCH_MAX_BYTES } from "../_lib/austauschGrenzen";
import { NETZFEHLER } from "../_lib/ergebnis";

/**
 * „IMPORTIEREN" IN DER PLANLISTE (`_lib/austausch.ts`): eine `.kommplan.json` wählen, im Browser als JSON lesen, der
 * Server prüft sie wie ein Speichern und legt einen neuen privaten Plan an — danach direkt in den Editor. Die Größe
 * prüft schon der Browser: eine Server Action nimmt höchstens 1 MB, darüber käme nur ein unlesbarer Netzfehler.
 */
export function PlanImport() {
  const router = useRouter();
  const feld = useRef<HTMLInputElement>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  async function gewaehlt(e: ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    e.target.value = ""; // dieselbe Datei noch einmal wählen löst wieder `change` aus
    if (!datei) return;
    setFehler(null);
    if (datei.size > AUSTAUSCH_MAX_BYTES) { setFehler("Die Datei ist zu groß für einen Plan."); return; }
    let roh: unknown;
    try { roh = JSON.parse(await datei.text()); } catch { setFehler("Die Datei ist kein JSON und damit keine Plandatei."); return; }
    setLaeuft(true);
    const r = await importierePlanAction(roh).catch(() => ({ ok: false as const, fehler: NETZFEHLER }));
    if (r.ok) { router.push(`/p/${r.id}`); return; }
    setLaeuft(false);
    setFehler(r.fehler);
  }
  return (
    <>
      <input ref={feld} type="file" accept={`${AUSTAUSCH_ENDUNG},application/json,.json`} hidden aria-hidden="true" tabIndex={-1}
        data-import="" onChange={(e) => void gewaehlt(e)} />
      <Button onClick={() => feld.current?.click()} loading={laeuft}>Importieren</Button>
      {fehler ? <p className="kp-feldfehler" role="alert">{fehler}</p> : null}
    </>
  );
}

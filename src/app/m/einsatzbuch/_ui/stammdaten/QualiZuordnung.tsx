"use client";

import { useMemo, useState } from "react";
import { Alert, App, Button, Select } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { qualiZuordnungSpeichernAction } from "../../_actions/stammdaten";
import type { HelferPlan, HiorgQualiZeile } from "../../_lib/stammdaten/helferAbgleich";
import type { QualiRegel } from "../../_lib/stammdaten/qualiZuordnung";
import { QUALIFIKATIONEN } from "../../_lib/stammdaten/vorlage";

type Quali = (typeof QUALIFIKATIONEN)[number]["kurz"];
/** „auto“ = keine Regel, die eingebaute Zuordnung gilt; „keine“ = bewusst nicht zuordnen. */
type Wahl = "auto" | "keine" | Quali;

const wahlAus = (z: HiorgQualiZeile): Wahl => (z.regel === undefined ? "auto" : z.regel ?? "keine");

/**
 * Die einstellbare Zuordnung „HiOrg-Qualifikation → Kürzel“ (IDA-250), unter der Vorschau des
 * Helferabgleichs: Jede Qualifikation, die im Helferverzeichnis vorkommt, steht mit ihrer Zuordnung
 * da; „Automatisch“ heißt eingebaute Zuordnung. Speichern ändert nur die Regeln und lädt die Vorschau
 * neu — ans Personal geht es erst mit „Übernehmen“.
 *
 * Eine Liste statt `Kartentabelle`: die rendert beide Darstellungen ins HTML, jedes Auswahlfeld
 * stünde also doppelt da.
 */
export function QualiZuordnung({ zeilen, onGespeichert }: { zeilen: HiorgQualiZeile[]; onGespeichert: (plan: HelferPlan) => void }) {
  const { message } = App.useApp();
  const start = useMemo(() => new Map(zeilen.map((z) => [z.hiorg, wahlAus(z)])), [zeilen]);
  const [wahl, setWahl] = useState(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const geaendert = zeilen.some((z) => wahl.get(z.hiorg) !== start.get(z.hiorg));

  async function speichern(): Promise<void> {
    setFehler(null);
    setLaeuft(true);
    const regeln: QualiRegel[] = zeilen.flatMap((z) => {
      const w = wahl.get(z.hiorg) ?? "auto";
      return w === "auto" ? [] : [{ hiorg: z.hiorg, kurz: w === "keine" ? null : w }];
    });
    try {
      const e = await qualiZuordnungSpeichernAction(regeln);
      if (e.ok) {
        void message.success("Zuordnung gespeichert. Die Vorschau zeigt den neuen Stand.");
        onGespeichert(e.wert);
      } else setFehler(e.fehler);
    } catch {
      setFehler("Speichern ist fehlgeschlagen. Bitte noch einmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <section aria-labelledby="quali-zuordnung-titel" style={{ display: "grid", gap: SPACE.md }}>
      <h3 id="quali-zuordnung-titel" style={{ ...SCHRIFT.kicker, margin: 0 }}>
        Qualifikationen aus HiOrg
      </h3>
      <p style={{ margin: 0 }}>
        So werden die Qualifikationen aus dem Helferverzeichnis den Kürzeln im Einsatzbuch zugeordnet. Hat jemand mehrere,
        gilt die höchste. „Automatisch“ nimmt die eingebaute Zuordnung.
      </p>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
      {zeilen.length === 0 ? (
        <p style={{ margin: 0 }}>Im Helferverzeichnis trägt niemand eine Qualifikation.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: SPACE.sm }} data-testid="quali-zuordnung">
          {zeilen.map((z, i) => {
            const id = `quali-zuordnung-${i}`;
            return (
              <li key={z.hiorg} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: SPACE.sm }}>
                <label htmlFor={id} style={{ flex: "1 1 12rem", minWidth: 0 }}>
                  {z.hiorg}
                  {z.kurz && z.kurz !== z.hiorg ? ` (${z.kurz})` : ""}
                  <span style={{ ...SCHRIFT.neben, display: "block" }}>
                    {z.anzahl === 0 ? "bei niemandem mehr" : z.anzahl === 1 ? "1 Helfer" : `${z.anzahl} Helfer`}
                  </span>
                </label>
                <Select<Wahl>
                  id={id}
                  style={{ flex: "1 1 14rem", minWidth: 0 }}
                  value={wahl.get(z.hiorg) ?? "auto"}
                  options={[
                    { value: "auto", label: `Automatisch: ${z.eingebaut ?? "nicht zuordnen"}` },
                    ...QUALIFIKATIONEN.map((q) => ({ value: q.kurz, label: `${q.kurz} – ${q.lang}` })),
                    { value: "keine", label: "Nicht zuordnen" },
                  ]}
                  onChange={(w) => setWahl((alt) => new Map(alt).set(z.hiorg, w))}
                />
              </li>
            );
          })}
        </ul>
      )}
      <div>
        <Button disabled={!geaendert || laeuft} loading={laeuft} onClick={() => void speichern()}>
          Zuordnung speichern
        </Button>
      </div>
    </section>
  );
}

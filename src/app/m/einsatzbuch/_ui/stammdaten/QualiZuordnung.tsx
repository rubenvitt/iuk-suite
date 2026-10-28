"use client";

import { Select } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import type { HiorgQualiZeile } from "../../_lib/stammdaten/helferAbgleich";
import type { QualiRegel } from "../../_lib/stammdaten/qualiZuordnung";
import type { QualifikationDTO } from "../../_lib/stammdaten/typen";

/**
 * „auto“ = keine Regel, die eingebaute Zuordnung gilt; „keine“ = bewusst nicht zuordnen; sonst
 * `q:` und eine Kurzform — der Vorsatz hält eine Kurzform „auto“ oder „keine“ auseinander (IDA-282).
 */
export type Wahl = "auto" | "keine" | `q:${string}`;
export type Zuordnung = Map<string, Wahl>;

const wahlAus = (z: HiorgQualiZeile): Wahl => (z.regel === undefined ? "auto" : z.regel === null ? "keine" : `q:${z.regel}`);

/** Die gespeicherte Zuordnung als Ausgangsstand der Auswahl. */
export const startZuordnung = (zeilen: HiorgQualiZeile[]): Zuordnung => new Map(zeilen.map((z) => [z.hiorg, wahlAus(z)]));

export const zuordnungGeaendert = (zeilen: HiorgQualiZeile[], wahl: Zuordnung): boolean =>
  zeilen.some((z) => (wahl.get(z.hiorg) ?? "auto") !== wahlAus(z));

/** Was „Zuordnung speichern“ schickt: „Automatisch“ ist keine Regel. */
export const regelnAus = (zeilen: HiorgQualiZeile[], wahl: Zuordnung): QualiRegel[] =>
  zeilen.flatMap((z) => {
    const w = wahl.get(z.hiorg) ?? "auto";
    return w === "auto" ? [] : [{ hiorg: z.hiorg, kurz: w === "keine" ? null : w.slice(2) }];
  });

/**
 * Die einstellbare Zuordnung „HiOrg-Qualifikation → Kürzel“ (IDA-250), im Reiter neben der Vorschau
 * des Helferabgleichs: Jede Qualifikation, die im Helferverzeichnis vorkommt, steht mit ihrer
 * Zuordnung da; „Automatisch“ heißt eingebaute Zuordnung. Speichern ändert nur die Regeln und lädt
 * die Vorschau neu — ans Personal geht es erst mit „Übernehmen“.
 *
 * Gesteuert: Auswahl und Speichern führt `HelferAbgleich.tsx`, weil der Knopf in der Fußleiste der
 * Schublade steht und nicht unter einer langen Liste (IDA-283).
 *
 * Eine Liste statt `Kartentabelle`: die rendert beide Darstellungen ins HTML, jedes Auswahlfeld
 * stünde also doppelt da.
 */
export function QualiZuordnung({ zeilen, auswahl, wahl, onWahl }: {
  zeilen: HiorgQualiZeile[];
  /** Die Qualifikationen des Einsatzbuchs in Rangfolge (IDA-282). */
  auswahl: QualifikationDTO[];
  wahl: Zuordnung;
  onWahl: (wahl: Zuordnung) => void;
}) {
  return (
    <section aria-label="Qualifikationen aus HiOrg" style={{ display: "grid", gap: SPACE.md }}>
      <p style={{ margin: 0 }}>
        So werden die Qualifikationen aus dem Helferverzeichnis den Kürzeln im Einsatzbuch zugeordnet. Hat jemand mehrere,
        gilt die höchste. „Automatisch“ nimmt die eingebaute Zuordnung.
      </p>
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
                    ...auswahl.map((q) => ({ value: `q:${q.kurz}` as const, label: `${q.kurz} – ${q.lang}` })),
                    { value: "keine", label: "Nicht zuordnen" },
                  ]}
                  onChange={(w) => onWahl(new Map(wahl).set(z.hiorg, w))}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

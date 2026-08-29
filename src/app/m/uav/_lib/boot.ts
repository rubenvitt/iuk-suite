// src/app/m/uav/_lib/boot.ts
// KEIN "use client" (Falle 6) — die Datei läuft im Instrumentation-Hook, bevor
// irgendetwas rendert, und `swModus()` wird zusätzlich aus einer Server Component
// (`layout.tsx`) gelesen.

export type SwModus = "abraeumen" | "cachen";
type EnvLike = Record<string, string | undefined>;

/**
 * Welcher Service-Worker-Modus gerade gilt (Spec §5). Vorgabe `"abraeumen"` — die
 * SICHERE SEITE: eine fehlende oder verschriebene `UAV_SW_MODUS` liefert weiterhin
 * den Abräum-Worker aus, nie versehentlich den Cache-Worker vor dem geplanten
 * Umschalttermin.
 */
export function swModus(env: EnvLike = process.env): SwModus {
  return env.UAV_SW_MODUS === "cachen" ? "cachen" : "abraeumen";
}

/**
 * Die Boot-Prüfung dieses Moduls (Spec §5). WIRFT NIE — `assertHostConfig()`
 * sammelt die Meldungen ALLER Module ein und entscheidet einmal, ob daraus ein
 * Abbruch wird (`src/core/bootstrap.ts`).
 *
 * ⛔ GREIFT NUR BEI GESETZTEM `SUITE_HOST_UAV` — derselbe Schalter, der das Modul
 * einschaltet. Eine unbedingte Pflicht hieße, die Suite startet ab dem ersten
 * Image mit `uav` nicht mehr, bis `UAV_SW_MODUS` gesetzt ist, und bräche damit
 * jeden unbeteiligten Deploy im Fenster zwischen Merge und Cutover ab.
 *
 * ⛔ SIE LIEST KEINE TABELLE. Sie läuft VOR `migrateAllModules()` — bewacht durch
 * dieselbe Regel wie bei `radio`/`lagerbuch`/`files`.
 */
export async function uavBootFehler(env: EnvLike = process.env): Promise<string[]> {
  if (!env.SUITE_HOST_UAV) return [];
  const m = env.UAV_SW_MODUS;
  if (m !== "abraeumen" && m !== "cachen") {
    return [
      `UAV_SW_MODUS muss bei gesetztem SUITE_HOST_UAV "abraeumen" oder "cachen" sein (ist: ${JSON.stringify(m)}). Spec 2026-08-28 §5.`,
    ];
  }
  return [];
}

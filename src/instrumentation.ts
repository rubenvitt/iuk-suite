// Next-16-Instrumentation: register() läuft einmal beim Server-Boot, vor dem
// ersten Request. Nur im Node-Runtime ausführen; der dynamische Import hält
// better-sqlite3 aus dem Edge-Bundle, für das diese Datei ebenfalls übersetzt
// wird (Begründung im Block darunter).
//
// ⚠️ DER ZUSATZ „die Edge-Middleware (proxy.ts) darf better-sqlite3 nie laden"
// STAND HIER UND WAR ÜBERHOLT. `proxy.ts` ist in Next 16 KEINE Edge-Middleware
// mehr: „Proxy defaults to using the Node.js runtime", und die `runtime`-Option
// ist dort nicht einmal setzbar
// (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:223`).
// Der Sitzungswiderruf nutzt das aus — `core/auth/config.ts` liest über
// `core/konto/widerruf` bei jeder Anfrage SQLite, und dieser Pfad läuft durch
// `proxy.ts`. Belegt durch einen vollständigen Playwright-Lauf (217 grün); löste
// das native Binding dort nicht auf, fiele die gesamte Suite, nicht ein Test.
// Wer den alten Satz für bare Münze nimmt, hält jenen Lesevorgang für einen
// Fehler und baut die einzige Stelle aus, an der der Widerruf sofort greift.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  /*
   * Der prozessweite Netzhaken (Spec §6.4) zuerst: ein Ausfall im Boot selbst
   * soll markiert im Log stehen.
   *
   * Warum er per DYNAMISCHEM Import kommt und nicht als Funktion in dieser
   * Datei steht — gemessen, nicht vermutet: `instrumentation.ts` wird auch für
   * das EDGE-Bundle übersetzt, und der Bundler sieht `process.on`/`process.exit`
   * statisch, egal welcher Runtime-Guard davorsteht. Ein `pnpm dev` meldete
   * dann bei jedem Boot „A Node.js API is used (process.on) which is not
   * supported in the Edge Runtime" samt „Ecmascript file had an error" — der
   * Node-Pfad lief trotzdem, also ist es eine Warnung, die niemand mehr
   * zuordnet. Dasselbe Muster wie beim Bootstrap-Import darunter.
   */
  const { registriereNetzhaken } = await import("@/app/m/files/_lib/av");
  registriereNetzhaken();

  const {
    migrateAllModules,
    shouldSeed,
    seedAllModules,
    assertHostConfig,
    startBackgroundWork,
  } = await import("@/core/bootstrap");
  // Vor den Migrationen: eine kaputte Host-Konfiguration soll den Start
  // verhindern, nicht erst auffallen, wenn eine Domain das falsche Modul zeigt.
  //
  // Das `await` ist Pflicht und keine Formsache: die Boot-Prüfung des Moduls
  // `files` legt die Blob-Ablage an (Spec §5.6) und ist deshalb asynchron. Ohne
  // `await` liefe `migrateAllModules()` VOR der Prüfung, und ein Startabbruch
  // wäre nur noch eine unbehandelte Rejection, die nichts abbricht.
  await assertHostConfig();
  migrateAllModules();
  if (shouldSeed()) await seedAllModules();
  // Erst jetzt: die Hintergrundarbeiter der Module lesen Tabellen, die es vor
  // den Migrationen nicht gibt.
  startBackgroundWork();
}

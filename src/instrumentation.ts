// Next-16-Instrumentation: register() läuft einmal beim Server-Boot, vor dem
// ersten Request. Nur im Node-Runtime ausführen — die Edge-Middleware (proxy.ts)
// darf better-sqlite3 nie laden. Dynamischer Import hält das aus dem Edge-Bundle.
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

// Next-16-Instrumentation: register() läuft einmal beim Server-Boot, vor dem
// ersten Request. Nur im Node-Runtime ausführen — die Edge-Middleware (proxy.ts)
// darf better-sqlite3 nie laden. Dynamischer Import hält das aus dem Edge-Bundle.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { migrateAllModules, shouldSeed, seedAllModules } = await import("@/core/bootstrap");
  migrateAllModules();
  if (shouldSeed()) await seedAllModules();
}

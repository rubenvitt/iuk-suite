/*
 * CLI: `pnpm seed:lokal [modul ...]`   (DATA_DIR steuert das Ziel, Vorgabe ./.data)
 *
 * Legt in JEDEM datenbankgestützten Modul lokale Demodaten an — genug, dass sich
 * jede Oberfläche ohne Handarbeit ansehen lässt.
 *
 * WARUM DAS EIN EIGENES SKRIPT IST UND NICHT IN `seedAllModules()` WANDERT:
 * `shouldSeed()` (core/bootstrap.ts) ist `SUITE_SEED === "1" || NODE_ENV ===
 * "development"` — und `SUITE_SEED=1` ist der GENERALPROBEN-Schalter aus den
 * Runbooks. Der Boot-Seed ist damit gerade NICHT lokal-only, und genau darauf
 * beruhen die zwei Ausschlüsse, die in `bootstrap.ts` ausgeschrieben stehen:
 * ein geseedeter files-Abgabelink wäre in einer Generalprobe ein gültiger
 * anonymer SCHREIBzugang, und lagerbuch bekäme über `getModuleDb()` eine
 * Verbindung ohne die registrierte SQLite-Funktion `lb_falte`.
 *
 * Dieses Skript läuft nie beim Boot, sondern nur, wenn jemand es tippt. Damit
 * fallen beide Gründe weg, ohne dass die Entscheidung in `bootstrap.ts`
 * angetastet werden muss — sie gilt dort unverändert weiter.
 *
 * ZWEI EIGENSCHAFTEN, DIE JEDER SEED HIER EINHALTEN MUSS:
 * 1. IDEMPOTENT PRO ENTITÄT (nicht ein gemeinsames Gate): ein abgebrochener
 *    Lauf ergänzt sich beim nächsten Aufruf selbst, ein vollständiger legt
 *    nichts doppelt an. Vorbild und Begründung: `feedback/_lib/seed.ts`.
 * 2. ADDITIV: `.data/` enthält lokal gewachsene Daten. Kein Seed löscht oder
 *    überschreibt etwas.
 *
 * Der Aufruf muss aus dem Repo-Wurzelverzeichnis kommen: `migrateAllModules()`
 * löst seine Migrationsordner cwd-relativ auf.
 */
import { migrateAllModules } from "@/core/bootstrap";
import { getModuleDb } from "@/core/db";

import * as portalSchema from "@/app/m/portal/_db/schema";
import { seedLokalPortal } from "@/app/m/portal/_lib/seedLokal";
import * as qrSchema from "@/app/m/qr/_db/schema";
import { seedLokalQr } from "@/app/m/qr/_lib/seedLokal";
import * as feedbackSchema from "@/app/m/feedback/_db/schema";
import { seedLokalFeedback } from "@/app/m/feedback/_lib/seedLokal";
import * as filesSchema from "@/app/m/files/_db/schema";
import { seedLokalFiles } from "@/app/m/files/_lib/seedLokal";
// lagerbuch NICHT über `getModuleDb`: nur `_db/client.ts` registriert `lb_falte`
// (dort ausführlich begründet). Der Cache-Schlüssel ist derselbe, eine zweite
// Verbindung auf dieselbe WAL-Datei entsteht dadurch nicht.
import { getDb as getLagerbuchDb } from "@/app/m/lagerbuch/_db/client";
import { seedLokalLagerbuch } from "@/app/m/lagerbuch/_lib/seedLokal";
import { getDb as getAufgabenDb } from "@/app/m/aufgaben/_db/client";
import { seedLokalAufgaben } from "@/app/m/aufgaben/_lib/seedLokal";
import * as radioSchema from "@/app/m/radio/_db/schema";
import { seedLokalRadio } from "@/app/m/radio/_lib/seedLokal";

export interface SeedModul {
  key: string;
  lauf: () => Promise<string[]>;
}

export const SEED_MODULE: SeedModul[] = [
  { key: "portal", lauf: () => seedLokalPortal(getModuleDb("portal", portalSchema)) },
  { key: "qr", lauf: () => seedLokalQr(getModuleDb("qr", qrSchema)) },
  { key: "feedback", lauf: () => seedLokalFeedback(getModuleDb("feedback", feedbackSchema)) },
  { key: "files", lauf: () => seedLokalFiles(getModuleDb("files", filesSchema)) },
  { key: "lagerbuch", lauf: () => seedLokalLagerbuch(getLagerbuchDb()) },
  { key: "aufgaben", lauf: () => seedLokalAufgaben(getAufgabenDb()) },
  { key: "radio", lauf: () => seedLokalRadio(getModuleDb("radio", radioSchema)) },
];

/**
 * Der einzige Riegel, den dieses Skript braucht — und er ist bewusst hart statt
 * überstimmbar: es gibt keinen Grund, Demodaten in eine produktive Datenbank zu
 * schreiben, und ein `--force` wäre genau der Schalter, den jemand um 23 Uhr
 * beim Cutover benutzt. Wer Testdaten in einer Generalprobe braucht, zeigt
 * `DATA_DIR` auf die Wegwerf-Kopie.
 */
export function pruefeLokal(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "seed-lokal ist ein reines Entwicklungswerkzeug und läuft nicht mit NODE_ENV=production.",
    );
  }
}

/** Löst Kommandozeilen-Argumente in die zu seedenden Module auf. Ohne Argumente: alle. */
export function waehleModule(argumente: string[]): SeedModul[] {
  if (argumente.length === 0) return SEED_MODULE;
  const unbekannt = argumente.filter((a) => !SEED_MODULE.some((m) => m.key === a));
  if (unbekannt.length > 0) {
    throw new Error(
      `Unbekannte Module: ${unbekannt.join(", ")} — bekannt sind ${SEED_MODULE.map((m) => m.key).join(", ")}.`,
    );
  }
  return SEED_MODULE.filter((m) => argumente.includes(m.key));
}

export async function seedeLokal(argumente: string[] = []): Promise<string[]> {
  pruefeLokal();
  // Nicht `module` nennen: der Bezeichner ist in einer Next-Codebasis belegt
  // (`@next/next/no-assign-module-variable` bricht die CI).
  const zuSeeden = waehleModule(argumente);

  // Migrieren vor dem Schreiben: das Skript soll auch gegen ein leeres
  // DATA_DIR laufen, ohne dass vorher ein Next-Server gebootet haben muss.
  migrateAllModules();

  const protokoll: string[] = [];
  for (const m of zuSeeden) {
    protokoll.push(`\n── ${m.key} ${"─".repeat(Math.max(0, 60 - m.key.length))}`);
    for (const zeile of await m.lauf()) protokoll.push(`  ${zeile}`);
  }
  return protokoll;
}

// Nur beim direkten Aufruf ausführen, nicht beim Import aus einem Test.
if (process.argv[1]?.endsWith("seed-lokal.ts")) {
  const ziel = process.env.DATA_DIR ?? "./.data";
  console.log(`Lokale Seed-Daten → ${ziel}`);
  seedeLokal(process.argv.slice(2))
    .then((zeilen) => {
      for (const z of zeilen) console.log(z);
      console.log("\nFertig. Ein erneuter Lauf ergänzt nur Fehlendes.");
    })
    .catch((fehler: unknown) => {
      console.error(fehler instanceof Error ? fehler.message : fehler);
      process.exitCode = 1;
    });
}

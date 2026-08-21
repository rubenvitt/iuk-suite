import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openModuleDatabase, moduleDbPath, getModuleDb } from "@/core/db";
import { MODULES } from "@/core/registry";
import { validateHostConfig } from "@/core/hosts";
import { validateGroupConfig } from "@/core/groups";
import * as portalSchema from "@/app/m/portal/_db/schema";
import { seedPortal } from "@/app/m/portal/_lib/seed";
import * as qrSchema from "@/app/m/qr/_db/schema";
import { seedQr } from "@/app/m/qr/_lib/seed";
import * as feedbackSchema from "@/app/m/feedback/_db/schema";
import { seedFeedback } from "@/app/m/feedback/_lib/seed";
import { filesBootFehler, starteFilesHintergrund } from "@/app/m/files/_lib/boot";
import { lagerbuchBootFehler } from "@/app/m/lagerbuch/_lib/boot";
import { starteAufgabenScanArbeiter } from "@/app/m/aufgaben/_lib/scan";

// Module mit eigener SQLite-DB + Migrationen. Neue Module hier eintragen.
// Migrations-Pfad ist cwd-relativ: Dev = Repo-Root, Prod = /app (Dockerfile
// kopiert den Ordner an genau diesen Pfad in das standalone-Image).
export const MODULE_MIGRATIONS: { key: string; migrationsFolder: string }[] = [
  { key: "portal", migrationsFolder: "src/app/m/portal/_db/migrations" },
  { key: "qr", migrationsFolder: "src/app/m/qr/_db/migrations" },
  { key: "feedback", migrationsFolder: "src/app/m/feedback/_db/migrations" },
  // files: bewusst OHNE Schema-Import und OHNE Seed unten. Der Schema-Import
  // wäre toter Code — `migrateAllModules()` migriert schema-frei, einziger
  // Konsument der Importe ist `seedAllModules()`. Und ein Seed-Abgabelink wäre
  // in einer Generalprobe ein gültiger anonymer Schreibzugang.
  { key: "files", migrationsFolder: "src/app/m/files/_db/migrations" },
  // lagerbuch: bewusst OHNE Schema-Import und OHNE Seed unten — dieselbe Begründung
  // wie bei `files` (der Schema-Import wäre toter Code), plus ein zweiter, härterer
  // Grund: `seedAllModules()` ist die einzige core-Stelle, die
  // `getModuleDb(<key>, schema)` ruft, und eine solche Verbindung kennte die
  // registrierte SQLite-Funktion `lb_falte` NICHT (Modul-Spec §5.13.2). Die
  // Handlager-Zeile gehört ohnehin nicht hierher: sie ist eine Migrationszeile
  // (0003_handlager.sql), keine Testdatenzeile.
  { key: "lagerbuch", migrationsFolder: "src/app/m/lagerbuch/_db/migrations" },
  // aufgaben: bewusst OHNE Schema-Import und OHNE Seed unten (Betreiberentscheidung vom
  // 2026-08-13, weicht vom urspruenglichen Plan ab) — schaerfer als bei `files` und `lagerbuch`,
  // aus einem eigenen Grund: `personen` IST die Autorisierungstabelle dieses Moduls.
  // `akteurFuerSession()` loest die handelnde Person daraus auf, `rolle` entscheidet ueber
  // `/routinen` und ueber das Einstellen fuer andere, und `erstellerId`/`prueferId` jeder Aufgabe
  // zeigen auf eine `personen.id` — ein Boot-Seed legte hier also keine Testdaten an, sondern
  // benannte Rollentraeger. (Die KOORDINATION kommt seit dem 2026-08-15 nicht mehr aus dieser
  // Tabelle, sondern aus der Auth-Gruppe, `_lib/zugang.ts`s `akteurFuer` — an der Begruendung
  // gegen einen Boot-Seed aendert das nichts, der Rest der Tabelle traegt sie weiter.) Und `shouldSeed()` ist bei `SUITE_SEED=1` auch in der GENERALPROBE wahr,
  // dieselbe Linie, aus der `files` und `lagerbuch` ausgenommen sind. Das lokale Seed-Skript
  // deckt den Entwicklungsbetrieb vollstaendig ab; ein Boot-Seed waere hier Risiko ohne Gegenwert.
  { key: "aufgaben", migrationsFolder: "src/app/m/aufgaben/_db/migrations" },
  // radio: bewusst OHNE Schema-Import und OHNE Seed in `seedAllModules()`. Der
  // Schema-Import waere toter Code (`migrateAllModules()` migriert schema-frei), und der
  // Seed-Ausschluss hat denselben harten Grund wie bei `files`: `shouldSeed()` ist bei
  // `SUITE_SEED=1` auch in der GENERALPROBE wahr, und eine geseedete Zeile in
  // `zugangscodes` ist ein gueltiger ANONYMER SCHREIBZUGANG — jemand kann damit ohne
  // Anmeldung Geraete ausleihen und zurueckgeben. Das lokale Seed-Skript deckt den
  // Entwicklungsbetrieb vollstaendig ab.
  { key: "radio", migrationsFolder: "src/app/m/radio/_db/migrations" },
];

/**
 * Datenbanken, die `core` selbst führt — nicht ein Modul.
 *
 * WARUM EINE ZWEITE LISTE UND KEIN EINTRAG IN `MODULE_MIGRATIONS`: der Test der
 * lokalen Demodaten unter `scripts/` verlangt für JEDEN Eintrag dort einen
 * Seed. Für eine Widerrufstabelle gibt es keinen sinnvollen — eine geseedete
 * Zeile sperrte den Dev-Nutzer aus. Statt die Zusage „jedes Modul mit eigener
 * Datenbank hat einen Seed" aufzuweichen, bekommt `core` eine eigene Liste.
 *
 * (Der Name jener Testdatei steht hier bewusst NICHT ausgeschrieben: sie selbst
 * scannt diese Datei nach ihm und schlägt sonst fehl — der Riegel gegen einen
 * aus Bequemlichkeit an den Boot gehängten Demodaten-Lauf.)
 *
 * Das Dreieck gilt trotzdem: Migrationsordner, Eintrag hier, COPY-Zeile im
 * Dockerfile. `bootstrap.test.ts` prüft beide Listen.
 */
export const CORE_MIGRATIONS: { key: string; migrationsFolder: string }[] = [
  { key: "konto", migrationsFolder: "src/core/konto/_db/migrations" },
];

/**
 * Bricht den Boot ab, wenn `SUITE_HOST_*` nicht zu den bekannten Modulen passt
 * (Tippfehler im Variablennamen, doppelt vergebener Host, Protokoll/Port im
 * Wert). Fail fast: eine stille Fehlkonfiguration führte sonst dazu, dass eine
 * Domain auf den Portal-Fallback läuft und dort das falsche Modul zeigt.
 *
 * `async` seit dem Modul `files`: seine Boot-Prüfung 6 legt die Blob-Ablage an
 * und liest eine Probedatei zurück (Spec §5.6, §9.4) — das geht nur mit `await`.
 * Der Aufrufer MUSS awaiten; ohne das wird aus dem Startabbruch eine
 * unbehandelte Rejection, die nichts abbricht (bewacht in `bootstrap.test.ts`).
 */
export async function assertHostConfig(): Promise<void> {
  const keys = MODULES.map((m) => m.key);
  const errors = [
    ...validateHostConfig(keys),
    ...validateGroupConfig(keys),
    ...(await filesBootFehler()),
    // lagerbuch: greift nur bei gesetztem SUITE_HOST_LAGERBUCH und WIRFT NIE
    // (Spec §10.5). Ein Wurf von dort naehme portal, qr, feedback und files mit.
    ...(await lagerbuchBootFehler()),
  ];
  if (errors.length > 0) {
    throw new Error(`Ungültige Host-Konfiguration:\n  - ${errors.join("\n  - ")}`);
  }
}

// Schema-freies Migrieren: eigene Verbindung öffnen, migrieren, schließen.
// Muss vor dem ersten Request abgeschlossen sein (Instrumentation register()).
export function migrateAllModules(): void {
  for (const m of [...MODULE_MIGRATIONS, ...CORE_MIGRATIONS]) {
    const sqlite = openModuleDatabase(moduleDbPath(m.key));
    migrate(drizzle(sqlite), { migrationsFolder: m.migrationsFolder });
    sqlite.close();
  }
}

// Seed nur in Dev/CI/Generalprobe — nie in echter Prod.
export function shouldSeed(): boolean {
  return process.env.SUITE_SEED === "1" || process.env.NODE_ENV === "development";
}

/**
 * Alles, was ein Modul einmal je Prozess im Hintergrund startet — gerufen aus
 * `src/instrumentation.ts` NACH `migrateAllModules()`, weil die Arbeiter
 * Tabellen lesen.
 *
 * Bewusst getrennt von `migrateAllModules()`: ein Migrationslauf ist auch aus
 * einem Import-Skript oder einem Test sinnvoll (`scripts/import/*.ts`), ein
 * Hintergrundarbeiter dort nie.
 */
export function startBackgroundWork(): void {
  starteFilesHintergrund();
  // Wiederaufnahme liegen gebliebener `offen`-Dateien nach einem Absturz
  // (Aufgabe 18) — synchron und wirft nie, siehe `_lib/scan.ts`.
  starteAufgabenScanArbeiter();
}

export async function seedAllModules(): Promise<void> {
  await seedPortal(getModuleDb("portal", portalSchema));
  await seedQr(getModuleDb("qr", qrSchema));
  await seedFeedback(getModuleDb("feedback", feedbackSchema));
}

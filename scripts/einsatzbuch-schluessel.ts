/**
 * pnpm einsatzbuch:schluessel erzeugen [--ausgabe <ordner>]
 * pnpm einsatzbuch:schluessel wiederherstellen <notfalldatei.json>
 *
 * Läuft aus einem Checkout DESSELBEN Stands wie die laufende Suite, gegen DATA_DIR
 * (Runbook docs/runbooks/einsatzbuch-schluessel.md, Entscheidung 9 im gemeinsamen Kontext
 * der Stufe 2). Migriert NICHT: die Suite muss mit diesem Stand einmal gestartet sein.
 * Kennwort interaktiv (zweimal, verdeckt) oder aus EINSATZBUCH_NOTFALL_KENNWORT
 * (Tests/Automatisierung). Schlüsselmaterial erscheint nie in einer Log-Zeile.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { sql } from "drizzle-orm";
import { getModuleDb } from "@/core/db";
import * as schema from "@/app/m/einsatzbuch/_db/schema";
import { kekAusUmgebung, KEK_VARIABLE } from "@/app/m/einsatzbuch/_lib/schluessel/kek";
import { istNotfalldatei, notfallDruckseite } from "@/app/m/einsatzbuch/_lib/schluessel/notfall";
import { erzeugeEchtesPaar, stelleEchtesPaarWiederHer } from "@/app/m/einsatzbuch/_lib/schluessel/verwaltung";

/**
 * Verdeckte Eingabe: `readline` bietet dafür kein eigenes Flag, deshalb wird das Echo des
 * Terminals über den privaten Ausgabe-Hook unterdrückt (Standardkniff für Node-CLIs ohne
 * zusätzliche Abhängigkeit) — nur die Frage selbst erscheint, jede Taste bleibt unsichtbar.
 */
function verdeckt(frage: string): Promise<string> {
  return new Promise((ok) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
      if (s.includes(frage)) process.stdout.write(s);
    };
    rl.question(frage, (a) => {
      rl.close();
      process.stdout.write("\n");
      ok(a);
    });
  });
}

async function kennwort(zweimal: boolean): Promise<string> {
  const aus = process.env.EINSATZBUCH_NOTFALL_KENNWORT;
  if (aus) return aus;
  const a = await verdeckt("Notfall-Kennwort: ");
  if (zweimal && a !== (await verdeckt("Notfall-Kennwort wiederholen: "))) throw new Error("Die Kennwörter stimmen nicht überein.");
  return a;
}

export async function main(argv: string[]): Promise<number> {
  const [befehl, ...rest] = argv;
  const k = kekAusUmgebung();
  if (k.status !== "ok") {
    console.error(`${KEK_VARIABLE} ${k.status === "fehlt" ? "fehlt" : "ist kein 32-Byte-Wert in Base64"}. Erzeugen: openssl rand -base64 32`);
    return 2;
  }
  const db = getModuleDb("einsatzbuch", schema);
  const tabelle = db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='schluesselpaar'`);
  if (tabelle.length === 0) {
    console.error("Die Tabelle schluesselpaar fehlt. Starte die Suite mit diesem Stand einmal (sie migriert beim Start).");
    return 2;
  }

  if (befehl === "erzeugen") {
    const i = rest.indexOf("--ausgabe");
    const ordner = i >= 0 ? rest[i + 1] : process.cwd();
    const { schluesselId, notfall } = await erzeugeEchtesPaar(db, { kek: k.kek, kennwort: await kennwort(true), jetzt: new Date() });
    const json = path.join(ordner, `einsatzbuch-notfall-${schluesselId}.json`);
    const html = path.join(ordner, `einsatzbuch-notfall-${schluesselId}.html`);
    writeFileSync(json, JSON.stringify(notfall, null, 2) + "\n", { mode: 0o600 });
    writeFileSync(html, await notfallDruckseite(notfall), { mode: 0o600 });
    console.log(
      `Schlüsselpaar ${schluesselId} angelegt.\nNotfall-Sicherung: ${json}\nZum Ausdrucken:    ${html}\nBeide Dateien in den Tresor, danach von diesem Rechner löschen.`,
    );
    return 0;
  }
  if (befehl === "wiederherstellen") {
    const datei = rest[0];
    if (!datei || !existsSync(datei)) {
      console.error("Aufruf: pnpm einsatzbuch:schluessel wiederherstellen <notfalldatei.json>");
      return 2;
    }
    const notfall: unknown = JSON.parse(readFileSync(datei, "utf8"));
    if (!istNotfalldatei(notfall)) {
      console.error("Das ist keine Notfall-Sicherung des Einsatzbuchs.");
      return 2;
    }
    const r = await stelleEchtesPaarWiederHer(db, { kek: k.kek, notfall, kennwort: await kennwort(false) });
    console.log(
      r.ersetzt
        ? `Schlüsselpaar ${r.schluesselId}: privater Schlüssel mit dem aktuellen KEK neu abgelegt.`
        : `Schlüsselpaar ${r.schluesselId} wiederhergestellt.`,
    );
    return 0;
  }
  console.error("Aufruf: pnpm einsatzbuch:schluessel erzeugen [--ausgabe <ordner>] | wiederherstellen <datei>");
  return 2;
}

if (process.argv[1]?.endsWith("einsatzbuch-schluessel.ts")) {
  main(process.argv.slice(2)).then(
    (c) => process.exit(c),
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    },
  );
}

/**
 * pnpm einsatzbuch:schluessel erzeugen [--ausgabe <ordner>]
 * pnpm einsatzbuch:schluessel wiederherstellen <notfalldatei.json>
 *
 * Läuft aus einem Checkout DESSELBEN Stands wie die laufende Suite, gegen DATA_DIR
 * (Runbook docs/runbooks/einsatzbuch-schluessel.md; Plan Stufe 2, Entscheidung 9, in
 * docs/superpowers/plans/). Migriert NICHT: die Suite muss mit diesem Stand einmal gestartet sein.
 * Kennwort interaktiv (zweimal, verdeckt) oder aus EINSATZBUCH_NOTFALL_KENNWORT
 * (Tests/Automatisierung). Schlüsselmaterial erscheint nie in einer Log-Zeile.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { sql } from "drizzle-orm";
import { getModuleDb } from "@/core/db";
import * as schema from "@/app/m/einsatzbuch/_db/schema";
import { kekAusUmgebung, KEK_VARIABLE } from "@/app/m/einsatzbuch/_lib/schluessel/kek";
import { istNotfalldatei, notfallDruckseite } from "@/app/m/einsatzbuch/_lib/schluessel/notfall";
import { bereiteEchtesPaarVor, stelleEchtesPaarWiederHer } from "@/app/m/einsatzbuch/_lib/schluessel/verwaltung";
import type { Db } from "@/app/m/einsatzbuch/_lib/stammdaten/daten";

/** Schluckt jede Ausgabe. Damit gibt `readline` beim Bearbeiten der Zeile (Tastendruck,
 *  Rücktaste, `kRefreshLine` …) niemals etwas auf einem echten Kanal aus — verdeckt() schreibt
 *  die Frage selbst direkt auf `output`, bevor die Zeile beginnt. */
function stummeAusgabe(): Writable {
  return new Writable({
    write(_chunk, _enc, ok) {
      ok();
    },
  });
}

/**
 * Verdeckte Eingabe. `readline` darf hier niemals selbst gegen ein echtes Terminal schreiben:
 * ruft es intern `kRefreshLine` auf (z. B. bei einer Rücktaste mitten in der Eingabe), schreibt
 * es `prompt + this.line` in einem einzigen Aufruf — die Zeichenkette beginnt mit der Frage und
 * enthielte damit unbemerkt das bis dahin eingegebene Kennwort im Klartext auf dem Terminal
 * (DRK-471).
 *
 * Deshalb schreibt diese Funktion die Frage selbst direkt auf `output` (kein readline-Umweg),
 * und `readline` bekommt einen komplett stummen Writable als eigenen `output` — es kann also
 * gar nichts mehr echoen, weder die Frage noch eine Zeilenkorrektur. `input`/`output` sind
 * injizierbar, damit sich das Verhalten ohne echtes TTY testen lässt (`einsatzbuch-schluessel.test.ts`).
 */
export function verdeckt(
  frage: string,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<string> {
  return new Promise((ok) => {
    output.write(frage);
    const rl = createInterface({ input, output: stummeAusgabe(), terminal: true });
    rl.question("", (a) => {
      rl.close();
      output.write("\n");
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

/**
 * `db` ist injizierbar, damit `einsatzbuch-schluessel.test.ts` gegen eine Wegwerf-DB (z. B.
 * `testDb()`) laufen kann, ohne den globalen Verbindungs-Cache von `getModuleDb` zu berühren
 * (der ist pro Prozess ein Singleton je Modulschlüssel — mehrere `DATA_DIR`s in einem
 * Testlauf würden sonst dieselbe erste Verbindung wiederverwenden).
 */
export async function main(argv: string[], db?: Db): Promise<number> {
  const [befehl, ...rest] = argv;
  const k = kekAusUmgebung();
  if (k.status !== "ok") {
    console.error(`${KEK_VARIABLE} ${k.status === "fehlt" ? "fehlt" : "ist kein 32-Byte-Wert in Base64"}. Erzeugen: openssl rand -base64 32`);
    return 2;
  }

  if (befehl === "erzeugen") {
    // Aufruffehler VOR jedem Schreiben prüfen: sonst entstünde bei `--ausgabe` ohne Wert ein
    // TypeError erst mitten im Ablauf, ggf. nach dem Kennwort-Dialog (DRK-471).
    const i = rest.indexOf("--ausgabe");
    if (i >= 0 && rest[i + 1] === undefined) {
      console.error("--ausgabe braucht einen Ordner. Aufruf: pnpm einsatzbuch:schluessel erzeugen [--ausgabe <ordner>]");
      return 2;
    }
    const ordner = i >= 0 ? rest[i + 1] : process.cwd();
    // Der Ordner entsteht schon hier, VOR dem Kennwortdialog: sonst bricht ein fehlender
    // `--ausgabe`-Ordner erst NACH der (zweimaligen, verdeckten) Eingabe ab, und die Eingabe war
    // umsonst. `recursive: true` legt auch fehlende Elternordner an; Modus 0700, weil hier gleich
    // Notfall-Sicherungen mit Schlüsselmaterial hineingeschrieben werden.
    mkdirSync(ordner, { recursive: true, mode: 0o700 });

    const echtDb = db ?? getModuleDb("einsatzbuch", schema);
    const tabelle = echtDb.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='schluesselpaar'`);
    if (tabelle.length === 0) {
      console.error("Die Tabelle schluesselpaar fehlt. Starte die Suite mit diesem Stand einmal (sie migriert beim Start).");
      return 2;
    }

    // Reihenfolge ist bewusst so: erst die Sicherung auf die Platte (json + html), ERST DANACH
    // die DB-Zeile (DRK-471). Scheitert das Schreiben (volle Platte, Ordner nachträglich
    // schreibgeschützt), bricht `main()` hier ab, bevor `speichere()` je aufgerufen wurde — es
    // existiert dann kein echtes Paar ohne Sicherung.
    const { notfall, speichere } = await bereiteEchtesPaarVor(echtDb, { kennwort: await kennwort(true), jetzt: new Date() });
    const json = path.join(ordner, `einsatzbuch-notfall-${notfall.kopf.schluesselId}.json`);
    const html = path.join(ordner, `einsatzbuch-notfall-${notfall.kopf.schluesselId}.html`);
    writeFileSync(json, JSON.stringify(notfall, null, 2) + "\n", { mode: 0o600 });
    writeFileSync(html, await notfallDruckseite(notfall), { mode: 0o600 });
    const { schluesselId } = await speichere(k.kek);
    console.log(
      `Schlüsselpaar ${schluesselId} angelegt.\nNotfall-Sicherung: ${json}\nZum Ausdrucken:    ${html}\nBeide Dateien in den Tresor, danach von diesem Rechner löschen.`,
    );
    return 0;
  }
  if (befehl === "wiederherstellen") {
    const echtDb = db ?? getModuleDb("einsatzbuch", schema);
    const tabelle = echtDb.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='schluesselpaar'`);
    if (tabelle.length === 0) {
      console.error("Die Tabelle schluesselpaar fehlt. Starte die Suite mit diesem Stand einmal (sie migriert beim Start).");
      return 2;
    }
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
    const r = await stelleEchtesPaarWiederHer(echtDb, { kek: k.kek, notfall, kennwort: await kennwort(false) });
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

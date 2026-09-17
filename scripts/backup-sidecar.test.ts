import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Der Backup-Sidecar (DRK-185) ist eine STACK-Aenderung, und wie schon beim
 * clamav-Sidecar beruehrt sie kein anderes Tor: `pnpm build` liest keine
 * `compose.yaml`, `typecheck` kein Shell-Skript, E2E benutzt kein Compose, und
 * `docker compose config` ruft in diesem Repo ueberhaupt kein CI-Schritt auf. Ein
 * falscher Mount oder eine bash-Wendung im POSIX-Skript faellt damit erst in
 * Produktion auf — als „es gibt keine Sicherungen", und zwar Wochen spaeter.
 *
 * ⚠️ DREI DER PRUEFUNGEN HIER SIND QUELLTEXT-SCANS AUF DINGE, DIE SYNTAKTISCH GUELTIG
 * SIND. Das ist der Kern dieser Datei, nicht ihr Beiwerk: `10#$hh` und
 * `set -o pipefail` PARSEN in jeder Shell fehlerfrei und scheitern erst beim
 * Ausfuehren — ein `sh -n` ist dagegen blind. Beide waren waehrend der Entwicklung
 * tatsaechlich da und wurden gemessen, nicht ausgedacht:
 *
 *   * `set -o pipefail` → `set: Illegal option -o pipefail`, Exit 2 unter dash, und
 *     zwar fuer JEDE Betriebsart. Auch fuer `zustand` — der Healthcheck haette also
 *     dauerhaft rot gestanden, mit einer Meldung ueber eine Shell-Option.
 *   * `10#$hh` → `arithmetic expression: expecting EOF`, Exit 2 unter dash, bei jeder
 *     Uhrzeit. Der Zeitgeber waere nie bis zum ersten Lauf gekommen, und
 *     `restart: unless-stopped` haette daraus eine Neustartschleife gemacht: ein
 *     Stack, der laeuft, ein Dienst, der staendig neu startet, und kein Backup.
 *
 * WAS DIESE DATEI AUSDRUECKLICH NICHT PRUEFT: einen echten Lauf gegen echte
 * Datenbanken. Der verlangt `sqlite3`, `rsync` und `rclone` auf dem Laeufer — dieselbe
 * Lage und dieselbe Antwort wie bei `src/app/m/files/_lib/backup.test.ts`, die den
 * Kern `scripts/backup.sh` aus genau diesem Grund ebenfalls nur scannt. Der echte Lauf
 * ist ein Runbook-Schritt (`docs/runbooks/backup-sidecar.md`, Probelauf).
 *
 * Die Zerlegung der `compose.yaml` per Einrueckung ist aus
 * `src/app/m/files/_lib/compose.test.ts` uebernommen — ein `yaml`-Paket steht als
 * DIREKTE Abhaengigkeit nicht zur Verfuegung.
 */

const WURZEL = path.resolve(__dirname, "..");
const lies = (p: string) => readFileSync(path.join(WURZEL, p), "utf8");

const SIDECAR = path.join(WURZEL, "scripts/backup-sidecar.sh");
const sidecar = lies("scripts/backup-sidecar.sh");
const deploySh = lies("scripts/deploy.sh");
const composeZeilen = lies("compose.yaml").split("\n");
const envBeispiel = lies(".env.example");

/** Nur die Befehlszeilen — die VERBOTE muessen hierauf zielen, nicht auf den Fliesstext:
 *  das Skript BEGRUENDET in Kommentaren, warum `set -o pipefail` und `10#` falsch waeren,
 *  und ein Scan ueber die ganze Datei verboete genau die Erklaerung, die den naechsten
 *  Leser vor dem Rueckbau bewahrt. Dieselbe Trennung wie in `files/_lib/backup.test.ts`. */
const befehle = sidecar
  .split("\n")
  .filter((z) => !z.trim().startsWith("#"))
  .join("\n");

/**
 * Der Rumpf genau EINER Shell-Funktion. ⚠️ Ohne diese Eingrenzung spannen `[\s\S]*`-
 * Zusicherungen ueber Funktionsgrenzen hinweg und werden dadurch WERTLOS: gemessen, als
 * die Pruefung in `sperre_uebernehmen` durch `if true` ersetzt wurde — der Fall blieb
 * gruen, weil dasselbe `if sperre_ist_verwaist` weiter unten in `sperre_holen` steht und
 * das `rm -rf` noch weiter unten in `sperre_ablegen`. Der Regex fand beide und verband
 * sie quer durch die Datei.
 */
function funktionsrumpf(quelle: string, name: string): string {
  const start = quelle.indexOf(`${name}() {`);
  expect(start, `Funktion ${name}() steht im Skript`).toBeGreaterThan(-1);
  const ende = quelle.indexOf("\n}\n", start);
  expect(ende, `Funktion ${name}() ist geschlossen`).toBeGreaterThan(start);
  return quelle.slice(start, ende);
}

/**
 * Der QUELLTEXT genau einer Shell-Funktion, samt Kopf- und Schlusszeile. Geschnitten
 * wird aus `sidecar`, NICHT aus `befehle` — dort fehlen die Kommentarzeilen, und eine
 * Funktion mit entfernten Zeilen ist nicht mehr dieselbe. ⚠️ Einzeiler (`protokoll`,
 * `warne`) brauchen einen eigenen Zweig: `funktionsrumpf` sucht `\n}\n` und faende
 * sonst das Ende der naechsten mehrzeiligen Funktion weiter unten.
 */
function shellQuelle(name: string): string {
  const start = sidecar.indexOf(`${name}() {`);
  expect(start, `Funktion ${name}() steht im Skript`).toBeGreaterThan(-1);
  const einzeiler = sidecar.slice(start, sidecar.indexOf("\n", start));
  if (einzeiler.trimEnd().endsWith("}")) return einzeiler;
  return `${funktionsrumpf(sidecar, name)}\n}`;
}

/**
 * Funktionen aus dem Skript schneiden und ein kleines Skript damit in `sh` ausfuehren.
 * ⚠️ Das Skript selbst laesst sich nicht einlesen (`source`): es startet bei jedem
 * Aufruf seine Betriebsart. Zurueck kommt nur die AUSGABE (stdout) — `warne` schreibt
 * nach stderr, und das gehoert nicht in den gemessenen Wert.
 */
function shellSkript(funktionen: string[], rumpf: string, ...argumente: string[]): string {
  const quelle = `${funktionen.map(shellQuelle).join("\n")}\n${rumpf}`;
  return execFileSync("sh", ["-c", quelle, "sh", ...argumente], {
    encoding: "utf8",
    stdio: "pipe",
  }).trimEnd();
}

const HELFER = ["protokoll", "warne", "entnullen"];

const kurzeForm = (url: string) =>
  shellSkript(["ping_ziel_kurz"], 'ping_ziel_kurz "$1"', url);

const zahlOderVorgabe = (wert: string, vorgabe = "60") =>
  shellSkript(
    [...HELFER, "zahl_oder_vorgabe"],
    'zahl_oder_vorgabe TEST "$1" "$2"',
    wert,
    vorgabe,
  );

const geprueftUhrzeit = (uhrzeit: string) =>
  shellSkript(
    [...HELFER, "uhrzeit_pruefen"],
    'BACKUP_UHRZEIT="$1"; uhrzeit_pruefen; echo "$BACKUP_UHRZEIT"',
    uhrzeit,
  );

/** `https://<name>:<wort>@<rest>` — zusammengesetzt, damit im Quelltext kein
 *  `name:wort@host` steht (siehe den Fall zur Ping-Kuerzung). */
const mitZugang = (rest: string) => `https://${["nutzer", "passwort"].join(":")}@${rest}`;

function tiefe(zeile: string): number {
  if (zeile.trim() === "") return -1;
  return zeile.length - zeile.trimStart().length;
}

function kopfzeile(zeilen: string[], name: string, ebene: number): string | undefined {
  const praefix = " ".repeat(ebene) + name + ":";
  return zeilen.find((z) => z === praefix || z.startsWith(praefix + " "));
}

function rumpf(zeilen: string[], name: string, ebene: number): string[] {
  const kopf = kopfzeile(zeilen, name, ebene);
  if (kopf === undefined) return [];
  const raus: string[] = [];
  for (let i = zeilen.indexOf(kopf) + 1; i < zeilen.length; i++) {
    const t = tiefe(zeilen[i]);
    if (t === -1) continue;
    if (t <= ebene) break;
    raus.push(zeilen[i]);
  }
  return raus;
}

/** Listeneintraege in BEIDEN YAML-Schreibweisen (Flow `[a, b]` und Block `- a`). */
function liste(zeilen: string[], name: string, ebene: number): string[] {
  const kopf = kopfzeile(zeilen, name, ebene);
  if (kopf === undefined) return [];
  const inline = kopf.slice((" ".repeat(ebene) + name + ":").length).trim();
  if (inline.startsWith("[")) {
    return inline
      .replace(/^\[/, "")
      .replace(/\].*$/, "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");
  }
  const direkt = rumpf(zeilen, name, ebene).filter((z) => z.trim().startsWith("- "));
  if (direkt.length === 0) return [];
  const flach = Math.min(...direkt.map(tiefe));
  return direkt
    .filter((z) => tiefe(z) === flach)
    .map((z) => z.trim().slice(2).replace(/#.*$/, "").trim());
}

const services = rumpf(composeZeilen, "services", 0);
const backup = rumpf(services, "backup", 2);
const suite = rumpf(services, "suite", 2);
const backupMounts = liste(backup, "volumes", 4);
const backupSchluessel = backup.filter((z) => tiefe(z) === 4).map((z) => z.trim());

describe("compose.yaml — der Dienst `backup` existiert und haengt am richtigen Datenbestand", () => {
  it("es gibt ihn ueberhaupt", () => {
    expect(backup.length, "Service `backup` steht in compose.yaml").toBeGreaterThan(0);
  });

  it("`suite_data` liegt SCHREIBEND drin — `:ro` waere ein Backup, das nichts sichert", () => {
    // ⚠️ DIE NAHELIEGENDE „HAERTUNG" IST HIER DER FEHLER, und er ist still genug, um
    // durchzurutschen: ein Backup liest nur, also moechte man `:ro` schreiben. Die
    // Modul-Datenbanken laufen aber im WAL-Modus (`core/db/index.ts` setzt
    // `journal_mode = WAL`), und ein WAL-LESER braucht Schreibrecht auf das Verzeichnis
    // und die `-shm`-Datei. Mit `:ro` antwortet sqlite3 auf JEDE Datenbank mit „unable
    // to open database file" — das Skript braeche ab, und zwar erst nachts.
    const suiteDaten = backupMounts.filter((m) => m.startsWith("suite_data:"));
    expect(suiteDaten, "`suite_data` ist im Dienst `backup` gemountet").toHaveLength(1);
    expect(suiteDaten[0]).toBe("suite_data:/data");
    expect(suiteDaten[0].endsWith(":ro")).toBe(false);
  });

  it("`files_data` liegt NUR LESEND drin, und unter dem Pfad, den backup.sh vorbelegt", () => {
    // `$DATA_DIR/files` ist die Vorgabe in `scripts/backup.sh`. Trifft der Mountpunkt
    // sie, braucht der Sidecar kein `BLOB_DIR` — und genau diese Variable war beim
    // Host-Cron die, die man vergisst (dort musste sie
    // `/var/lib/docker/volumes/files_data/_data` lauten).
    expect(backupMounts).toContain("files_data:/data/files:ro");
  });

  it("die Sicherungen liegen in einem EIGENEN benannten Volume, nicht in `suite_data`", () => {
    // Eine Kopie im selben Eimer wie das Original ist keine: ein versehentliches
    // `docker volume rm suite_data` naehme beide mit.
    expect(backupMounts).toContain("backup_data:/backups");
    expect(rumpf(composeZeilen, "volumes", 0).join("\n")).toMatch(/^\s{2}backup_data:/m);
    // Und der Dienst muss es auch BENUTZEN — sonst schreibt backup.sh weiter nach
    // `$DATA_DIR/backups`, also mitten in die Daten, und das Volume bliebe leer.
    expect(liste(backup, "environment", 4)).toContain("BACKUP_DIR=/backups");
  });

  it("beide Skripte sind hineingereicht, und zwar unter genau dem Pfad, den der Dienst ruft", () => {
    // ⚠️ EIN AUSEINANDERLAUFEN VON MOUNT UND AUFRUF IST EINE NEUSTARTSCHLEIFE. Fehlt
    // eine der beiden Dateien auf dem Server, legt Docker an ihrer Stelle ein leeres
    // VERZEICHNIS an — „Is a directory", Container neu, und das beliebig oft.
    expect(backupMounts).toContain("./scripts/backup.sh:/opt/backup/backup.sh:ro");
    expect(backupMounts).toContain(
      "./scripts/backup-sidecar.sh:/opt/backup/backup-sidecar.sh:ro",
    );

    const gemountet = "/opt/backup/backup-sidecar.sh";
    const cmd = kopfzeile(backup, "command", 4) ?? "";
    expect(cmd, "der Dienst hat ein `command`").not.toBe("");
    expect(cmd).toContain(gemountet);
    const probe = kopfzeile(rumpf(backup, "healthcheck", 4), "test", 6) ?? "";
    expect(probe, "der Healthcheck hat ein `test`").not.toBe("");
    expect(probe).toContain(gemountet);
    // Und `backup.sh` erreicht das Skript ueber BACKUP_SKRIPT, nicht ueber seine Vorgabe.
    expect(liste(backup, "environment", 4)).toContain("BACKUP_SKRIPT=/opt/backup/backup.sh");
  });

  it("`aufgaben_data` ist NICHT gemountet — sonst ist es ein Versprechen ohne Deckung", () => {
    // `scripts/backup.sh` liest das Verzeichnis heute nicht (im README benannt, DRK-391). Ein Mount hier saehe aus, als waeren die Bildnachweise gesichert.
    // Wer die Luecke schliesst, braucht BEIDES — diese Zeile und die im Skript; dieser
    // Fall wird dann rot und ist der Ort, an dem das auffaellt.
    expect(backupMounts.filter((m) => m.includes("aufgaben_data"))).toEqual([]);
  });
});

describe("compose.yaml — der Dienst `backup` ist vom Rest des Stacks entkoppelt", () => {
  it("KEIN `depends_on`, in keine Richtung", () => {
    // ⚠️ Die Kopplung, die clamav vorfuehrt, waere hier ein Eigentor: wird der Sidecar
    // nicht healthy, startete die Suite gar nicht — ein kaputtes Backup naehme also die
    // ganze Anwendung mit. Umgekehrt braucht das Backup die Suite nicht: es arbeitet auf
    // dem Volume, und ein Lauf bei gestoppter Suite ist der sauberste Stand, den es gibt.
    expect(backupSchluessel.some((z) => z.startsWith("depends_on:"))).toBe(false);
    const suiteAbhaengig = rumpf(suite, "depends_on", 4).join("\n");
    expect(suiteAbhaengig).not.toContain("backup");
  });

  it("eigenes Netz, und es ist NICHT `internal` — der Dienst muss nach aussen", () => {
    // apk beim Start, rclone zum Ziel, curl fuer den Ping. `internal: true` (wie bei
    // `av`) waere hier genau falsch und der Fehlfall still: der Container startet, und
    // erst der erste Lauf scheitert. `proxy` waere die andere Richtung zu viel — dort
    // saehe er jeden anderen Container des Stacks.
    const netze = liste(backup, "networks", 4);
    expect(netze).toEqual(["backupnet"]);
    expect(netze).not.toContain("proxy");
    expect(netze).not.toContain("av");

    const deklariert = rumpf(composeZeilen, "networks", 0);
    expect(kopfzeile(deklariert, "backupnet", 2), "`backupnet` ist deklariert").toBeTruthy();
    expect(rumpf(deklariert, "backupnet", 2).join("\n")).not.toMatch(/internal:\s*true/);
  });

  it("`stop_grace_period` laesst einen laufenden Lauf fertig werden", () => {
    // ⚠️ GEMESSEN, NICHT VERMUTET: eine POSIX-Shell schiebt ihre Signalfallen auf, solange
    // ein KIND im Vordergrund laeuft — dash und bash gleich, ein SIGTERM nach 2s feuerte
    // erst nach 12s, als das Kind fertig war. Mit Dockers Vorgabe von 10s kommt der
    // Container waehrend eines Laufs (Minuten) gar nicht dazu, sich zu beenden: es folgt
    // SIGKILL, die Sperre bleibt stehen, und im Backup-Volume liegt ein abgeschnittenes
    // Tarball, das wie ein fertiges aussieht.
    //
    // Gewartet wird BEWUSST, statt das Signal weiterzureichen: ein `tar` mitten im
    // Schreiben abzubrechen erzeugt genau die halbe Datei, die man vermeiden will.
    const frist = kopfzeile(backup, "stop_grace_period", 4) ?? "";
    expect(frist, "der Dienst setzt `stop_grace_period`").not.toBe("");
    expect(frist).toMatch(/\$\{SUITE_BACKUP_STOP_GRACE:-[^}]+\}/);
  });

  it("Image und `start_period` sind Variablen MIT Vorbelegung (`:-`)", () => {
    // Ohne den Doppelpunkt setzt Compose eine nicht gesetzte Variable auf den LEEREN
    // String, und ein leerer `image:`-Wert laesst `docker compose config` scheitern —
    // dieselbe Falle, die bei `suite` und `clamav` bereits ausgeschrieben steht.
    const bild = kopfzeile(backup, "image", 4) ?? "";
    expect(bild).toMatch(/\$\{SUITE_BACKUP_IMAGE:-[^}]+\}/);
    const frist = kopfzeile(rumpf(backup, "healthcheck", 4), "start_period", 6) ?? "";
    expect(frist).toMatch(/\$\{SUITE_BACKUP_START_PERIOD:-[^}]+\}/);
  });

  it("er laeuft unter DERSELBEN Kennung wie die Suite", () => {
    // Der Vorlauf braucht root fuer `apk`, gibt die Rechte aber ab, bevor er eine
    // Datenbank anfasst. Liest root zuerst, gehoert ein neu angelegtes `*.db-shm`
    // danach root — und die Suite kommt an ihre eigene Datenbank nicht mehr heran.
    expect(liste(backup, "environment", 4)).toContain("SUITE_USER=${SUITE_USER:-1001:1001}");
  });
});

describe("scripts/backup-sidecar.sh — POSIX, nicht bash", () => {
  it("ist syntaktisch gueltig", () => {
    // `sh -n` ist auf dem CI-Laeufer (ubuntu) dash und damit streng; auf einem Mac ist
    // `/bin/sh` bash im sh-Modus und deutlich nachsichtiger. Die Last dieser Suite
    // traegt deshalb der Scan unten, nicht dieser Fall.
    expect(() => execFileSync("sh", ["-n", SIDECAR], { stdio: "pipe" })).not.toThrow();
  });

  it("kein `set -o pipefail` — dash kennt es nicht, und der Fehlfall ist Exit 2", () => {
    // ⚠️ SYNTAKTISCH GUELTIG, ZUR LAUFZEIT TOEDLICH: `sh -n` sieht das nicht. Gemessen
    // unter dash: `set: Illegal option -o pipefail`, Exit 2 — fuer JEDE Betriebsart,
    // also auch fuer `zustand`, den der Healthcheck ruft.
    expect(befehle).not.toContain("pipefail");
  });

  it("kein `10#` — der bash-Praefix fuer Dezimalzahlen ist kein POSIX", () => {
    // ⚠️ DIESELBE KLASSE, UND DER TEURERE FALL. `date +%H` liefert `09`, das eine Shell
    // als OKTAL liest; der naheliegende Ausweg `10#$hh` ist bash. Gemessen unter dash:
    // `arithmetic expression: expecting EOF`, Exit 2 — bei JEDER Uhrzeit, nicht nur bei
    // 08 und 09. Mit `restart: unless-stopped` ist das eine Neustartschleife statt eines
    // Backups. Der Ersatz ist `${x#0}` und steht in `ohne_null()`.
    expect(befehle).not.toContain("10#");
    expect(sidecar).toContain("ohne_null()");
  });

  it("ein Unsinnswert laesst das GANZE Skript weiterlaufen, nicht nur den Helfer", () => {
    // ⚠️ DIESER FALL EXISTIERT, WEIL DER FALL DARUNTER ES NICHT KONNTE. Er schneidet den
    // Helfer samt `protokoll`/`warne` aus und fuehrt ihn aus — die Reihenfolge stimmt
    // dabei IMMER, auch wenn sie im Skript falsch ist. Genau das war sie: die beiden
    // Einzeiler standen bei den Signalfallen, also UNTER der Konfiguration, die sie ruft.
    // Eine Shell-Funktion gibt es aber erst, wenn ihre Definition gelaufen ist.
    //
    // GEMESSEN am ganzen Skript, mit einem Tippfehler in der `.env`:
    //
    //   BACKUP_HERZSCHLAG_SEKUNDEN=60   → exit=1  (der erwartete Healthcheck-Ausgang)
    //   BACKUP_HERZSCHLAG_SEKUNDEN=abc  → exit=127, „warne: not found"
    //
    // Also das Gegenteil dessen, wofuer der Rueckfall gebaut wurde: kein „es gilt die
    // Vorgabe", sondern ein Dienst, der gar nicht hochkommt — mit
    // `restart: unless-stopped` eine Neustartschleife —, und ein Healthcheck, der mit
    // derselben Meldung stirbt.
    const kladde = mkdtempSync(path.join(os.tmpdir(), "backup-sidecar-"));
    try {
      const lauf = (wert: string) => {
        const p = spawnSync("sh", [SIDECAR, "zustand"], {
          encoding: "utf8",
          env: { ...process.env, BACKUP_DIR: kladde, BACKUP_HERZSCHLAG_SEKUNDEN: wert },
        });
        return { code: p.status, aus: `${p.stdout}${p.stderr}` };
      };
      const gut = lauf("60");
      const unsinn = lauf("abc");
      // ⚠️ DIE ZUSICHERUNG IST NICHT „exit 0": `zustand` faellt hier zu Recht mit 1 aus
      // (kein Lauf, kein Startvermerk). Sie ist: der Unsinnswert aendert am AUSGANG
      // nichts und nur die Meldung kommt dazu.
      expect(unsinn.code, "kein 127 — die Funktionen sind definiert").not.toBe(127);
      expect(unsinn.aus).not.toMatch(/not found/);
      expect(unsinn.code, "derselbe Ausgang wie mit gueltigem Wert").toBe(gut.code);
      expect(unsinn.aus, "und der Rueckfall wird gemeldet").toMatch(
        /BACKUP_HERZSCHLAG_SEKUNDEN="abc" ist keine Zahl/,
      );
      expect(gut.aus, "ohne Unsinn steht die Warnung NICHT da").not.toMatch(/ist keine Zahl/);
    } finally {
      rmSync(kladde, { recursive: true, force: true });
    }
    // Dazu der billige Riegel, der die Ursache benennt: die Protokollzeilen stehen VOR
    // der ersten Konfigurationszeile, die sie brauchen kann.
    expect(befehle.indexOf("protokoll() {")).toBeGreaterThan(-1);
    expect(befehle.indexOf("warne() {")).toBeGreaterThan(-1);
    expect(befehle.indexOf("zahl_oder_vorgabe ")).toBeGreaterThan(befehle.indexOf("warne() {"));
    expect(befehle.indexOf("warne() {")).toBeGreaterThan(befehle.indexOf("protokoll() {"));
  });

  it("eine Zahl der Konfiguration ist eine Zahl, bevor irgendetwas damit rechnet", () => {
    // ⚠️ `entnullen` ALLEIN REICHT NICHT: es macht aus `08` eine `8` und laesst `abc`
    // unveraendert durch. In `sperre_ist_verwaist` landen beide in Arithmetik, und dort
    // geht es auf ZWEI gegenlaeufige Arten schief — beide gemessen:
    //
    //   dash  BACKUP_HERZSCHLAG_SEKUNDEN=abc  → `Illegal number: abc`, EXIT 2
    //   bash  BACKUP_HERZSCHLAG_SEKUNDEN=abc  → laeuft durch, rechnet 0
    //
    // Die erste Haelfte toetet den Prozess, BEVOR er auf die Sperre warten oder sie
    // uebernehmen kann. Die zweite ist stiller und schlimmer: mit 0 faellt die
    // Untergrenze weg, die eine LEBENDE Sperre schuetzt. GEMESSEN unter bash mit
    // `BACKUP_SPERRE_ALTER_STUNDEN=abc`: eine 5 SEKUNDEN alte Sperre galt als verwaist.
    //
    //   bash, ALTER=6    HERZSCHLAG=abc, Sperre 5s alt → nicht verwaist
    //   bash, ALTER=abc  HERZSCHLAG=abc, Sperre 5s alt → VERWAIST
    for (const [wert, erwartet] of [
      ["60", "60"],
      ["08", "8"],
      ["010", "10"],
      ["0", "0"],
      ["abc", "60"],
      ["aus", "60"],
      ["", "60"],
      ["3 4", "60"],
    ] as const) {
      expect(zahlOderVorgabe(wert), `"${wert}" ergibt eine Zahl`).toBe(erwartet);
    }
    // ⚠️ Geprueft wird an der QUELLE, nicht an den Rechenstellen — dieselbe Entscheidung
    // wie bei `entnullen`, und aus demselben Grund: die naechste Rechenstelle haette es
    // sonst wieder vergessen.
    for (const v of [
      "BACKUP_FRIST_STUNDEN",
      "BACKUP_SPERRE_FRIST_MINUTEN",
      "BACKUP_SPERRE_ALTER_STUNDEN",
      "BACKUP_HERZSCHLAG_SEKUNDEN",
    ]) {
      const zeile = befehle.split("\n").find((z) => z.startsWith(`${v}=`));
      expect(zeile, `${v} wird geprueft`).toMatch(/zahl_oder_vorgabe /);
    }
    // ⚠️ UND NICHT FUER DIE BEIDEN KEEP-WERTE: dort ist `aus` ein gueltiger Wert
    // („nie etwas loeschen"), den diese Pruefung zur Vorgabezahl machen wuerde — also
    // ausgerechnet zu „doch loeschen". Beide pruefen selbst, bevor sie rechnen.
    const keepZeile = befehle.split("\n").find((z) => z.startsWith("BACKUP_RCLONE_KEEP="));
    expect(keepZeile).not.toMatch(/zahl_oder_vorgabe /);
    expect(funktionsrumpf(befehle, "lokal_rotieren")).not.toMatch(/zahl_oder_vorgabe /);
    // Der Rueckfall ist laut, nicht still — und `warne` schreibt nach stderr, sonst
    // stuende die Meldung IM Wert.
    expect(funktionsrumpf(befehle, "zahl_oder_vorgabe")).toMatch(/warne /);
    expect(befehle).toMatch(/warne\(\) \{ protokoll "WARNUNG: \$\*" >&2; \}/);
  });

  it("eine unsinnige BACKUP_UHRZEIT laeuft nicht still zur falschen Zeit", () => {
    // ⚠️ DIE RECHNUNG NIMMT JEDE ZAHL UND NORMALISIERT SIE KLAGLOS. GEMESSEN:
    //
    //   03:60 → Lauf um 04:00 Uhr   (eine Minute zu viel verschiebt um eine halbe Stunde)
    //   25:00 → Ziel jenseits des Tages
    //   99:00 → 356400s: der Rest faellt nie unter den Tagesabstand, und der Sprung um
    //           Mitternacht wird als „Zielzeit ueberschritten" gelesen
    //
    // Nichts davon faellt auf: kein Tor, kein roter Healthcheck, nur ein Backup zur
    // falschen Zeit. Nach der Pruefung faellt jeder dieser Werte auf 03:30 zurueck, LAUT.
    //
    // ⚠️ UND EIN ZWEITER DOPPELPUNKT KAM DURCH, weil `hh` alles vor dem ERSTEN nimmt und
    // `mm` alles nach dem LETZTEN. GEMESSEN: `03:30:45` → hh=03, mm=45, also ein Lauf um
    // 03:45 — beide Teile sind Ziffern, die Bereichspruefung ist zufrieden, und die
    // Warnung bleibt aus. Eine Sekunde anzuhaengen ist die naheliegendste Fehleingabe.
    for (const [uhrzeit, erwartet] of [
      ["03:30", "03:30"],
      ["3:5", "3:5"],
      ["03:60", "03:30"],
      ["25:00", "03:30"],
      ["03:30:45", "03:30"],
      ["abc", "03:30"],
      ["0330", "03:30"],
    ] as const) {
      expect(geprueftUhrzeit(uhrzeit), `"${uhrzeit}"`).toBe(erwartet);
    }
    const rumpfU = funktionsrumpf(befehle, "uhrzeit_pruefen");
    expect(rumpfU).toMatch(/-gt 23/);
    expect(rumpfU).toMatch(/-gt 59/);
    expect(rumpfU).toMatch(/\*:\*:\*\)/);
    expect(rumpfU).toMatch(/BACKUP_UHRZEIT="03:30"/);
    // ⚠️ Ein Rueckfall auf die Vorgabe, kein Abbruch: ein Dienst, der wegen eines
    // Tippfehlers GAR NICHT sichert, waere schlechter als einer, der zur Vorgabezeit
    // sichert und es sagt.
    expect(rumpfU).toMatch(/warne /);
    expect(rumpfU, "kein exit").not.toMatch(/exit [0-9]/);
    // Gerufen wird sie, bevor der Zeitgeber das erste Mal rechnet.
    // ⚠️ ERST DIE EXISTENZ, DANN DIE REIHENFOLGE — und das ist hier kein Zierrat: als
    // die Zusicherung nur `indexOf(a) < indexOf(b)` lautete, ueberlebte die Mutation
    // „Aufruf ganz entfernt" GRUEN, weil `indexOf` dann -1 liefert und -1 kleiner als
    // jeder Index ist. Dieselbe Sorte wertloser Zusicherung wie in Fund 12.
    const rumpfS = funktionsrumpf(befehle, "schleife");
    const geprueft = rumpfS.indexOf("uhrzeit_pruefen");
    const gerechnet = rumpfS.indexOf("sekunden_bis_uhrzeit");
    expect(geprueft, "`schleife` ruft uhrzeit_pruefen").toBeGreaterThan(-1);
    expect(gerechnet, "`schleife` rechnet die Restzeit").toBeGreaterThan(-1);
    expect(geprueft, "und prueft VOR der ersten Rechnung").toBeLessThan(gerechnet);
  });

  it("die Uhr wird in EINER Ablesung gelesen, nicht in dreien", () => {
    // ⚠️ DREI `date`-AUFRUFE KOENNEN EINEN WECHSEL UMSPANNEN, und dann setzt sich die
    // Uhrzeit aus Feldern VERSCHIEDENER Zeitpunkte zusammen. Nachgerechnet mit einer
    // Attrappe, die zwischen dem ersten und dem zweiten Aufruf von 03:59:59 auf
    // 04:00:00 rollt: abgelesen wurden 03:00:00 — eine Stunde rueckwaerts.
    //
    // ⚠️ DAS SYMPTOM KOMMT EINE RUNDE SPAETER UND SIEHT NACH ETWAS ANDEREM AUS. Der Rest
    // faellt zuerst nur (84601 → 1800); beim naechsten, korrekten Ablesen springt er
    // wieder hoch (1800 → 84570), und GENAU DIESER SPRUNG ist das Zeichen, an dem die
    // Schleife „Zielzeit ueberschritten" erkennt. Nachgespielt mit der Schleifenlogik:
    //
    //   neu=1800  <= rest=84601 → rest=1800
    //   neu=84570 >  rest=1800  → rest=0 → LAUF WIRD AUSGELOEST
    //
    // Also ein volles Backup Stunden vor der Zeit, ohne dass irgendwo etwas rot wird.
    const rumpfS = funktionsrumpf(befehle, "sekunden_bis_uhrzeit");
    const aufrufe = rumpfS.match(/\$\(date /g) ?? [];
    expect(aufrufe, "genau eine Ablesung der Uhr").toHaveLength(1);
    expect(rumpfS).toMatch(/date '\+%H %M %S'/);
    // Zerlegt wird mit Parametererweiterung — `cut` waere ein zweiter Prozess je Feld,
    // ohne dass es etwas besser machte.
    expect(rumpfS).toMatch(/uhr_rest="\$\{uhr#\* \}"/);
  });

  it("fuehrende Nullen werden entfernt, BEVOR irgendetwas damit rechnet", () => {
    // ⚠️ DIESELBE FALLE WIE `10#$hh`, NUR AN DEN ZAHLEN DER KONFIGURATION — und sie hat
    // ZWEI Gesichter, beide unter dash gemessen:
    //
    //   BACKUP_KEEP=08  → `arithmetic expression: expecting EOF`, Exit 2. Eine 8 oder 9
    //                     hinter der Null ist keine gueltige Oktalziffer. Trifft MITTEN
    //                     im Lauf, nach dem Hochladen: kein Stand, kein Ping.
    //   BACKUP_KEEP=010 → rechnet 8, gemeint waren 10. STILL. Wer zehn Generationen
    //                     aufbewahren wollte, hat acht — und nichts sagt es ihm.
    //
    // Das zweite ist das teurere, und der gemeldete Fund nennt nur das erste.
    // Gegengemessen an `backup.sh` mit BACKUP_KEEP=010 und zwoelf Generationen: vorher
    // blieben 8, jetzt 10.
    //
    // ⚠️ NORMALISIERT WIRD EINMAL AN DER QUELLE, nicht an jeder Rechenstelle — es gibt
    // fuenf davon im Skript, und die naechste haette die Pruefung sonst wieder vergessen.
    expect(befehle).toMatch(/entnullen\(\) \{/);
    for (const v of [
      "BACKUP_RCLONE_KEEP",
      "BACKUP_FRIST_STUNDEN",
      "BACKUP_SPERRE_FRIST_MINUTEN",
      "BACKUP_SPERRE_ALTER_STUNDEN",
      "BACKUP_HERZSCHLAG_SEKUNDEN",
    ]) {
      const zeile = befehle.split("\n").find((z) => z.startsWith(`${v}=`));
      expect(zeile, `${v} wird belegt`).toBeTruthy();
      // ⚠️ Entweder direkt oder ueber `zahl_oder_vorgabe`, das seinerseits entnullt.
      // Der Unterschied liegt darin, ob `aus` ein gueltiger Wert ist: BACKUP_RCLONE_KEEP
      // muss ihn durchlassen, die vier Zeitwerte nicht (eigener Fall weiter unten).
      expect(zeile, `${v} wird dabei entnullt`).toMatch(/entnullen |zahl_oder_vorgabe /);
    }
    // Auch der Wert, den `lokal_rotieren` aus der Umgebung nimmt.
    expect(funktionsrumpf(befehle, "lokal_rotieren")).toMatch(
      /keep="\$\(entnullen "\$\{BACKUP_KEEP:-7\}"\)"/,
    );
    // ⚠️ Nicht-Zahlen muessen unveraendert durchgehen — `aus` ist ein gueltiger Wert fuer
    // BACKUP_RCLONE_KEEP, und `drei` soll weiterhin dort auffallen, wo geprueft wird.
    const rumpfE = funktionsrumpf(befehle, "entnullen");
    expect(rumpfE).toMatch(/\$\{#w\}" -gt 1/);
    expect(rumpfE).toMatch(/\$\{w#0\}" != "\$w"/);
  });

  it("kein `PIPESTATUS` und kein `[[` — beides bash", () => {
    expect(befehle).not.toContain("PIPESTATUS");
    expect(befehle).not.toContain("[[");
  });

  it("gibt die root-Rechte ab, bevor eine Datenbank angefasst wird", () => {
    // Der Vorlauf braucht root nur fuer `apk` und das `chown` des frischen Volumes.
    // Bliebe er root, legte er `*.db-shm` als root an und sperrte die Suite aus.
    const i = sidecar.split("\n").findIndex((z) => z.includes("su-exec"));
    expect(i, "der Vorlauf wechselt per su-exec den Nutzer").toBeGreaterThan(-1);
    expect(sidecar).toContain('exec su-exec "$NUTZER" "$@"');
    // Und das frische Volume gehoert vorher uebereignet — sonst kann der gewechselte
    // Nutzer dort keine einzige Datei anlegen (leeres Volume erbt `root:root` vom
    // Mountpunkt des Images, und `/backups` gibt es in `alpine` nicht).
    expect(sidecar).toContain('chown "$NUTZER" "$BACKUP_DIR"');
  });

  it("`$DATA_DIR` gehoert der Suite, auch wenn DIESER Container es zuerst mountet", () => {
    // ⚠️ DER DIENST HAT BEWUSST KEIN `depends_on` — also kann er beim ersten `up -d`
    // derjenige sein, der `suite_data` als ERSTER mountet. Dann erbt das leere Volume
    // Eigentuemer und Modus seines Mountpunkts aus DIESEM Image, und `alpine` hat kein
    // `/data`: root:root. Die Suite laeuft danach als uid 1001 und kann keine einzige
    // Datenbank anlegen. Es ist dieselbe Falle, die im `Dockerfile` bei `/data/files`
    // steht — sie wird von hier aus erst erreichbar, seit dieser Dienst dasselbe Volume
    // mountet. GEMESSEN mit echtem Kennungswechsel:
    //
    //   /data root:root 755  → uid 1001 darf NICHT schreiben
    //   nach `chown`         → uid 1001 darf schreiben, /data/files bleibt unangetastet
    const rumpfV = funktionsrumpf(befehle, "vorbereiten");
    expect(rumpfV, "das Datenverzeichnis wird geprueft").toMatch(
      /schreibprobe "\$datenprobe"/,
    );
    expect(rumpfV).toMatch(/chown "\$NUTZER" "\$DATA_DIR"/);
    // ⚠️ NICHT REKURSIV: das Verzeichnis selbst reicht, um darin anzulegen, und `-R`
    // traefe die Blobs unter `/data/files` — ein eigenes Volume, das dem files-Image
    // gehoert und hier nur LESEND gemountet ist.
    expect(rumpfV, "kein -R").not.toMatch(/chown -R/);
    // Repariert wird nur, was kaputt ist — gefragt wird nach der Eigenschaft, auf die es
    // ankommt, nicht nach dem Eigentuemer.
    expect(rumpfV).toMatch(/if ! schreibprobe "\$datenprobe"; then/);
    // Und es bleibt nichts liegen.
    expect(rumpfV).toMatch(/rm -f "\$datenprobe"/);
    // ⚠️ DIE VORGABE MUSS ZEICHENGLEICH DIE AUS `backup.sh` SEIN. Der Sidecar uebereignet
    // hier ein Verzeichnis, aus dem JENES Skript die Datenbanken liest — laufen die
    // beiden Vorgaben auseinander, wird das falsche uebereignet und niemand merkt es.
    const ausSidecar = befehle.match(/^DATA_DIR="(.*)"$/m);
    const ausKern = lies("scripts/backup.sh").match(/^DATA_DIR="(.*)"$/m);
    expect(ausSidecar?.[1], "DATA_DIR steht im Sidecar").toBeTruthy();
    expect(ausSidecar?.[1]).toBe(ausKern?.[1]);
  });

  it("der Eigentuemer von `$DATA_DIR` wird gerichtet, BEVOR irgendetwas Netz braucht", () => {
    // ⚠️ `apk add` BRAUCHT NETZ, UND DIE REPARATUR STAND DAHINTER. Ist dieser Dienst
    // beim ersten `up -d` der erste, der `suite_data` mountet, gehoert `/data` root;
    // steht der Paketspiegel dann gerade nicht zur Verfuegung, bricht `apk add` ab,
    // `set -e` beendet den Vorlauf — und die Reparatur wird nie erreicht. GEMESSEN mit
    // einer `apk`-Attrappe, die scheitert:
    //
    //   Vorlauf: Pakete nachladen (…)
    //   ERROR: unable to select packages
    //   Eigentuemer von /data danach: 0     ← uid 1001 darf NICHT schreiben
    //
    // Eine Stoerung beim Paketspiegel des OPTIONALEN Backup-Dienstes hielt damit eine
    // frische Suite vom Start ab — die falsche Richtung, denn genau dafuer hat dieser
    // Dienst kein `depends_on`. Nach der Korrektur, dieselbe Attrappe: `/data` gehoert
    // 1001, uid 1001 darf schreiben.
    const rumpfV = funktionsrumpf(befehle, "vorbereiten");
    // ⚠️ ERST DIE EXISTENZ, DANN DIE REIHENFOLGE — `indexOf` liefert sonst -1 und jede
    // Reihenfolgepruefung wird wertlos (Fund 39).
    const vorher = rumpfV.indexOf('stat -c %u "$DATA_DIR"');
    const apk = rumpfV.indexOf("apk add");
    const probe = rumpfV.indexOf('schreibprobe "$datenprobe"');
    expect(vorher, "die apk-freie Reparatur steht im Vorlauf").toBeGreaterThan(-1);
    expect(apk, "`apk add` steht im Vorlauf").toBeGreaterThan(-1);
    expect(probe, "die Schreibprobe steht im Vorlauf").toBeGreaterThan(-1);
    expect(vorher, "die Reparatur kommt VOR dem Paketnachladen").toBeLessThan(apk);
    // ⚠️ UND DIE PROBE BLEIBT DAHINTER, das ist kein Versehen: sie braucht `su-exec`,
    // und das kommt AUS `apk`. Vorher gaebe es nur den Rueckfall „direkt schreiben" —
    // als root, und root schreibt auch in ein root-eigenes Verzeichnis; die Probe
    // meldete „alles gut" und repariert nichts (Fund 35, spiegelverkehrt). Deshalb
    // zwei Schritte: vorne die eine Lage, die ohne Rechteabbau feststellbar ist,
    // hinten die aussagekraeftige Messung.
    expect(probe, "die aussagekraeftige Probe bleibt NACH dem Paketnachladen").toBeGreaterThan(
      apk,
    );
    // Der vordere Schritt fasst nur an, was root gehoert — sonst wuerde er bei einem
    // namentlichen SUITE_USER bei jedem Start blind uebereignen.
    // ⚠️ AUF DIE GANZE BEDINGUNG ZUSICHERN, NICHT AUF `= "0"` — die Mutationsprobe hat
    // genau das aufgedeckt: `!= "0"` in der Zeile daneben enthaelt dieselbe
    // Zeichenfolge, also ueberlebte „Bedingung entfernt" GRUEN. Dritter Fall dieser
    // Sorte in diesem PR, nach Fund 12 und 39.
    const vorneBis = rumpfV.slice(vorher, apk);
    expect(vorneBis).toMatch(/\[ "\$\{eigner_uid:-\}" = "0" \]/);
    expect(vorneBis).toMatch(/chown "\$NUTZER" "\$DATA_DIR"/);
  });

  it("`einmal` durchlaeuft den Vorlauf ebenso wie `dienst`", () => {
    // ⚠️ NICHT OFFENSICHTLICH, UND DER DOKUMENTIERTE WEG HAENGT DARAN: der Probelauf und
    // `SUITE_BACKUP_CMD` rufen `docker compose run --rm backup … einmal`, und `run`
    // erzeugt einen FRISCHEN Container aus dem nackten alpine-Image. Ohne Vorlauf gibt
    // es dort kein `bash`, kein `sqlite3` und kein `rclone` — der Probelauf stuerbe mit
    // „bash: not found", und zwar genau in dem Moment, in dem jemand zum ersten Mal
    // prueft, ob die Sicherung ueberhaupt funktioniert.
    expect(befehle).toMatch(/einmal\) vorbereiten \/bin\/sh "\$0" lauf/);
    expect(befehle).toMatch(/dienst\) vorbereiten \/bin\/sh "\$0" schleife/);
  });

  it("`werkzeuge` fuehrt JEDEN Diagnosebefehl durch denselben Vorlauf", () => {
    // ⚠️ DIESELBE URSACHE, EINE STELLE WEITER — und im Runbook zuerst uebersehen:
    // `docker compose run --rm backup rclone lsl …` ueberschreibt das `command` des
    // Dienstes und startet einen frischen Container aus dem nackten Image. Ohne Vorlauf
    // gibt es dort kein `rclone` und kein `sqlite3`; busybox deckt nur `sh`, `ls`,
    // `tar`, `du` und `cat` ab. Betroffen waren die Gegenprobe „liegt es wirklich am
    // Ziel?" UND die ganze dokumentierte Wiederherstellung.
    expect(befehle).toContain("werkzeuge)");
    expect(befehle).toMatch(/shift\s+if \[ "\$#" -eq 0 \]/);
    expect(befehle).toMatch(/vorbereiten "\$@"/);
  });

  it("ein Stoppwunsch aus dem Vorlauf ueberlebt den `exec` — weil vorher geprueft wird", () => {
    // ⚠️ `exec` ERSETZT DEN PROZESS, und `beenden` ist eine VARIABLE: die neue Shell
    // startet mit 0. Dazwischen liegt ausgerechnet die laengste blockierende Stelle des
    // Skripts (`apk add`, sieben Pakete) — und eine POSIX-Shell schiebt die Falle auf,
    // solange ein Kind im Vordergrund laeuft, das Signal wirkt also fruehestens danach,
    // wenn der `exec` die naechste Anweisung ist.
    //
    // GEMESSEN mit einer `apk`-Attrappe (6s) und SIGTERM nach 2s: der Dienst meldete
    // „Backup-Sidecar bereit." und blieb stehen — im Container haette er die volle
    // `stop_grace_period` (30min) abgesessen, mit BACKUP_BEIM_START=1 sogar noch ein
    // Backup begonnen. Nach der Pruefung: exit 1, kein „bereit", kein Lauf.
    const rumpf = funktionsrumpf(befehle, "vorbereiten");
    // BEIDE Ausgaenge, nicht nur der mit `apk` davor: die Falle steht schon, wenn der
    // Vorlauf uebersprungen wird.
    expect(rumpf.match(/beenden_pruefen/g) ?? [], "vor jedem exec").toHaveLength(2);
    for (const zeile of rumpf.split("\n")) {
      if (!zeile.includes("exec ")) continue;
      const davor = rumpf.slice(0, rumpf.indexOf(zeile));
      expect(
        davor.lastIndexOf("beenden_pruefen") > davor.lastIndexOf("exec "),
        `geprueft wird VOR "${zeile.trim()}"`,
      ).toBe(true);
    }
    // ⚠️ DER AUSGANG IST NICHT 0, UND DAS IST DER PUNKT: `vorbereiten` traegt auch
    // `einmal`, und dort haengt `SUITE_BACKUP_CMD` im Rollout am Exit-Code. Eine 0
    // hiesse „gesichert", obwohl kein Lauf stattgefunden hat — der Rollout zoege dann
    // ohne Sicherung weiter, also genau in der Lage, fuer die es ihn gibt.
    expect(funktionsrumpf(befehle, "beenden_pruefen")).toMatch(/exit 1/);
  });
});

describe("scripts/backup-sidecar.sh — zwei Laeufe zerstoeren einander nicht", () => {
  it("ein Lauf haelt eine Sperre, und sie entsteht per atomarem `mkdir`", () => {
    // ⚠️ DER ANLASS IST REAL: der Dienst und ein `docker compose run … einmal` aus dem
    // Rollout sind getrennte Container am SELBEN Volume, und `scripts/backup.sh` benennt
    // Arbeitsverzeichnis und Archiv nur auf die SEKUNDE genau. Starten beide gleichzeitig,
    // schreiben sie dieselben SQLite-Kopien in dasselbe Verzeichnis, und das `rm -rf` des
    // einen raeumt es unter dem `tar` des anderen weg — heraus kaeme ein halbes Tarball,
    // das wie ein ganzes aussieht.
    //
    // `mkdir` und NICHT `flock`: busybox hat flock, dash auf einem Debian-Host nicht
    // zwingend — eine Sperre, die je nach Umgebung fehlt, ist schlimmer als keine.
    expect(befehle).toMatch(/mkdir "\$SPERRVERZEICHNIS" 2>\/dev\/null/);
    expect(befehle).toMatch(/lauf\(\) \{\s*\n\s*sperre_erwarten \|\| return 1/);
  });

  it("ein Fehlschlag meldet sich an einer EIGENEN URL, wenn das Ziel keine /fail kennt", () => {
    // ⚠️ DER FEHLFALL MELDET SONST GESUND STATT KAPUTT, und das ist schlimmer als gar
    // keine Ueberwachung. `$URL/fail` ist die Konvention von healthchecks.io. Uptime
    // Kuma — im Runbook danebengestellt — kodiert den Zustand in der ABFRAGE, und seine
    // kopierfertige URL traegt bereits `status=up`:
    //   https://kuma/api/push/AbC123?status=up&msg=OK&ping=
    // Das `/fail` geht in den PFAD (`/api/push/AbC123/fail?status=up…`), und den gibt
    // es bei Kuma nicht: gruen aufgefrischt wird der Waechter dadurch zwar nicht mehr,
    // von seinem Fehlschlag erfaehrt er aber auch nichts. Gemessen an beiden Formen.
    expect(befehle).toContain("BACKUP_PING_URL_FEHLER");
    const rumpfP = funktionsrumpf(befehle, "ping_senden");
    expect(rumpfP).toMatch(/elif \[ -n "\$BACKUP_PING_URL_FEHLER" \]; then/);
    // Und die Vorbelegung bleibt die healthchecks.io-Form, damit der haeufige Fall
    // ohne zweite Zeile auskommt — ueber `fehler_url`, nicht als Anhaengen von Hand.
    expect(rumpfP).toMatch(/ziel="\$\(fehler_url "\$BACKUP_PING_URL"\)"/);
  });

  it("nach dem Stoppbefehl wird KEIN neuer Lauf mehr begonnen", () => {
    // ⚠️ Der Dienst kann hinter einer Rollout-Sicherung warten. Kommt dabei SIGTERM,
    // setzt die Falle `beenden=1` — aber die Warteschleife sah das nicht, holte sich die
    // freigegebene Sperre und finge ein VOLLES Backup an. Das frisst die restliche
    // `stop_grace_period` und endet im schlechtesten Fall in SIGKILL mit halbem Archiv.
    // Gemessen: der Wartende endete nach 7s mit Exit 1, ohne einen Lauf zu beginnen.
    const rumpfE = funktionsrumpf(befehle, "sperre_erwarten");
    // ⚠️ DIE REIHENFOLGE IST DER FIX, NICHT DIE PRUEFUNG — und das hatte ich zuerst
    // falsch. Stand sie im Schleifenrumpf und `sperre_holen` in der Schleifenbedingung,
    // lief sie zu spaet: gibt der andere Lauf waehrend unseres Schlafs frei, belegt die
    // BEDINGUNG die Sperre und verlaesst die Schleife, bevor der Rumpf drankommt.
    // NACHGESTELLT: SIGTERM im Schlaf, danach die Sperre freigegeben — „Sperre nach 10s
    // bekommen", und ein volles Backup lief an, nach dem Stoppbefehl.
    const pruefung = rumpfE.indexOf('[ "$beenden" -ne 0 ]');
    const versuch = rumpfE.indexOf("if sperre_holen; then");
    expect(pruefung, "die Beendigung wird geprueft").toBeGreaterThan(-1);
    expect(versuch, "die Sperre wird im RUMPF geholt, nicht in der Bedingung").toBeGreaterThan(-1);
    expect(pruefung).toBeLessThan(versuch);
    expect(rumpfE).not.toMatch(/while ! sperre_holen/);
    // ⚠️ Und eine im Rennen mit dem Signal geholte Sperre muss sofort wieder weg —
    // sonst blockiert sie jeden naechsten Lauf bis zur Altersgrenze, obwohl niemand
    // mehr arbeitet.
    expect(rumpfE).toMatch(/haelt_sperre=1[\s\S]*?sperre_ablegen\s*\n\s*return 1/);
    // `beenden` muss belegt sein, BEVOR eine Funktion es liest — unter `set -u` waere es
    // sonst ein Abbruch statt einer Pruefung.
    const vorFunktionen = befehle.slice(0, befehle.indexOf("sperre_erwarten()"));
    expect(vorFunktionen).toMatch(/^beenden=0$/m);
  });

  it("der zweite Lauf WARTET, statt zu ueberspringen", () => {
    // Ein uebersprungener Lauf waere fuer `deploy.sh` ein gruener Exit-Code OHNE
    // Sicherung — es rollte dann ohne aus. Ein zweites Tarball kostet nur Platz.
    expect(befehle).toContain("BACKUP_SPERRE_FRIST_MINUTEN");
    // Gewartet wird in einer Schleife mit Frist — die Belegung steht im RUMPF, nicht in
    // der Bedingung (siehe den Fall zur Beendigung).
    const rumpfW = funktionsrumpf(befehle, "sperre_erwarten");
    expect(rumpfW).toMatch(/while :; do/);
    expect(rumpfW).toMatch(/\[ "\$gewartet" -ge "\$frist" \]/);
    expect(rumpfW).toMatch(/sleep 10/);
  });

  it("die Uebernahme haengt an der IDENTITAET der Belegung, nicht nur an ihrem Alter", () => {
    // ⚠️ DIE TEUERSTE STELLE DIESES PRS, UND SIE HAT DREI ANLAEUFE GEBRAUCHT. Der
    // naheliegende Weg — pruefen, ob verwaist, wegraeumen, neu anlegen — hat ein Fenster
    // zwischen Urteil und Tat, und zwei Wartende treffen es. Nacheinander versucht, und
    // JEWEILS GEMESSEN, dass es NICHT reicht:
    //
    //   1. `rm -rf` durch das atomare `mv` ersetzt →  8 Wartende, 3 gleichzeitige Laeufe
    //   2. eine ZWEITE Sperre ueber die Uebernahme,
    //      mit erneuter Pruefung darin              → 16 Wartende, 2 bzw. 3 gleichzeitig
    //
    // Beides verengt das Fenster und schliesst es nicht: das Urteil faellt weiterhin,
    // bevor gehandelt wird, und die Tat ist an nichts gebunden, was das Urteil betraf.
    //
    // Was traegt, ist eine Bedingung auf die IDENTITAET: die Sperre enthaelt genau ein
    // Unterverzeichnis (ihre Marke), und uebernehmen darf nur, wer GENAU DIE gesehene
    // Marke entfernen kann. `rmdir` ist atomar — einer gewinnt, jeder Zweite bekommt
    // ENOENT, und wer zu spaet kommt, findet die alte Marke nicht mehr.
    const rumpfU = funktionsrumpf(befehle, "sperre_uebernehmen");
    expect(rumpfU).toMatch(/rmdir "\$SPERRVERZEICHNIS\/\$1" 2>\/dev\/null \|\| return 1/);
    // Das Wegraeumen der Sperre selbst gelingt nur, wenn sie LEER ist — eine ordentlich
    // gehaltene Sperre traegt ihre Marke und kann so nicht mitgerissen werden. `rm -rf`
    // haette genau diese Bedingung nicht.
    expect(rumpfU).toMatch(/rmdir "\$SPERRVERZEICHNIS" 2>\/dev\/null \|\| return 1/);
    expect(rumpfU).not.toMatch(/rm -rf/);
    // Und den Besitz entscheidet auch hier allein das `mkdir`.
    expect(rumpfU).toMatch(/mkdir "\$SPERRVERZEICHNIS" 2>\/dev\/null \|\| return 1/);
  });

  it("jede Belegung setzt ihre Marke, und eine Sperre ohne Marke ist ein Rest", () => {
    const rumpfH = funktionsrumpf(befehle, "sperre_holen");
    expect(rumpfH).toMatch(
      /mkdir "\$SPERRVERZEICHNIS" 2>\/dev\/null; then\s*\n\s*sperre_marke_setzen/,
    );
    // ⚠️ Eine Sperre OHNE Marke ist ein halb angelegter Rest (jemand starb zwischen den
    // beiden `mkdir`). Sie darf uebernommen werden — aber erst, wenn sie lange genug so
    // dasteht, dass kein lebender Prozess sie gerade anlegt. Ohne diese Bedingung waere
    // die GEWOEHNLICHE Belegung selbst wieder ein Wettlauf, und zwar der haeufigste.
    expect(rumpfH).toMatch(/\[ "\$\(sperre_alter\)" -gt 60 \] \|\| return 1/);
  });

  it("der Zeitstempel der Sperre entsteht MIT ihr, nicht in einem zweiten Schritt", () => {
    // ⚠️ GEMESSEN, ALS ER IN EINER DATEI IM SPERRVERZEICHNIS STAND: zwischen `mkdir` und
    // dem Schreiben liegt ein Fenster. Ein zweiter Prozess sieht dort eine Sperre OHNE
    // Zeitstempel, liest ihn als 0, haelt die brandneue Sperre fuer uralt und uebernimmt
    // sie. Nachgestellt mit einem leeren `.lauf.sperre`: der Lauf startete.
    //
    // `mkdir` setzt die mtime in derselben Operation, mit der es das Verzeichnis anlegt.
    expect(befehle).toMatch(/stat -c %Y "\$1"/);
    expect(befehle).not.toMatch(/>"?\$SPERRVERZEICHNIS\/seit/);
  });

  it("in der Sperre liegt NUR ihre Marke — sonst altert sie nie", () => {
    // ⚠️ Die Kehrseite der mtime: wer dort etwas ablegt, setzt sie neu. Die Marke tut das
    // genau einmal, bei der Belegung — danach hebt sie allein der Herzschlag. Kaeme
    // laufend etwas dazu, saehe die Sperre ewig jung aus, und die Uebernahme einer
    // wirklich verwaisten griffe nie mehr. Gemessen: ein `touch` darin hebt die mtime an.
    // ⚠️ Der Name traegt jetzt eine GENERATION statt eines Zeitstempels — der
    // Herzschlag zaehlt sie hoch, damit die Uebernahme ein Vergleiche-und-Tausche ueber
    // Identitaet UND Generation ist (eigener Fall weiter unten).
    // ⚠️ Und das Praefix traegt seit dem Container-Fund eine Kennung neben der PID —
    // die Form steht in einem eigenen Fall, hier zaehlt nur, dass die Marke daraus
    // gebildet wird.
    expect(befehle).toMatch(/LAUF_KENNUNG="\$\(eigner_kennung\)\.\$\$"/);
    expect(befehle).toMatch(/MARKE_PRAEFIX="eigner\.\$LAUF_KENNUNG\."/);
    expect(befehle).toMatch(/meine_marke="\$\(printf '%s%06d' "\$MARKE_PRAEFIX" 1\)"/);
    const hineingeschrieben = befehle
      .split("\n")
      .filter((z) => z.includes("$SPERRVERZEICHNIS/"))
      .filter((z) => !z.includes("rmdir"))
      // Lesende Pruefungen legen nichts ab — der Herzschlag fragt nach seiner eigenen
      // Marke, bevor er auffrischt.
      .filter((z) => !z.includes("[ -d "));
    expect(hineingeschrieben.map((z) => z.trim())).toEqual([
      'if ! mkdir "$SPERRVERZEICHNIS/$meine_marke" 2>/dev/null; then',
    ]);
    // ⚠️ Der Herzschlag steht bewusst NICHT mehr in dieser Liste: er schlaegt die Sperre
    // nicht ueber ihren Namen nach, sondern HAELT sie (`cd`) und legt seine naechste
    // Generation relativ dazu an. Mit absolutem Pfad landete sie nach einer Uebernahme
    // in der Sperre des Nachfolgers — gemessen, siehe den eigenen Fall dazu.
    const rumpfHs = funktionsrumpf(befehle, "herzschlag_starten");
    expect(rumpfHs, "und auch er legt nur Marken an").toMatch(
      /mkdir "\$neu" 2>\/dev\/null \|\| exit 0/,
    );
  });

  it("die Marke gilt erst, wenn sie die EINZIGE ist — sonst gehoert die Sperre jemand anderem", () => {
    // ⚠️ ZWISCHEN DEN BEIDEN `mkdir` LIEGT EIN FENSTER, und mein eigener Kommentar hat es
    // mit „liegen Millisekunden auseinander" weggeredet. „Normalerweise" ist keine
    // Zusicherung: haelt die Maschine an (Host-Suspend, eingefrorener Container), sieht
    // ein Wartender eine Sperre OHNE Marke, haelt sie nach 60s fuer einen Rest und
    // uebernimmt sie zu Recht — und der Erste setzt danach seine Marke in die Sperre des
    // ZWEITEN.
    //
    // GEMESSEN mit 8s Halt zwischen den beiden `mkdir` und einer auf 5min
    // zurueckdatierten Sperre: „B: haelt die Sperre" UND „A: haelt die Sperre", zwei
    // Marken im Verzeichnis. Nach dem Riegel: B haelt, A tritt zurueck, eine Marke.
    const rumpfM = funktionsrumpf(befehle, "sperre_marke_setzen");
    expect(rumpfM).toMatch(/ls "\$SPERRVERZEICHNIS"[\s\S]*wc -l[\s\S]*-ne 1/);
    // Wer zuruecktritt, nimmt seine eigene Marke wieder mit — sonst stuende sie in einer
    // fremden Sperre und der naechste `head -1` griffe daneben.
    expect(rumpfM).toMatch(/rmdir "\$SPERRVERZEICHNIS\/\$meine_marke"/);
    expect(rumpfM).toMatch(/meine_marke=""\s*\n\s*return 1/);
    // ⚠️ DER RIEGEL NUETZT NUR, WENN SEIN ERGEBNIS AUCH ANKOMMT. Beide Aufrufer haben
    // vorher blind weitergemacht — `mkdir` galt als Besitz, die Marke war Beiwerk.
    for (const f of ["sperre_holen", "sperre_uebernehmen"]) {
      expect(funktionsrumpf(befehle, f), `${f} wertet das Ergebnis aus`).toMatch(
        /sperre_marke_setzen \|\| return 1/,
      );
    }
  });

  it("ein LAUFENDER Lauf haelt seine Sperre am Leben — die Grenze misst Lebenszeichen", () => {
    // ⚠️ OHNE HERZSCHLAG IST DIE ALTERSGRENZE EINE FRIST AUF DEN LAUF SELBST. Ein
    // gesunder Lauf, der laenger dauert als sie (eine grosse Ablage, ein langsames
    // Ziel), galte danach als verwaist — und der naechste naehme ihm die Sperre weg,
    // waehrend er noch schreibt. Genau die Gleichzeitigkeit, gegen die es die Sperre
    // gibt, nur mit Zeitverzoegerung. GEMESSEN: Sperre mit 8h alter mtime, der zweite
    // Lauf startete sofort.
    //
    // `touch` auf das VERZEICHNIS hebt seine mtime, ohne etwas hineinzulegen — die
    // Sperre bleibt leer, was sie bleiben muss. Nachgemessen mit einem 25s-Lauf und
    // 3s-Takt: das Alter blieb unter 3s. Und mit der Grenze kuenstlich auf 0 Stunden
    // gab der zweite Lauf auf, statt zu uebernehmen.
    const rumpfL = funktionsrumpf(befehle, "lauf");
    expect(rumpfL).toMatch(/herzschlag_starten/);
    // ⚠️ Aufgefrischt wird jetzt durch die ROTATION: das `mkdir` der naechsten
    // Generation zieht die mtime der Sperre ohnehin nach, ein `touch` braucht es nicht
    // mehr — und die Rotation leistet zusaetzlich das, was `touch` nicht konnte
    // (eigener Fall: die Uebernahme einer LEBENDEN Sperre).
    expect(funktionsrumpf(befehle, "herzschlag_starten")).toMatch(/mkdir "\$neu"/);
    expect(befehle).toContain("BACKUP_HERZSCHLAG_SEKUNDEN");
    // Er endet mit der Sperre — auch bei einem gescheiterten Lauf, denn `sperre_ablegen`
    // haengt an der EXIT-Falle.
    const rumpfA = funktionsrumpf(befehle, "sperre_ablegen");
    expect(rumpfA).toMatch(/herzschlag_beenden/);
    // ⚠️ ER PRUEFT ZWEI DINGE, UND DAS ZWEITE IST DAS WICHTIGERE. „Sperre noch da" reicht
    // NICHT: stirbt der Eigentuemer hart, bleibt sie ja gerade stehen — der Herzschlag
    // liefe weiter und hielte sie ewig jung, womit die Uebernahme einer wirklich
    // verwaisten Sperre nie mehr griffe. Genau die Verklemmung, gegen die die
    // Altersgrenze da ist. GEMESSEN, als nur die erste Bedingung dastand: Eigentuemer
    // per SIGKILL beendet, der Herzschlag lief weiter, die mtime blieb frisch. Mit
    // `kill -0` endet er, und das Alter waechst wieder (gemessen 4s → 14s).
    // ⚠️ Und die Bedingung fragt nach UNSERER MARKE, nicht nach der Sperre: nach einer
    // Uebernahme steht dort die Sperre des Nachfolgers, und ein Herzschlag, der die
    // auffrischt, haelt eine FREMDE am Leben. Gemessen: fremde Sperre nach 6s immer noch
    // 186s alt (nicht aufgefrischt), die eigene 1s (aufgefrischt).
    const rumpfH2 = funktionsrumpf(befehle, "herzschlag_starten");
    expect(rumpfH2).toMatch(
      /while \[ -n "\$marke" \] && \[ -d "\$marke" \] && kill -0 "\$eltern"/,
    );
    // Nach JEDEM Schlaf erneut — in der Zwischenzeit kann die Sperre den Eigentuemer
    // gewechselt haben, und die Bedingung oben hat das lange vorher geprueft.
    expect(rumpfH2).toMatch(
      /sleep "\$BACKUP_HERZSCHLAG_SEKUNDEN"[\s\S]*\[ -d "\$marke" \] \|\| exit 0/,
    );
  });

  it("ein Lauf, der die Sperre VERLIERT, fasst nichts Geteiltes mehr an", () => {
    // ⚠️ DEN HERZSCHLAG ZU BEENDEN REICHT NICHT — er ist nur der Melder. Stand die
    // Maschine laenger als die Altersgrenze, hat ein anderer Lauf uebernommen und
    // arbeitet; dieser hier liefe ohne Zaun weiter in genau die geteilten Dinge hinein,
    // gegen die es die Sperre gibt: dieselbe Rotation am Ziel und dieselbe
    // Zustandsdatei. Dass die Freigabe die fremde Sperre in Ruhe laesst, verhindert das
    // nicht — sie kommt zu spaet.
    //
    // GEMESSEN mit einer Uebernahme waehrend `backup.sh` lief: rclone 0 mal gerufen,
    // der Stand des NEUEN Laufs unveraendert, die fremde Sperre steht, Exit 1.
    const rumpfL = funktionsrumpf(befehle, "lauf_ungesperrt");
    const zaun = rumpfL.indexOf("sperre_gehoert_uns");
    const auslagern = rumpfL.indexOf("auslagern ");
    expect(zaun, "der Lauf prueft den Besitz").toBeGreaterThan(-1);
    expect(zaun, "und zwar VOR dem Auslagern").toBeLessThan(auslagern);

    // ⚠️ DIE ZUSTANDSDATEI IST DER ZWEITE GETEILTE ORT, und sie wird an VIER Stellen
    // geschrieben. Deshalb haengt die Pruefung an der Funktion selbst: so kann keine
    // kuenftige Aufrufstelle sie vergessen.
    const rumpfZ = funktionsrumpf(befehle, "zustand_schreiben");
    expect(rumpfZ).toMatch(/if ! sperre_gehoert_uns; then[\s\S]*return 0/);
    const pruefung = rumpfZ.indexOf("sperre_gehoert_uns");
    expect(pruefung, "vor dem Schreiben, nicht danach").toBeLessThan(rumpfZ.indexOf("mv "));

    // Der Besitznachweis ist die eigene Marke — dieselbe Bedingung wie bei Freigabe und
    // Herzschlag, nicht eine zweite, die auseinanderlaufen koennte.
    // ⚠️ Geprueft wird das PRAEFIX, nicht der exakte Name: der Herzschlag dreht die
    // Generation weiter, und waehrend einer Rotation liegen kurz zwei Marken da — beide
    // unsere. Eine fremde darunter heisst: die Sperre gehoert uns nicht mehr.
    const rumpfB = funktionsrumpf(befehle, "sperre_gehoert_uns");
    expect(rumpfB).toMatch(/"\$MARKE_PRAEFIX"\*\) gefunden=1/);
    // ⚠️ Die FREMDE Marke entscheidet weiterhin sofort — nur wird sie inzwischen erst
    // vermerkt und nach der Schleife ausgewertet, weil ein waehrend der Pruefung
    // weggeraeumter EIGENER Eintrag kein Urteil mehr sein darf (eigener Fall weiter
    // unten). Das `*)` trifft also jetzt `fremd=1` statt `return 1`.
    expect(rumpfB).toMatch(/\*\) fremd=1/);
    expect(rumpfB).toMatch(/\[ "\$fremd" -eq 0 \] \|\| return 1/);
  });

  it("der Herzschlag LEGT NICHTS AN — sonst blockiert er jede kuenftige Sperre", () => {
    // ⚠️ DER TEUERSTE FEHLER DIESES PRs, UND ER IST GEMESSEN. `touch` legt an, was es
    // nicht findet. Eine Uebernahme besteht aus `rmdir` und `mkdir`; faellt der
    // Herzschlag genau dazwischen, entsteht `.lauf.sperre` als REGULAERE DATEI — und
    // daran scheitert jedes kuenftige `mkdir`. Nicht einmal, sondern fuer immer:
    //
    //   Danach ist .lauf.sperre: REGULAERE DATEI
    //   mkdir SCHEITERT — Backups dauerhaft blockiert
    //
    // `-c` ist POSIX und legt nicht an. Nachgemessen: derselbe Ablauf laesst den Pfad
    // frei, das naechste `mkdir` gelingt wieder.
    // ⚠️ SEIT DER ROTATION IST DIE EIGENSCHAFT STRUKTURELL STATT ERKAUFT: der
    // Herzschlag `touch`t gar nicht mehr, er legt ein UNTERverzeichnis an — und seit er
    // die Sperre FESTHAELT (`cd`) statt sie nachzuschlagen, sogar zweifach: ist sie weg
    // oder ersetzt, scheitert `mkdir eigner.1.000002` mit „No such file or directory"
    // und legt NICHTS an. Die regulaere Datei aus diesem Fund kann auf diesem Weg gar
    // nicht mehr entstehen.
    const rumpfH = funktionsrumpf(befehle, "herzschlag_starten");
    expect(rumpfH, "gar kein touch mehr").not.toMatch(/touch /);
    expect(rumpfH).toMatch(/mkdir "\$neu" 2>\/dev\/null \|\| exit 0/);
  });

  it("ein Takt von 0 ist eine Leerlaufschleife und wird abgefangen", () => {
    // ⚠️ `sleep 0` KEHRT SOFORT ZURUECK. Die Schleife prueft und `touch`t dann ohne
    // Pause — GEMESSEN mit BACKUP_HERZSCHLAG_SEKUNDEN=0: 1423 Runden in zwei Sekunden,
    // einen Kern voll ausgelastet und das Backup-Volume beschrieben, so lange der Lauf
    // dauert. Ein Tippfehler in der `.env` reicht dafuer.
    //
    // Nach der Aenderung: Warnung, Vorgabe 60s, und die mtime der Sperre bewegt sich in
    // zwei Sekunden nicht mehr.
    // ⚠️ ABGEFANGEN WIRD AN DER QUELLE, NICHT IM HERZSCHLAG — und das ist kein
    // Aufräumen, sondern der Unterschied, der zaehlt: `sperre_ist_verwaist` rechnet aus
    // demselben Wert die Untergrenze, die eine LEBENDE Sperre schuetzt, und dort kommt
    // ein WARTENDER an, lange bevor er selbst je einen Herzschlag gestartet hat. Stand
    // die Pruefung nur im Herzschlag, hatte der Wartende sie nie. GEMESSEN mit
    // BACKUP_HERZSCHLAG_SEKUNDEN=0 und BACKUP_SPERRE_ALTER_STUNDEN=0:
    //
    //   Vorgaben (60 / 6h)   Sperre 1s alt → lebt
    //   beides 0             Sperre 1s alt → VERWAIST (wird uebernommen)
    const zeile = befehle
      .split("\n")
      .find((z) => z.startsWith("BACKUP_HERZSCHLAG_SEKUNDEN="));
    expect(zeile, "der Takt wird an der Quelle als POSITIV geprueft").toMatch(
      /zahl_oder_vorgabe BACKUP_HERZSCHLAG_SEKUNDEN .* 60 positiv\)/,
    );
    // Gemessen statt gescannt: 0 faellt auf die Vorgabe, eine gueltige Zahl nicht.
    const positiv = (wert: string) =>
      shellSkript(
        [...HELFER, "zahl_oder_vorgabe"],
        'zahl_oder_vorgabe TEST "$1" 60 positiv',
        wert,
      );
    expect(positiv("0"), "0 ist kein Takt").toBe("60");
    expect(positiv("30"), "eine gueltige Zahl bleibt").toBe("30");
    expect(positiv("abc")).toBe("60");
    // ⚠️ UND KEINE ZWEITE PRUEFUNG IM HERZSCHLAG: sie waere seit der Quelle toter Code,
    // der beim naechsten Umbau auseinanderlaeuft.
    const rumpfH = funktionsrumpf(befehle, "herzschlag_starten");
    expect(rumpfH, "kein zweiter Rueckfall").not.toMatch(/BACKUP_HERZSCHLAG_SEKUNDEN=60/);
  });

  it("eine Marke, die WAEHREND der Pruefung rotiert, enteignet niemanden", () => {
    // ⚠️ DER GLOB WIRD VOR DER SCHLEIFE ERWEITERT. Der Herzschlag legt erst die neue
    // Generation an und entfernt dann die alte; faellt die Pruefung genau dazwischen,
    // steht in der bereits erweiterten Liste ein Eintrag, den es nicht mehr gibt.
    // Vorher hiess das `return 1` — „enteignet", obwohl die neue Marke mit DEMSELBEN
    // Praefix danebenliegt. GEMESSEN, deterministisch mit einer Rotation mitten in der
    // Schleife: „ENTEIGNET, Inhalt der Sperre: eigner.aaaa.1.000002".
    //
    // Und als echtes Wettrennen, ein Dreher im Hintergrund gegen 4000 Pruefungen,
    // drei Runden:
    //
    //   alt: 3 / 2 / 1 von 4000 melden faelschlich ENTEIGNET
    //   neu: 0 / 0 / 0
    //
    // Selten — aber die Folge ist teuer: ein voellig gesunder langer Lauf haette das
    // Auslagern uebersprungen, seinen Stand nicht hinterlegt und den Erfolgs-Ping
    // unterdrueckt, rein aus Zeitverhalten.
    const kladde = mkdtempSync(path.join(os.tmpdir(), "backup-sperre-"));
    try {
      const lage = (aufbau: string[]) =>
        shellSkript(
          ["sperre_gehoert_uns"],
          [
            `SPERRVERZEICHNIS=${kladde}/sperre`,
            'MARKE_PRAEFIX="eigner.aaaa.1."',
            'meine_marke="${MARKE_PRAEFIX}000001"',
            'rm -rf "$SPERRVERZEICHNIS"; mkdir -p "$SPERRVERZEICHNIS"',
            ...aufbau,
            'if sperre_gehoert_uns; then echo uns; else echo fremd; fi',
          ].join("\n"),
        );
      const marke = (n: string) => `mkdir "$SPERRVERZEICHNIS/\${MARKE_PRAEFIX}${n}"`;
      expect(lage([marke("000001")]), "ruhig, eigene Marke").toBe("uns");
      // Rotation vollzogen: nur noch die NEUE Generation liegt da.
      expect(lage([marke("000002")]), "nach vollzogener Rotation").toBe("uns");
      // Der Moment der Rotation selbst — kurz liegen zwei eigene nebeneinander.
      expect(lage([marke("000002"), marke("000003")]), "zwei eigene Generationen").toBe("uns");
      // ⚠️ Eine FREMDE Marke bleibt sofort ein Nein — daran aendert ein zweiter Blick
      // nichts, und ein `continue` daraus zu machen waere genau der Rueckbau, der die
      // Sperre wieder wertlos machte.
      expect(
        lage([marke("000001"), 'mkdir "$SPERRVERZEICHNIS/eigner.bbbb.1.000001"']),
        "fremde Marke daneben",
      ).toBe("fremd");
      expect(lage([]), "leere Sperre").toBe("fremd");
    } finally {
      rmSync(kladde, { recursive: true, force: true });
    }
    const rumpfG = funktionsrumpf(befehle, "sperre_gehoert_uns");
    // Ein verschwundener Eintrag ist kein Urteil mehr, sondern eine veraltete Aufnahme.
    expect(rumpfG).toMatch(/\[ -e "\$eintrag" \] \|\| continue/);
    // …und die Aufnahme wird EINMAL wiederholt, wenn nichts Eigenes dabei war.
    expect(rumpfG).toMatch(/while \[ "\$versuch" -le 2 \]/);
    // Eine fremde Marke entscheidet weiterhin sofort.
    expect(rumpfG).toMatch(/\[ "\$fremd" -eq 0 \] \|\| return 1/);
  });

  it("die Uebernahme scheitert an einem Herzschlag, der DAZWISCHEN kommt", () => {
    // ⚠️ DIE ALTERSGRENZE ALLEIN IST EIN URTEIL UEBER DIE VERGANGENHEIT. Der Wartende
    // liest die alte mtime, urteilt „verwaist" — und zwischen Urteil und `rmdir` meldet
    // sich der Eigentuemer. Solange der Name der Marke gleich blieb, gelang das `rmdir`
    // trotzdem, und ein LAUFENDER Lauf wurde enteignet. GEMESSEN:
    //
    //   WARTENDER hat uebernommen — Alter der Sperre in diesem Moment: 0s
    //
    // Also ein kerngesunder Eigentuemer, dem die Sperre weggenommen wurde.
    //
    // Der Herzschlag dreht deshalb die GENERATION weiter. Damit ist das `rmdir` der
    // beobachteten Marke ein Vergleiche-und-Tausche ueber Identitaet UND Generation: wer
    // sie gesehen und seither einen Schlag verpasst hat, greift ins Leere. Nachgemessen,
    // derselbe Aufbau: „WARTENDER tritt zurueck", und die Sperre traegt danach die
    // naechste Generation des Eigentuemers.
    const rumpfH = funktionsrumpf(befehle, "herzschlag_starten");
    expect(rumpfH).toMatch(/zaehler=\$\(\(zaehler \+ 1\)\)/);
    expect(rumpfH).toMatch(/neu="\$\(printf '%s%06d' "\$MARKE_PRAEFIX" "\$zaehler"\)"/);
    // ⚠️ ERST DIE NEUE, DANN DIE ALTE WEG — die Reihenfolge ist der ganze Trick. So
    // liegen kurz zwei Marken da, und ein Wartender, der die AELTERE gesehen hat, raeumt
    // genau die weg, die ohnehin gehen sollte; sein `rmdir` auf die Sperre scheitert dann
    // an der neuen. Andersherum gaebe es einen Moment ganz OHNE Marke, und in dem hielte
    // der Eigentuemer sich selbst fuer enteignet.
    const anlegen = rumpfH.indexOf('mkdir "$neu"');
    const wegraeumen = rumpfH.indexOf('rmdir "$marke"');
    expect(anlegen, "die neue Generation entsteht").toBeGreaterThan(-1);
    expect(wegraeumen, "die alte wird weggeraeumt").toBeGreaterThan(-1);
    expect(anlegen, "und zwar in dieser Reihenfolge").toBeLessThan(wegraeumen);
    // ⚠️ NULLGEFUELLT, WEIL `ls` ALPHABETISCH SORTIERT: `sperre_marke` nimmt die erste
    // Marke, und die muss waehrend einer Rotation die AELTERE sein. Ohne feste Breite
    // sortierte sich `…10` vor `…9`, und ein Wartender raeumte die frische weg.
    expect(befehle).toMatch(/printf '%s%06d'/);
  });

  it("die Altersgrenze hat einen BODEN am Herzschlag", () => {
    // ⚠️ Eine Grenze unterhalb des Herzschlags ist selbstwidersprüchlich: der Lauf meldet
    // sich alle BACKUP_HERZSCHLAG_SEKUNDEN, eine kleinere Grenze erklaerte ihn also
    // zwischen zwei Lebenszeichen fuer tot. GEMESSEN an der Einstellung 0 Stunden: der
    // zweite Lauf enteignete den laufenden ersten — und mein erster Nachweis fuer den
    // Herzschlag hatte genau diese Einstellung benutzt und nur durch Zufall gehalten.
    // Der Boden macht die Zusicherung strukturell statt dokumentiert.
    const rumpfV = funktionsrumpf(befehle, "sperre_ist_verwaist");
    expect(rumpfV).toMatch(/boden=\$\(\(BACKUP_HERZSCHLAG_SEKUNDEN \* 10\)\)/);
    expect(rumpfV).toMatch(/if \[ "\$grenze" -lt "\$boden" \]; then grenze="\$boden"; fi/);
  });

  it("eine verwaiste Sperre wird nach ihrem ALTER uebernommen, nicht nach einer PID", () => {
    // ⚠️ EINE PID NUETZT HIER NICHTS: die beiden Laeufe sitzen in verschiedenen Containern,
    // also in verschiedenen PID-Namensraeumen. Ohne die Uebernahme stuende das Backup nach
    // einem SIGKILL dauerhaft still — und zwar still, bis der Healthcheck nach 26h anspringt.
    expect(befehle).toContain("BACKUP_SPERRE_ALTER_STUNDEN");
    const rumpfV = funktionsrumpf(befehle, "sperre_ist_verwaist");
    expect(rumpfV).toMatch(/grenze=\$\(\(BACKUP_SPERRE_ALTER_STUNDEN \* 3600\)\)/);
    expect(rumpfV).toMatch(/\[ "\$alter" -ge 0 \] && \[ "\$alter" -gt "\$grenze" \]/);
    // ⚠️ `-ge 0` gehoert dazu: ein Verzeichnis, das es NICHT gibt, liefert -1 und ist
    // nicht „verwaist" — dann haette `mkdir` ohnehin gegriffen. Ohne die Bedingung
    // liefe die Uebernahme gegen eine Sperre, die gar keine ist.
    expect(befehle).not.toMatch(/keine PID/);
  });

  it("ein FEHLGESCHLAGENER Lauf gibt die Sperre trotzdem frei", () => {
    // ⚠️ `lauf_ungesperrt; ergebnis=$?` waere hier die Falle: unter `set -e` risse das den
    // ganzen Prozess ab, sobald ein Lauf scheitert — VOR der Freigabe. Die naechste
    // Sicherung bliebe dann bis zur Altersgrenze ausgesperrt, wegen eines Fehlers, der
    // schon behoben sein koennte. Das `if` setzt `set -e` fuer den Aufruf aus.
    expect(befehle).toMatch(/if lauf_ungesperrt; then ergebnis=0; else ergebnis=\$\?; fi/);
    expect(befehle).toMatch(/trap sperre_ablegen EXIT/);
  });
});

describe("scripts/backup-sidecar.sh — was am Ziel geloescht werden darf", () => {
  it("die Rotation trifft NUR den Namen, den backup.sh erzeugt — nicht jedes `.tar.gz`", () => {
    // ⚠️ `*.tar.gz` WAERE HIER FALSCH, UND DER FEHLFALL LOESCHT FREMDE DATEN. Zeigt
    // `BACKUP_RCLONE_ZIEL` auf ein gemeinsam genutztes Verzeichnis — oder, viel
    // wahrscheinlicher, versehentlich eine Ebene ZU HOCH —, dann traefe die Endung jedes
    // fremde Archiv daneben, und die Rotation raeumte es mit weg. Die Endung allein sagt
    // nichts darueber, wer eine Datei geschrieben hat.
    //
    // Das Muster ist der Name aus `scripts/backup.sh` (`date +%Y%m%dT%H%M%S`), also feste
    // Breite ohne Trenner.
    // Acht Ziffern, `T`, sechs Ziffern, `.tar.gz` — der Name aus `date +%Y%m%dT%H%M%S`.
    // Die Gruppe MUSS geklammert sein: `\[0-9\]{8}` zaehlte sonst die schliessende
    // Klammer acht Mal und traefe nie.
    expect(befehle).toMatch(/TARBALL_MUSTER='(\[0-9\]){8}T(\[0-9\]){6}\.tar\.gz'/);
    expect(befehle).not.toContain("--include '*.tar.gz'");
    expect(befehle).toContain('--include "$TARBALL_MUSTER"');
    expect(befehle).toContain("deletefile");
    // `delete`/`purge` arbeiten auf dem VERZEICHNIS und kennen den Filter oben nicht.
    expect(befehle).not.toMatch(/rclone_ruf\s+(delete|purge)\b/);
  });

  it("gefiltert wird VOR dem Zaehlen — sonst verdraengen fremde Namen unsere Generationen", () => {
    // ⚠️ DIE REIHENFOLGE IST DER GANZE PUNKT, NICHT DIE EXISTENZ DES RIEGELS. GEMESSEN,
    // als der Riegel erst vor `deletefile` sass: liegt am Ziel etwas Fremdes
    // (`wichtig.txt`, `site-dump.tar.gz`), sortiert es sich nach `sort -r` VOR unsere
    // Zeitstempel, besetzt die „neuesten KEEP" Plaetze und schiebt damit JEDE echte
    // Generation in die Loeschliste — auch die gerade hochgeladene. Ergebnis der Messung
    // mit KEEP=2: die vier fremden Dateien ueberlebten alle, unsere waren restlos weg.
    // Ein Riegel, der bloss fremde Dateien vor dem Loeschen schuetzt, reicht also nicht.
    //
    // Das `case` ist damit der TRAGENDE Riegel und `--include` nur die Abkuerzung. Das
    // ist die richtige Verteilung: rclones Filtersyntax ist nicht die der Shell, und ob
    // sie Zeichenklassen so auswertet, sieht in diesem Repo kein Tor — es gibt kein
    // rclone im Laeufer. Das `case` dagegen ist POSIX und in dash, ash und bash gleich
    // gemessen (gegen eine Attrappe, die den Filter ignoriert: 2 eigene Generationen
    // behalten, alle 4 fremden Dateien unangetastet).
    const i = befehle.indexOf('case "$name" in');
    const j = befehle.indexOf('sort -r "$unsere"');
    expect(i, "die Liste wird per `case` gefiltert").toBeGreaterThan(-1);
    expect(j, "sortiert und gezaehlt wird die GEFILTERTE Liste").toBeGreaterThan(-1);
    expect(i).toBeLessThan(j);
    expect(befehle).toMatch(/case "\$name" in\s*\n\s*\$TARBALL_MUSTER\)/);
    // Und es bleibt nicht still: ein fremder Name gehoert jemand anderem.
    expect(befehle).toMatch(/sieht nicht wie eine Sicherung dieses Stacks aus/);
  });

  it("eine 0 oder ein Unsinnswert loescht NICHT alles, sondern gar nichts", () => {
    // ⚠️ GEMESSEN: `tail -n +$((KEEP + 1))` wird bei 0 zu `tail -n +1` und gibt die GANZE
    // Liste aus — jedes Archiv am Ziel wandert in die Loeschliste, auch das gerade
    // hochgeladene. Danach kehrt `auslagern` mit 0 zurueck, der Zustand steht auf `ok`
    // und der Ping meldet Erfolg: null Generationen am Ziel bei gruenem Lauf. Wer
    // abschalten will, schreibt `aus`; eine Null ist ein Tippfehler, und ein Tippfehler
    // darf keine Sicherungen kosten.
    const rumpfA = funktionsrumpf(befehle, "auslagern");
    expect(rumpfA).toMatch(/case "\$BACKUP_RCLONE_KEEP" in\s*\n\s*'' \| \*\[!0-9\]\*\)/);
    expect(rumpfA).toMatch(/\[ "\$BACKUP_RCLONE_KEEP" -lt 1 \]/);
    // Beide Wege gehen mit `return 0` heraus — geloescht wird nichts, der Upload selbst
    // war ja erfolgreich.
    const pruefung = rumpfA.indexOf('case "$BACKUP_RCLONE_KEEP" in');
    const rotation = rumpfA.indexOf("tail -n +$((BACKUP_RCLONE_KEEP + 1))");
    expect(pruefung).toBeGreaterThan(-1);
    expect(rotation).toBeGreaterThan(pruefung);
  });

  it("die Freigabe prueft den BESITZ, statt blind zu loeschen", () => {
    // ⚠️ `haelt_sperre` sagt nur, dass wir die Sperre EINMAL hatten — nicht, dass wir sie
    // noch haben. Verliert ein Lauf seine Pacht (Herzschlag tot, Container nach einer
    // Pause jenseits der Altersgrenze wieder da), uebernimmt ein anderer ordnungsgemaess
    // und setzt SEINE Marke; ein `rm -rf` von uns riss sie danach weg, und ein dritter
    // Lauf konnte neben dem zweiten starten. GEMESSEN: fremde Marke gesetzt, erster Lauf
    // beendet — die fremde Sperre war weg.
    const rumpfF = funktionsrumpf(befehle, "sperre_ablegen");
    expect(rumpfF).not.toMatch(/rm -rf/);
    // ⚠️ Der Besitznachweis ist jetzt `sperre_gehoert_uns` (Praefix statt exaktem
    // Namen), und weggeraeumt werden ALLE eigenen Generationen — waehrend einer Rotation
    // koennen kurz zwei dastehen.
    expect(rumpfF).toMatch(/if ! sperre_gehoert_uns; then/);
    expect(rumpfF).toMatch(/for eintrag in "\$SPERRVERZEICHNIS"\/\*/);
    expect(rumpfF).toMatch(/rmdir "\$eintrag"/);
    // Und das Verzeichnis selbst nur, wenn es danach leer ist.
    expect(rumpfF).toMatch(/rmdir "\$SPERRVERZEICHNIS" 2>\/dev\/null/);
    // Die Marke muss bei JEDER Belegung festgehalten werden, sonst gibt es nichts zu pruefen.
    expect(befehle).toMatch(/meine_marke="\$\(printf '%s%06d' "\$MARKE_PRAEFIX" 1\)"/);
  });

  it("`aus` schaltet die Rotation am Ziel ab, statt sie auf 0 zu setzen", () => {
    // Dieselbe Schreibweise wie `SUITE_HEALTH_URL=aus` in `scripts/deploy.sh`. Eine `0`
    // waere zweideutig — „nichts behalten" liest sich genauso.
    expect(befehle).toContain('[ "$BACKUP_RCLONE_KEEP" = "aus" ]');
  });

  it("ein gescheitertes Auslagern ist ein FEHLSCHLAG, kein gruener Lauf", () => {
    // ⚠️ GEMESSEN, ALS ES NOCH ANDERS WAR: `set -e` ist innerhalb einer Funktion
    // ausgesetzt, die als Bedingung eines `if` laeuft — und `lauf()` ruft
    // `if auslagern …`. Ein scheiterndes `rclone copy` brach damit nichts ab, der Rumpf
    // lief weiter, und zurueck kam der Status des LETZTEN Befehls. Ergebnis: „Lauf
    // fertig … ausgelagert", `letzter_status=ok`, gruener Healthcheck — und nichts
    // hochgeladen. Deshalb wird jeder rclone-Aufruf einzeln geprueft.
    expect(befehle).toMatch(/if ! rclone_ruf copy/);
    // Der ganze Zweck des Ziels ist der Fall „Server weg"; ein Lauf, der nur lokal
    // ankam, hat ihn nicht abgedeckt.
    expect(befehle).toContain("zustand_schreiben fehler");
  });

  it("ein GESPEICHERTER Fehlschlag wird nicht von der Anlaufspanne verdeckt", () => {
    // ⚠️ `start_period` STAND AUF 26 STUNDEN, UND DAS DECKTE ZU VIEL. Waehrend der Spanne
    // zaehlt Docker eine gescheiterte Probe nicht auf `retries` an — der Container bleibt
    // `starting`. `backup_data` ueberlebt ein `up -d --force-recreate` absichtlich, also
    // ueberlebt auch der Fehlschlag der letzten Nacht; er waere danach noch einen Tag
    // lang versteckt gewesen. Bei leerem BACKUP_PING_URL ist der Healthcheck das einzige
    // Signal, das es gibt.
    //
    // Getrennt wird das im Skript, nicht in der Spanne: „noch kein Lauf" ist ein eigener
    // Zweig mit eigenem Zeitbezug (dem Startvermerk), der Fehlschlag faellt sofort.
    const rumpfZ = funktionsrumpf(befehle, "zustand");
    const kein = rumpfZ.indexOf('if [ -z "$status" ]');
    const fehl = rumpfZ.indexOf('if [ "$status" != "ok" ]');
    expect(kein, "der Zweig „noch kein Lauf“ existiert").toBeGreaterThan(-1);
    expect(fehl, "der Zweig „gescheitert“ existiert").toBeGreaterThan(-1);
    expect(kein, "und er steht VOR dem Fehlschlag").toBeLessThan(fehl);
    // Der Startvermerk traegt den Zeitbezug — ohne ihn muesste die Spanne ihn ersetzen.
    expect(rumpfZ).toContain("gestartet");
    expect(befehle).toMatch(/zustand_bereit_vermerken/);
    // ⚠️ GESETZT, NICHT AUFGEFRISCHT: wuerde jeder Start ihn neu schreiben, setzte jeder
    // Neustart die Uhr zurueck, und ein Dienst, der oefter neu startet als er sichert,
    // meldete sich nie als ueberfaellig.
    // ⚠️ GESCHRIEBEN WIRD MIT `set -C`, NICHT NACH EINER LESEPRUEFUNG. Erst lesen, dann
    // schreiben hat ein Fenster: ein `einmal` daneben kann in der Zwischenzeit seinen
    // ERFOLG in dieselbe Datei legen, und das Ersetzen haette ihn verworfen — die
    // gelungene Sicherung vergessen, der Healthcheck meldet „noch kein Lauf". noclobber
    // macht daraus eine Operation, und sie deckt zugleich den Neustart ab: die Datei ist
    // da, also wird nichts geschrieben.
    const rumpfV = funktionsrumpf(befehle, "zustand_bereit_vermerken");
    expect(rumpfV).toMatch(/set -C/);
    expect(rumpfV, "kein Lesen-dann-Schreiben mehr").not.toMatch(/zustand_lesen/);
    expect(rumpfV, "und kein Ersetzen einer vorhandenen Datei").not.toMatch(/\bmv\b/);
    // Und die Spanne darf jetzt kurz sein — 26h waeren wieder die alte Decke.
    const spanne = kopfzeile(rumpf(backup, "healthcheck", 4), "start_period", 6) ?? "";
    const vorgabe = spanne.replace(/.*:-([^}]+)\}.*/, "$1");
    expect(vorgabe, "Vorgabe in Minuten oder Sekunden, nicht in Stunden").toMatch(/^\d+(s|m)$/);
  });

  it("ein Stand, der sich NICHT schreiben laesst, meldet sich sofort — nicht erst nach der Frist", () => {
    // ⚠️ ZWEI ARTEN, STILL ZU SCHEITERN, UND SIE SEHEN VERSCHIEDEN AUS. Beide auf einem
    // echten tmpfs gemessen, nicht hergeleitet:
    //
    //   VOLLES VOLUME:    jedes `printf` scheitert mit „I/O error", die Zwischendatei
    //                     bleibt LEER — und `mv` einer leeren Datei GELINGT. Rueckgabe 0,
    //                     und der gute Stand war durch eine leere Datei ersetzt:
    //                     `letzter_erfolg` weg, also genau die Angabe, aus der der
    //                     Healthcheck „ueberfaellig" ableitet.
    //   READ-ONLY VOLUME: schon die Umlenkung scheitert, Rueckgabe 1 — die niemand las.
    //                     Der alte `ok`-Stand blieb stehen, und der Healthcheck meldete
    //                     nach einem GESCHEITERTEN Lauf „gesund".
    //
    // Nach der Aenderung, beide Faelle: Rueckgabe 1, der vorhandene Stand UNANGETASTET,
    // Healthcheck sofort rot. Im Normalfall unveraendert 0 und gruen.
    const rumpfZ = funktionsrumpf(befehle, "zustand_schreiben");
    // Erst schreiben UND pruefen, dann erst `mv` — die Reihenfolge ist der Fix. Beide
    // Schritte haben einen eigenen Abbruchzweig, weil zwischen ihnen seit DRK-185 noch
    // die letzte Besitzpruefung liegt (eigener Fall weiter oben).
    const schreiben = rumpfZ.indexOf(`if ! printf '%s\\n' "$inhalt" >"$tmp"`);
    const umbenennen = rumpfZ.indexOf('if ! mv "$tmp"');
    expect(schreiben, "die Umlenkung wird geprueft").toBeGreaterThan(-1);
    expect(umbenennen, "und das Umbenennen auch").toBeGreaterThan(schreiben);
    expect(rumpfZ).toMatch(/rm -f "\$tmp"[\s\S]*return 1/);

    // ⚠️ DIE MARKE LIEGT AUSSERHALB DES VOLUMES, und das ist ihr ganzer Zweck: laesst
    // sich der Stand nicht schreiben, ist das Volume der Defekt — dort noch etwas
    // ablegen zu wollen waere zirkulaer. Der Healthcheck laeuft im selben Container.
    expect(befehle).toMatch(/NICHT_VERMERKT="\$\{TMPDIR:-\/tmp\}/);
    expect(befehle, "die Marke liegt NICHT im Backup-Volume").not.toMatch(
      /NICHT_VERMERKT="\$BACKUP_DIR/,
    );
    expect(rumpfZ).toMatch(/nicht_vermerkt_setzen/);
    // Und sie verschwindet wieder, sobald ein Lauf seinen Stand hinterlegen konnte —
    // sonst bliebe der Healthcheck nach der Reparatur des Volumes rot.
    expect(rumpfZ).toMatch(/nicht_vermerkt_loeschen/);

    // Im Healthcheck steht sie VOR jedem Lesen der Datei: ist der letzte Stand nicht
    // hinterlegt, ist alles in der Datei veraltet — und ein alter `ok` die
    // gefaehrlichste Auskunft von allen.
    const rumpfH = funktionsrumpf(befehle, "zustand");
    const marke = rumpfH.indexOf("NICHT_VERMERKT");
    const lesen = rumpfH.indexOf("zustand_lesen");
    expect(marke, "der Healthcheck kennt die Marke").toBeGreaterThan(-1);
    expect(marke, "und fragt sie VOR der Zustandsdatei ab").toBeLessThan(lesen);
  });

  it("eine Marke, die ein SPAETERER Erfolg ueberholt hat, haelt den Healthcheck nicht rot", () => {
    // ⚠️ DER DOKUMENTIERTE WIEDERHERSTELLUNGSWEG (Runbook F3b) LAEUFT IN EINEM EIGENEN
    // CONTAINER. Der Dienst setzt die Marke, der Betreiber raeumt das Volume frei und
    // faehrt die Sicherung mit `docker compose run --rm … einmal` nach: dieser Lauf
    // schreibt seinen Erfolg in den GEMEINSAMEN Stand, seine Marke liegt aber im `/tmp`
    // SEINES Containers und geht mit `--rm`. Die Marke des Dienstes blieb damit liegen,
    // und sein Healthcheck stand bis zu seinem naechsten planmaessigen Lauf auf rot —
    // obwohl die Sicherung liegt. GEMESSEN am ganzen Skript, nicht am Quelltext.
    const kladde = mkdtempSync(path.join(os.tmpdir(), "backup-marke-"));
    const pruefe = (markeInhalt: string, erfolgVor: number) => {
      const tmp = path.join(kladde, "tmp");
      const backups = path.join(kladde, "backups");
      for (const d of [tmp, backups]) {
        rmSync(d, { recursive: true, force: true });
        mkdirSync(d, { recursive: true });
      }
      writeFileSync(path.join(tmp, "backup-sidecar.nicht-vermerkt"), markeInhalt);
      const jetzt = Math.floor(Date.now() / 1000);
      writeFileSync(
        path.join(backups, ".zustand"),
        `letzter_status=ok\nletzte_meldung=Sicherung gelegt\nletzter_erfolg=${jetzt - erfolgVor}\n`,
      );
      const p = spawnSync("sh", [SIDECAR, "zustand"], {
        encoding: "utf8",
        env: { ...process.env, TMPDIR: tmp, BACKUP_DIR: backups },
      });
      return {
        code: p.status,
        aus: `${p.stdout}${p.stderr}`,
        markeNochDa: existsSync(path.join(tmp, "backup-sidecar.nicht-vermerkt")),
      };
    };
    try {
      const jetzt = Math.floor(Date.now() / 1000);
      // Der Erfolg ist NEUER als die Marke: der Stand ist nicht mehr veraltet.
      const ueberholt = pruefe(`${jetzt - 600}\n`, 60);
      expect(ueberholt.code, "gesund, die Sicherung liegt ja").toBe(0);
      expect(ueberholt.aus).toMatch(/ok, letzter Erfolg/);
      expect(ueberholt.markeNochDa, "und die veraltete Marke ist weg").toBe(false);
      // ⚠️ DIE GEGENPROBE IST DIE HAELFTE DER MESSUNG: ist die Marke JUENGER als der
      // Erfolg, klemmt das Volume noch — dann bleibt es rot, sonst haette diese
      // Aenderung genau die Auskunft zerstoert, um derentwillen es die Marke gibt.
      const frisch = pruefe(`${jetzt - 10}\n`, 60);
      expect(frisch.code, "die Marke ist juenger als der Erfolg").toBe(1);
      expect(frisch.aus).toMatch(/konnte seinen Stand nicht schreiben/);
      expect(frisch.markeNochDa, "und sie bleibt liegen").toBe(true);
      // Eine LEERE Marke stammt aus einer aelteren Fassung — sie ist nie ueberholbar und
      // gilt weiter. Lieber rot, das zu lange steht, als gruen, das zu frueh kommt.
      const leer = pruefe("", 60);
      expect(leer.code, "leere Marke gilt weiter").toBe(1);
      expect(leer.markeNochDa).toBe(true);
    } finally {
      rmSync(kladde, { recursive: true, force: true });
    }
    // ⚠️ STRIKT GROESSER: ein Erfolg in DERSELBEN Sekunde beweist die Reihenfolge nicht.
    const rumpfU = funktionsrumpf(befehle, "nicht_vermerkt_ueberholt");
    expect(rumpfU).toMatch(/\[ "\$nvu_erfolg" -gt "\$nvu_seit" \]/);
    // Und die Marke traegt seither einen Zeitstempel — leer waere sie nie ueberholbar.
    expect(befehle).toMatch(/nicht_vermerkt_setzen\(\) \{ printf '%s\\n' "\$\(date \+%s\)"/);
  });

  it("verlorener Besitz ist fuer den Aufrufer ein MISSERFOLG, kein stilles Weiter", () => {
    // ⚠️ DIESER ZWEIG STAND AUF `return 0` — und entwertete damit genau die Pruefung,
    // die der Aufrufer seit dem vorigen Commit macht: er konnte „nicht zustaendig" nicht
    // von „hinterlegt" unterscheiden, meldete Erfolg und frischte den Waechter auf gruen
    // auf. Wer die Sperre verloren hat, hat nichts hinterlegt.
    const rumpfZ = funktionsrumpf(befehle, "zustand_schreiben");
    const zweig = rumpfZ.slice(0, rumpfZ.indexOf("inhalt="));
    expect(zweig).toMatch(/if ! sperre_gehoert_uns; then[\s\S]*return 1/);
    expect(zweig, "kein `return 0` mehr in diesem Zweig").not.toMatch(/return 0/);

    // ⚠️ UND DAS GILT FUER BEIDE PRUEFUNGEN — die zweite, unmittelbar vor dem `mv`,
    // hatte ich beim Umstellen uebersehen und sie stand weiter auf 0. Veroeffentlicht
    // ist nicht veroeffentlicht, egal an welcher der beiden es haengenbleibt; eine 0
    // hier hiesse fuer den Erfolgspfad „hinterlegt", also ok-Ping und Exit 0 mit einem
    // fremden, aelteren Stand in der Datei. GEMESSEN, indem der Besitz genau zwischen
    // erster Pruefung und `mv` entzogen wurde: Fehler-Ping (?status=down), exit 1, der
    // Stand des anderen Laufs unveraendert.
    const pruefungen = (rumpfZ.match(/if ! sperre_gehoert_uns; then/g) ?? []).length;
    expect(pruefungen, "zwei Besitzpruefungen").toBe(2);
    const zweiter = rumpfZ.slice(rumpfZ.indexOf("inhalt="));
    const zweiterZweig = zweiter.slice(
      zweiter.indexOf("if ! sperre_gehoert_uns; then"),
      zweiter.indexOf('if ! mv "$tmp"'),
    );
    expect(zweiterZweig).toMatch(/return 1/);
    expect(zweiterZweig, "auch hier kein `return 0`").not.toMatch(/return 0/);
  });

  it("vor den Loeschungen am Ziel wird der Besitz erneut geprueft — auch je Datei", () => {
    // ⚠️ `rclone lsf` IST EINE NETZANFRAGE UND KANN LANGE BLOCKIEREN. Der Zaun davor hat
    // gemessen, wem die Sperre VOR dem Auflisten gehoerte; dazwischen liegt eine Leitung,
    // die haengen kann. Besonders bissig zusammen mit Fund 17: faellt die Reihenfolge der
    // Namen einmal im Jahr aus dem Tritt (Wiederholstunde), trifft die Loeschliste die
    // frische Generation des Nachfolgers statt der aeltesten.
    const rumpfA = funktionsrumpf(befehle, "auslagern");
    const nachListe = rumpfA.slice(rumpfA.indexOf("rclone_ruf lsf"));
    const vorSort = nachListe.slice(0, nachListe.indexOf("sort -r"));
    expect(vorSort, "nach dem Auflisten, vor dem Sortieren").toMatch(/sperre_gehoert_uns/);
    // Und in der Schleife selbst — jede Loeschung ist wieder eine Netzanfrage.
    const schleife = nachListe.slice(nachListe.indexOf("sort -r"));
    expect(schleife).toMatch(/if ! sperre_gehoert_uns; then[\s\S]*break/);
    // ⚠️ `break`, nicht `return`: das ist die Subshell einer Pipe, ein `return` wuerde
    // nur sie verlassen und die Funktion weiterlaufen lassen.
    expect(schleife, "kein return in der Pipe-Subshell").not.toMatch(
      /sperre_gehoert_uns; then[\s\S]{0,200}return/,
    );
  });

  it("auch WAEHREND des Auslagerns wird der Besitz noch einmal geprueft", () => {
    // ⚠️ DER ZAUN DAVOR SAGT NUR, DASS DIE SPERRE UNS GEHOERTE, ALS ES LOSGING. Ein
    // grosses Tarball ueber eine langsame Leitung ist genau die Strecke, auf der eine
    // angehaltene Maschine ihre Sperre verliert — und danach am Ziel weiterzurotieren
    // hiesse, die Generationen dessen wegzuraeumen, der inzwischen arbeitet. Und zwar
    // an der Stelle, die den Verlust des ganzen Servers abfangen soll.
    const rumpfA = funktionsrumpf(befehle, "auslagern");
    const pruefung = rumpfA.indexOf("sperre_gehoert_uns");
    const rotation = rumpfA.indexOf("Rotation am Ziel: die neuesten");
    expect(pruefung, "auslagern prueft den Besitz").toBeGreaterThan(-1);
    expect(pruefung, "und zwar VOR der Rotation am Ziel").toBeLessThan(rotation);
    // Das Hochladen selbst bleibt stehen — es ist nicht zerstoerend, und das Tarball
    // traegt einen eindeutigen Namen.
    expect(rumpfA.indexOf("rclone_ruf copy")).toBeLessThan(pruefung);
  });

  it("die lokale Rotation liegt HINTER dem Zaun, nicht in `backup.sh`", () => {
    // ⚠️ SIE STAND IN `backup.sh` UND LIEF DAMIT VOR JEDER PRUEFUNG. Ein Lauf, der die
    // Sperre unterwegs verloren hat, arbeitet sein `backup.sh` zu Ende — und rotiert
    // dabei das gemeinsame Verzeichnis. GEMESSEN mit BACKUP_KEEP=1 und einem
    // Nachfolger, der waehrenddessen seine Generation ablegt: sie war hinterher WEG.
    // Der Zaun kam zu spaet, weil er nach `backup.sh` sitzt.
    //
    // Nach der Aenderung, beide Lagen gemessen: Sperre verloren → Generation des
    // Nachfolgers bleibt · Sperre unsere, KEEP=2 → die zwei neuesten eigenen bleiben.
    expect(befehle).toMatch(/BACKUP_ROTATE=0 bash "\$BACKUP_SKRIPT"/);
    const rumpfL = funktionsrumpf(befehle, "lauf_ungesperrt");
    const zaun = rumpfL.indexOf("sperre_gehoert_uns");
    const rotieren = rumpfL.indexOf("lokal_rotieren");
    expect(rotieren, "der Lauf rotiert selbst").toBeGreaterThan(-1);
    expect(zaun, "und zwar NACH dem Zaun").toBeLessThan(rotieren);

    // ⚠️ DIESELBEN ZWEI RIEGEL WIE AM ZIEL, und beide sind dort aus gemessenen Fehlern
    // entstanden: nur die eigenen Namen (im Volume liegen auch `.zustand` und die
    // Sperre), und eine 0 loescht NICHTS statt alles.
    const rumpfR = funktionsrumpf(befehle, "lokal_rotieren");
    expect(rumpfR).toMatch(/\$TARBALL_MUSTER\)/);
    expect(rumpfR).toMatch(/-lt 1 \]; then[\s\S]*return 0/);
    expect(rumpfR).toMatch(/\*\[!0-9\]\*\)[\s\S]*return 0/);
  });

  it("vor JEDER lokalen Loeschung wird der Besitz erneut geprueft", () => {
    // ⚠️ DER ZAUN IN `lauf_ungesperrt` MISST, WEM DIE SPERRE VOR DEM AUFLISTEN GEHOERTE
    // — und dazwischen liegt ein `backup.sh`-Lauf, der Minuten dauern kann. Haelt die
    // Maschine dort an, arbeitet danach ein anderer Lauf, und `ls -1t` stellt DESSEN
    // Tarball nach vorn: es ist das juengste, auch waehrend es noch WAECHST. Mit
    // BACKUP_KEEP=1 beginnt die Loeschliste damit bei unserer letzten FERTIGEN
    // Generation. GEMESSEN, mit einer Sperre, in der nur die Marke des Nachfolgers liegt.
    //
    // Der lokale Fall ist teurer als derselbe am Ziel: dort gibt es die Generationen
    // noch, hier bliebe eine halb geschriebene Datei als einzige zurueck.
    const kladde = mkdtempSync(path.join(os.tmpdir(), "backup-lokrot-"));
    const rotiere = (fremdeMarke: boolean) => {
      const dir = path.join(kladde, "backup");
      const sperre = path.join(kladde, "sperre");
      for (const d of [dir, sperre]) {
        rmSync(d, { recursive: true, force: true });
        mkdirSync(d, { recursive: true });
      }
      // Unsere fertige Generation von gestern, dazu das wachsende Tarball des
      // Nachfolgers — juenger, also fuer `ls -1t` das erste.
      writeFileSync(path.join(dir, "20260916T033000.tar.gz"), "");
      const gestern = new Date(Date.now() - 3600_000);
      utimesSync(path.join(dir, "20260916T033000.tar.gz"), gestern, gestern);
      writeFileSync(path.join(dir, "20260917T033000.tar.gz"), "");
      mkdirSync(path.join(sperre, fremdeMarke ? "eigner.bbbb.1.000001" : "eigner.aaaa.1.000001"));
      const quelle = [
        sidecar.split("\n").find((z) => z.startsWith("TARBALL_MUSTER=")) ?? "",
        ...["protokoll", "warne", "entnullen", "sperre_gehoert_uns", "lokal_rotieren"].map(
          shellQuelle,
        ),
        `BACKUP_DIR=${dir}`,
        `SPERRVERZEICHNIS=${sperre}`,
        'MARKE_PRAEFIX="eigner.aaaa.1."',
        'meine_marke="eigner.aaaa.1.000001"',
        "BACKUP_KEEP=1",
        "lokal_rotieren",
      ].join("\n");
      execFileSync("sh", ["-c", quelle], { encoding: "utf8", stdio: "pipe" });
      return readdirSync(dir).sort();
    };
    try {
      expect(rotiere(true), "Sperre verloren: es wird NICHTS geloescht").toEqual([
        "20260916T033000.tar.gz",
        "20260917T033000.tar.gz",
      ]);
      // ⚠️ Die Gegenprobe ist die Haelfte der Messung: mit der eigenen Marke rotiert es
      // unveraendert weiter, sonst hiesse „nichts geloescht" nur „die Funktion tut nichts".
      expect(rotiere(false), "Sperre unsere: die aelteste geht wie bisher").toEqual([
        "20260917T033000.tar.gz",
      ]);
    } finally {
      rmSync(kladde, { recursive: true, force: true });
    }
    // `break` statt `return`: die Schleife ist die Subshell einer Pipe — dieselbe Falle
    // wie bei der Rotation am Ziel.
    const schleife = funktionsrumpf(befehle, "lokal_rotieren");
    const ab = schleife.indexOf("tail -n +$((keep + 1))");
    expect(ab, "die Loeschschleife steht da").toBeGreaterThan(-1);
    expect(schleife.slice(ab)).toMatch(/if ! sperre_gehoert_uns; then[\s\S]*break/);
  });

  it("ein gescheiterter Ping schreibt die Kennung NICHT ins Protokoll", () => {
    // ⚠️ WER DIE URL HAT, KANN DEM WAECHTER „BACKUP GESUND" MELDEN. Beide unterstuetzten
    // Dienste tragen ihre Kennung IM Pfad (healthchecks.io `/<uuid>`, Uptime Kuma
    // `/api/push/<token>`), und die Fehler-URL kann Zugangsdaten in der Abfrage fuehren.
    // Containerprotokolle liegen breiter als die `.env`: `docker compose logs`, jede
    // Protokollsammlung, jeder Screenshot in einem Ticket.
    const rumpfP = funktionsrumpf(befehle, "ping_senden");
    const warnung = rumpfP.slice(rumpfP.indexOf("warne "));
    expect(warnung, "die Warnung nennt nur den gekuerzten Host").toMatch(
      /ping_ziel_kurz "\$ziel"/,
    );
    expect(warnung, "und nicht die ganze URL").not.toMatch(/warne "Ping an \$ziel/);
    // ⚠️ AB HIER WIRD GEMESSEN STATT GESCANNT. Ein Quelltext-Scan auf
    // `${ohne_schema%%/*}` haette die Luecke, die diesen Block ausloeste, NICHT gesehen:
    // die Zeile stand richtig da, sie deckte nur einen Fall nicht ab. Eine
    // Zeichenkette, die eine Kennung enthaelt oder nicht, ist eine Frage an die Shell,
    // also fragen wir sie — die Funktion wird aus dem Skript geschnitten und in `sh`
    // ausgefuehrt.
    for (const [url, erwartet] of [
      // Beide unterstuetzten Dienste: Kennung im Pfad.
      ["https://hc-ping.com/8f3a-uuid", "https://hc-ping.com"],
      ["https://kuma.example/api/push/tok?status=up", "https://kuma.example"],
      // ⚠️ DER FUND: eine URL OHNE Pfad. Der Schnitt am Schraegstrich greift hier nicht,
      // und vor der Korrektur stand `https://monitor.example?token=geheim` vollstaendig
      // im Protokoll — gemessen, nicht vermutet.
      ["https://monitor.example?token=geheim", "https://monitor.example"],
      ["https://monitor.example#frag", "https://monitor.example"],
      ["https://monitor.example?a=1#f", "https://monitor.example"],
      // Zugangsdaten vor dem Host, mit und ohne Pfad.
      // ⚠️ ZUSAMMENGESETZT STATT ALS LITERAL, und das ist kein Stilmittel: ein
      // `name:wort@host` im Quelltext ist fuer jeden Geheimnis-Scanner ein „Basic Auth
      // String" — GitGuardian hat genau diese Zeile als Vorfall gemeldet. Ein erfundener
      // Wert in einem Test ist kein Geheimnis, aber eine Meldung, die jedes Mal
      // wegerklaert werden muss, stumpft die naechste ab. Gemessen wird derselbe Fall:
      // `ping_ziel_kurz` bekommt die fertige Zeichenkette.
      [mitZugang("waechter.example/ping/xyz"), "https://waechter.example"],
      [mitZugang("host?token=x"), "https://host"],
      // Ein Port ist keine Kennung und bleibt stehen — sonst waere die Auskunft wertlos.
      ["http://192.168.1.5:3001/api/push/tok", "http://192.168.1.5:3001"],
    ] as const) {
      expect(kurzeForm(url), `${url} wird gekuerzt`).toBe(erwartet);
    }
  });

  it("`/fail` steht VOR der Abfrage — sonst meldet der Fehlfall GESUND", () => {
    // ⚠️ DER FUND: `$BACKUP_PING_URL/fail` haengt an, statt einzusetzen. GEMESSEN gegen
    // einen mitschreibenden HTTP-Server, was dort ankommt:
    //
    //   .../uuid?rid=abc  + /fail  → Server sieht /uuid?rid=abc/fail  ← Pfad ist /uuid
    //   .../uuid#anker    + /fail  → Server sieht /uuid              ← /fail ist WEG
    //
    // Beide Male trifft der Ruf den ERFOLGS-Endpunkt: ein gescheiterter Lauf meldet
    // sich als gesund. Dieselbe Klasse wie der Uptime-Kuma-Fund — eine Ueberwachung,
    // die das Gegenteil behauptet, ist schlimmer als keine. healthchecks.io haengt an
    // seine Ping-URLs durchaus etwas an (`?rid=` fuer die Lauf-Kennung), der Fall ist
    // also nicht konstruiert.
    const fehlerUrl = (url: string) =>
      shellSkript(["fehler_url"], 'fehler_url "$1"', url);
    for (const [url, erwartet] of [
      // Der gewoehnliche Fall bleibt Zeichen fuer Zeichen, wie er war.
      ["https://hc-ping.com/uuid", "https://hc-ping.com/uuid/fail"],
      // Abfrage und Anker bleiben ERHALTEN und stehen hinter dem `/fail`.
      ["https://hc-ping.com/uuid?rid=abc", "https://hc-ping.com/uuid/fail?rid=abc"],
      ["https://hc-ping.com/uuid#anker", "https://hc-ping.com/uuid/fail#anker"],
      ["https://hc-ping.com/uuid?a=1#f", "https://hc-ping.com/uuid/fail?a=1#f"],
      // Eine URL ganz ohne Pfad — derselbe Randfall, der die Kuerzung gekostet hat.
      ["https://monitor.example?token=x", "https://monitor.example/fail?token=x"],
      // Ein Schraegstrich am Ende ergaebe `/uuid//fail`, einen Pfad, den es nicht gibt.
      ["https://hc-ping.com/uuid/", "https://hc-ping.com/uuid/fail"],
    ] as const) {
      expect(fehlerUrl(url), `${url} bekommt /fail in den PFAD`).toBe(erwartet);
    }
    // ⚠️ Und der ganze Weg, mit einer `curl`-Attrappe statt einer Behauptung ueber den
    // Quelltext: so kann kein kuenftiges `"$BACKUP_PING_URL/fail"` daneben entstehen.
    const kladde = mkdtempSync(path.join(os.tmpdir(), "backup-fail-"));
    try {
      mkdirSync(path.join(kladde, "bin"));
      writeFileSync(
        path.join(kladde, "bin/curl"),
        `#!/bin/sh\nfor a in "$@"; do case "$a" in http*) echo "$a" >>${kladde}/pings ;; esac; done\nexit 0\n`,
      );
      chmodSync(path.join(kladde, "bin/curl"), 0o755);
      const quelle = [
        `SPERRVERZEICHNIS=${kladde}/sperre`,
        'BACKUP_PING_URL="https://hc-ping.com/uuid?rid=abc"',
        'BACKUP_PING_URL_FEHLER=""',
        ...["protokoll", "warne", "ping_ziel_kurz", "fehler_url", "ping_senden", "sperre_gehoert_uns"].map(
          shellQuelle,
        ),
        'MARKE_PRAEFIX="eigner.aaaa.1."',
        'mkdir -p "$SPERRVERZEICHNIS"',
        'meine_marke="${MARKE_PRAEFIX}000001"',
        'mkdir "$SPERRVERZEICHNIS/$meine_marke"',
        "ping_senden ok >/dev/null",
        "ping_senden fehler >/dev/null",
      ].join("\n");
      execFileSync("sh", ["-c", quelle], {
        encoding: "utf8",
        stdio: "pipe",
        env: { ...process.env, PATH: `${kladde}/bin:${process.env.PATH}` },
      });
      expect(
        readFileSync(path.join(kladde, "pings"), "utf8").trim().split("\n"),
        "der Erfolgsruf bleibt unveraendert, der Fehlerruf trifft /uuid/fail",
      ).toEqual([
        "https://hc-ping.com/uuid?rid=abc",
        "https://hc-ping.com/uuid/fail?rid=abc",
      ]);
    } finally {
      rmSync(kladde, { recursive: true, force: true });
    }
    // ⚠️ Das Fragezeichen steht in einer ZEICHENKLASSE. Ausserhalb waere es das Muster
    // fuer ein beliebiges Zeichen und schnitte alles weg — die Falle aus der Kuerzung.
    expect(funktionsrumpf(befehle, "fehler_url")).toMatch(/\$\{1%%\[\?#\]\*\}/);
  });

  it("ein ueberholter Lauf faelscht den Waechter NICHT auf rot", () => {
    // ⚠️ `auslagern` gibt bei verlorener Sperre 1 zurueck, und der Zweig in
    // `lauf_ungesperrt` liest das als „Auslagern gescheitert" — mit Fehler-Ping. Steht
    // der Nachfolger in der Zwischenzeit fertig und hat „ok" gemeldet, kippt der
    // Nachzuegler den Waechter danach auf ROT, obwohl die juengste Sicherung liegt.
    // `.zustand` bleibt dabei `ok`, weil dessen Schreibweg den Besitz schon prueft —
    // zwei Signale, die sich widersprechen, und das lautere ist das falsche.
    //
    // Gemessen wird der ganze Ablauf mit einer `curl`-Attrappe: A belegt, verliert die
    // Sperre, B meldet ok, A wacht auf und will Fehlschlag melden.
    const kladde = mkdtempSync(path.join(os.tmpdir(), "backup-ping-"));
    try {
      mkdirSync(path.join(kladde, "bin"));
      writeFileSync(
        path.join(kladde, "bin/curl"),
        `#!/bin/sh\nfor a in "$@"; do case "$a" in http*) echo "$a" >>${kladde}/pings ;; esac; done\nexit 0\n`,
      );
      chmodSync(path.join(kladde, "bin/curl"), 0o755);
      const quelle = [
        `SPERRVERZEICHNIS=${kladde}/sperre`,
        'BACKUP_PING_URL="https://hc-ping.com/uuid"',
        'BACKUP_PING_URL_FEHLER=""',
        ...[
          "protokoll",
          "warne",
          "ping_ziel_kurz",
          "fehler_url",
          "ping_senden",
          "sperre_gehoert_uns",
        ].map(shellQuelle),
        // A belegt die Sperre.
        'MARKE_PRAEFIX="eigner.aaaa.1."',
        'mkdir -p "$SPERRVERZEICHNIS"',
        'meine_marke="${MARKE_PRAEFIX}000001"',
        'mkdir "$SPERRVERZEICHNIS/$meine_marke"',
        // Die Maschine haelt an; B uebernimmt, sichert und meldet ok.
        'rm -r "$SPERRVERZEICHNIS/$meine_marke"; rmdir "$SPERRVERZEICHNIS"',
        'mkdir "$SPERRVERZEICHNIS"; mkdir "$SPERRVERZEICHNIS/eigner.bbbb.1.000001"',
        '( MARKE_PRAEFIX="eigner.bbbb.1."; meine_marke="eigner.bbbb.1.000001"; ping_senden ok ) >/dev/null',
        // A wacht auf und will seinen Fehlschlag melden.
        "ping_senden fehler >/dev/null",
        // Gegenprobe: A haelt die Sperre wieder und meldet einen ECHTEN Fehlschlag.
        'rm -r "$SPERRVERZEICHNIS/eigner.bbbb.1.000001"; mkdir "$SPERRVERZEICHNIS/$meine_marke"',
        "ping_senden fehler >/dev/null",
      ].join("\n");
      execFileSync("sh", ["-c", quelle], {
        encoding: "utf8",
        stdio: "pipe",
        env: { ...process.env, PATH: `${kladde}/bin:${process.env.PATH}` },
      });
      const rufe = readFileSync(path.join(kladde, "pings"), "utf8").trim().split("\n");
      // Genau zwei: Bs ok und der ECHTE Fehlschlag danach — nicht der des Nachzueglers.
      expect(rufe, "der ueberholte Lauf ruft NICHT an").toEqual([
        "https://hc-ping.com/uuid",
        "https://hc-ping.com/uuid/fail",
      ]);
    } finally {
      rmSync(kladde, { recursive: true, force: true });
    }
    // ⚠️ Und die Pruefung sitzt in `ping_senden` selbst, nicht an den fuenf
    // Aufrufstellen — dieselbe Entscheidung wie bei `zustand_schreiben`, damit keine
    // kuenftige Stelle sie vergessen kann.
    expect(funktionsrumpf(befehle, "ping_senden")).toMatch(/if ! sperre_gehoert_uns; then/);
  });

  it("ein Erfolg, den niemand festhalten kann, wird NICHT als Erfolg gemeldet", () => {
    // ⚠️ DER RUECKGABEWERT STAND HIER UNGEPRUEFT — und das faellt nur deshalb nicht auf,
    // weil `lauf()` diese Funktion als `if`-Bedingung ruft: `set -e` ist darin
    // ausgesetzt, es ging also weiter zu `ping_senden ok` und `return 0`.
    //
    // GEMESSEN auf einem read-only tmpfs, mit demselben `if` wie in `lauf()`:
    //
    //   WARNUNG: Der Stand liess sich NICHT schreiben (ok: …)
    //   Ping (ok) abgesetzt.             ← der WAECHTER wird auf gruen aufgefrischt
    //   lauf_ungesperrt meldete: exit=0  ← und SUITE_BACKUP_CMD meldet dem Rollout Erfolg
    //
    // Dieselbe Klasse wie der Uptime-Kuma-Fund: eine Ueberwachung, die im Ernstfall das
    // Gegenteil behauptet, ist schlimmer als keine. Dass der Healthcheck ueber die Marke
    // rot steht, rettet es nicht — der Ping ist der Weg, der auch ein totes
    // Container-Gespann meldet, und genau der sagte „alles gut".
    //
    // Nach der Aenderung, beide Lagen gemessen: read-only → EXIT=1 und Fehler-Ping
    // (`?status=down`); schreibbar → EXIT=0 und ok-Ping.
    const rumpfL = funktionsrumpf(befehle, "lauf_ungesperrt");
    expect(rumpfL).toMatch(/if ! zustand_schreiben ok "\$meldung"; then/);
    // Und die Reaktion ist vollstaendig: melden, Waechter warnen, scheitern.
    const zweig = rumpfL.slice(rumpfL.indexOf('if ! zustand_schreiben ok "$meldung"; then'));
    const bisEnde = zweig.slice(0, zweig.indexOf("ping_senden ok"));
    expect(bisEnde).toMatch(/warne /);
    expect(bisEnde).toMatch(/ping_senden fehler/);
    expect(bisEnde).toMatch(/return 1/);
    // ⚠️ Der ok-Ping darf NUR auf dem Weg liegen, auf dem der Stand auch geschrieben
    // wurde — sonst waere die Pruefung eine Verzierung.
    expect(rumpfL.indexOf("ping_senden ok")).toBeGreaterThan(
      rumpfL.indexOf('if ! zustand_schreiben ok "$meldung"; then'),
    );
  });

  it("die Eignermarke traegt eine Kennung, die den CONTAINER unterscheidet", () => {
    // ⚠️ `$$` ALLEIN IST HIER NICHT EINDEUTIG. Der Dienst laeuft als
    // `command: ["/bin/sh", …, "dienst"]` ohne Entrypoint — die Shell ist PID 1 im
    // Container; `docker compose run --rm backup … einmal` startet einen EIGENEN
    // Container, und dort ist sie ebenfalls PID 1. Beide leiteten daraus dasselbe
    // `eigner.1.` ab, und die Sperre liegt in einem Volume, das beide sehen. GEMESSEN
    // mit zwei Prozessen desselben Praefix und einer Uebernahme dazwischen:
    //
    //   A haelt:        eigner.1.000001
    //   B haelt jetzt:  eigner.1.000001
    //   A sagt: SPERRE GEHOERT MIR   ← falsch, B haelt sie
    //
    // Damit faellt genau die Zusicherung, auf der alles andere hier steht: A rotiert
    // weiter, schreibt den Stand und raeumt bei der Freigabe die Sperre des Nachfolgers
    // weg. Die Identitaetsbindung war da, sie war nur nicht identifizierend.
    expect(befehle).toMatch(/LAUF_KENNUNG="\$\(eigner_kennung\)\.\$\$"/);
    expect(befehle).toMatch(/MARKE_PRAEFIX="eigner\.\$LAUF_KENNUNG\."/);
    expect(befehle, "die PID allein reicht nicht").not.toMatch(
      /MARKE_PRAEFIX="eigner\.\$\$\."/,
    );
    // ⚠️ DIESELBE KENNUNG TRAEGT DIE ZWISCHENDATEI DES STANDES, und aus demselben Grund:
    // `.zustand.neu.$$` war in beiden Containern derselbe Pfad. GEMESSEN — der ueberholte
    // Lauf raeumt in seinem Besitz-Fehlzweig `rm -f "$tmp"` und traf die Zwischendatei
    // DES ANDEREN: „B: Zwischendatei WEG", und veroeffentlicht wurde der Stand von
    // vorgestern. Die andere Richtung veroeffentlichte fremden Inhalt unter diesem Lauf.
    expect(funktionsrumpf(befehle, "zustand_schreiben")).toMatch(
      /tmp="\$ZUSTANDSDATEI\.neu\.\$LAUF_KENNUNG"/,
    );
    // Gemessen statt gescannt: zwei Aufrufe muessen VERSCHIEDENE Kennungen liefern —
    // eine Konstante bestuende jeden Quelltext-Scan und waere trotzdem wertlos.
    const kennung = () => shellSkript(["eigner_kennung"], "eigner_kennung");
    const a = kennung();
    const b = kennung();
    expect(a, "nie leer — ein leeres Praefix passte per `case` auf JEDEN Namen").not.toBe("");
    expect(a).toMatch(/^[a-z0-9]+$/);
    expect(a, "zwei Aufrufe, zwei Kennungen").not.toBe(b);
    // ⚠️ Nur Hexziffern: das Praefix wird als `case`-MUSTER benutzt, ein `*` oder `?`
    // darin traefe fremde Marken mit.
    const rumpfK = funktionsrumpf(befehle, "eigner_kennung");
    expect(rumpfK).toMatch(/tr -dc/);
    // Drei Quellen — und die letzte nur, damit die Kennung nie leer bleibt.
    expect(rumpfK).toMatch(/\/proc\/sys\/kernel\/random\/uuid/);
    expect(rumpfK).toMatch(/\/dev\/urandom/);
    expect(rumpfK).toMatch(/hostname/);
  });

  it("der Herzschlag HAELT die Sperre, statt ihren Namen nachzuschlagen", () => {
    // ⚠️ DER FUND: zwischen der Pruefung „liegt meine Marke noch da?" und dem `mkdir`
    // der naechsten Generation passt eine ganze Uebernahme — `rmdir` plus `mkdir`, also
    // ein Verzeichnis mit demselben NAMEN und einem anderen Inode. Mit einem ABSOLUTEN
    // Pfad legt der alte Herzschlag seine Marke danach in die Sperre des NACHFOLGERS.
    //
    // Angehalten wird dafuer von AUSSEN, nicht im Skript: eine `mkdir`-Attrappe im Pfad
    // haelt genau den Herzschlag-Ruf an (Generation 000002), die Uebernahme laeuft in
    // diesem Moment, danach gibt die Attrappe den echten Aufruf frei. Der gemessene
    // Ablauf ist damit unveraendert der des Skripts.
    const kladde = mkdtempSync(path.join(os.tmpdir(), "backup-herz-"));
    const lauf = (quelleDerFunktion: string) => {
      const S = path.join(kladde, "sperre");
      rmSync(S, { recursive: true, force: true });
      for (const f of ["angekommen", "tor"]) rmSync(path.join(kladde, f), { force: true });
      writeFileSync(
        path.join(kladde, "bin/mkdir"),
        `#!/bin/sh\ncase "$*" in *eigner.aaaa.1.000002*)\n  : > ${kladde}/angekommen\n  n=0\n  while [ ! -e ${kladde}/tor ] && [ $n -lt 4000000 ]; do n=$((n + 1)); done\n  ;;\nesac\nexec /bin/mkdir "$@"\n`,
      );
      chmodSync(path.join(kladde, "bin/mkdir"), 0o755);
      const quelle = [
        quelleDerFunktion,
        `SPERRVERZEICHNIS=${S}`,
        'BACKUP_HERZSCHLAG_SEKUNDEN=1',
        'MARKE_PRAEFIX="eigner.aaaa.1."',
        'meine_marke="eigner.aaaa.1.000001"',
        `/bin/mkdir "$SPERRVERZEICHNIS" "$SPERRVERZEICHNIS/$meine_marke"`,
        "herzschlag_starten",
        // Warten, bis der Herzschlag zwischen Pruefung und Anlegen steht.
        `n=0; while [ ! -e ${kladde}/angekommen ] && [ $n -lt 4000000 ]; do n=$((n + 1)); done`,
        // JETZT die Uebernahme, genau in diesem Fenster.
        'rmdir "$SPERRVERZEICHNIS/$meine_marke"; rmdir "$SPERRVERZEICHNIS"',
        '/bin/mkdir "$SPERRVERZEICHNIS" "$SPERRVERZEICHNIS/eigner.bbbb.1.000001"',
        `: > ${kladde}/tor`,
        // Dem freigegebenen Ruf Zeit lassen, danach ernten und nachsehen.
        "n=0; while [ $n -lt 400000 ]; do n=$((n + 1)); done",
        'kill "$herzschlag_pid" 2>/dev/null; wait "$herzschlag_pid" 2>/dev/null',
        'ls "$SPERRVERZEICHNIS"',
      ].join("\n");
      return execFileSync("sh", ["-c", quelle], {
        encoding: "utf8",
        stdio: "pipe",
        env: { ...process.env, PATH: `${path.join(kladde, "bin")}:${process.env.PATH}` },
      })
        .trim()
        .split("\n")
        .filter(Boolean);
    };
    try {
      mkdirSync(path.join(kladde, "bin"));
      // Ein `sleep`, das sofort zurueckkehrt — sonst braeuchte der Fall eine Sekunde je
      // Runde. Der Takt ist hier nicht das Gemessene.
      writeFileSync(path.join(kladde, "bin/sleep"), "#!/bin/sh\nexit 0\n");
      chmodSync(path.join(kladde, "bin/sleep"), 0o755);
      const echt = shellQuelle("herzschlag_starten");
      // ⚠️ DIE GEGENPROBE IST DIE HAELFTE DER MESSUNG: dieselbe Funktion, nur wieder mit
      // absoluten Pfaden. Ohne sie wiese der Fall nur nach, dass gerade nichts passiert.
      const mitAbsolutenPfaden = echt
        .replace(/ *cd "\$SPERRVERZEICHNIS" 2>\/dev\/null \|\| exit 0\n/, "")
        .replace(/\[ -d "\$marke" \]/g, '[ -d "$SPERRVERZEICHNIS/$marke" ]')
        .replace(/mkdir "\$neu"/, 'mkdir "$SPERRVERZEICHNIS/$neu"')
        .replace(/rmdir "\$marke"/, 'rmdir "$SPERRVERZEICHNIS/$marke"');
      expect(mitAbsolutenPfaden, "die Gegenprobe unterscheidet sich wirklich").not.toBe(echt);
      expect(mitAbsolutenPfaden).not.toMatch(/cd "\$SPERRVERZEICHNIS"/);

      const alt = lauf(mitAbsolutenPfaden);
      expect(
        alt.filter((e) => e.startsWith("eigner.aaaa.")),
        "mit absolutem Pfad landet die Marke in der Sperre des Nachfolgers",
      ).not.toEqual([]);

      const jetzt = lauf(echt);
      expect(
        jetzt,
        "festgehalten: in der Sperre des Nachfolgers liegt NUR dessen eigene Marke",
      ).toEqual(["eigner.bbbb.1.000001"]);
    } finally {
      rmSync(kladde, { recursive: true, force: true });
    }
    // ⚠️ Die Folge waere beidseitig, und das macht sie teuer: gemessen an der Lage aus
    // dem Fall oben meldet `sperre_gehoert_uns` fuer BEIDE Seiten „enteignet" — der
    // Nachfolger sieht die fremde Marke, der alte Lauf die des Nachfolgers. Zwei
    // gesunde Laeufe treten zurueck, und dazwischen liegt eine Weile, in der beide
    // gleichzeitig `backup.sh` fahren.
    const rumpfH = funktionsrumpf(befehle, "herzschlag_starten");
    // ⚠️ ERST DIE EXISTENZ, DANN DER AUSSCHNITT. `indexOf` liefert sonst −1, `slice(-1)`
    // nimmt das letzte Zeichen, und die Zusicherung darunter prueft eine Zeichenkette,
    // die mit der Funktion nichts mehr zu tun hat — genau die Sorte wertloser Zusicherung,
    // die dieser PR schon zweimal aufgeraeumt hat.
    const ab = rumpfH.indexOf('cd "$SPERRVERZEICHNIS"');
    expect(ab, "die Sperre wird festgehalten").toBeGreaterThan(-1);
    const schleife = rumpfH.slice(ab);
    expect(schleife, "und nichts darin wird ueber den Namen nachgeschlagen").not.toMatch(
      /\$SPERRVERZEICHNIS\//,
    );
  });

  it("die Freigabe ERNTET den Herzschlag ab und wiederholt die Raeumung", () => {
    // ⚠️ `kill` BITTET NUR. Ohne `wait` kehrt `herzschlag_beenden` zurueck, waehrend der
    // Herzschlag noch eine ganze Runde dreht — er koennte danach BELIEBIG viele weitere
    // Marken anlegen, und die Freigabe darunter raeumte ins Leere.
    const rumpfH = funktionsrumpf(befehle, "herzschlag_beenden");
    expect(rumpfH).toMatch(/kill "\$herzschlag_pid"/);
    expect(rumpfH, "geerntet wird mit `wait`").toMatch(/wait "\$herzschlag_pid"/);
    expect(
      rumpfH.indexOf('wait "$herzschlag_pid"'),
      "und zwar NACH dem kill",
    ).toBeGreaterThan(rumpfH.indexOf('kill "$herzschlag_pid"'));
    // `|| true`, sonst bricht `set -e` am Beendigungsgrund (SIGTERM = 143) ab — im
    // EXIT-Trap ausgerechnet.
    expect(rumpfH).toMatch(/wait "\$herzschlag_pid" 2>\/dev\/null \|\| true/);

    // ⚠️ DER HERZSCHLAG IST TOT, SEIN `mkdir` KANN ES NOCH NICHT SEIN: `wait` erntet die
    // Subshell ab, nicht aber das `mkdir`, das sie als eigenen Prozess gestartet hatte.
    // Landet diese eine Marke zwischen Auflistung und `rmdir`, bleibt die Sperre LIEGEN
    // — mit einer Marke, der kein Prozess mehr entspricht; jeder folgende Lauf wartet
    // dann bis zur Altersgrenze (Vorgabe 6h).
    //
    // ⚠️ GEMESSEN IN ALLEN VIER ZUSAMMENSTELLUNGEN, weil der naheliegende Schluss
    // („dann ernte den Herzschlag eben ab") nachweislich danebengeht — je 150 Runden
    // mit einem 20ms-Takt:
    //
    //                          eine Raeumung     Raeumung wiederholt
    //   bash, ohne `wait`        51 / 150              0 / 150
    //   bash, mit `wait`         53 / 150              0 / 150
    //   dash, mit `wait`          1 / 150              0 / 150
    //
    // Es ist die Wiederholung, die traegt; `wait` liefert nur die Schranke „hoechstens
    // EIN Nachzuegler", ohne die eine begrenzte Wiederholung nichts zusichert.
    const rumpfA = funktionsrumpf(befehle, "sperre_ablegen");
    expect(rumpfA, "die Raeumung laeuft mehrfach").toMatch(/while \[ "\$versuch" -le 3 \]/);
    // Dass das `rmdir` des VERZEICHNISSES gelingt, ist zugleich der Riegel gegen den
    // Nachzuegler: ein `mkdir` hinein scheitert danach. Deshalb bricht die Schleife
    // genau darauf ab — nicht nach fester Rundenzahl.
    expect(rumpfA).toMatch(/rmdir "\$SPERRVERZEICHNIS" 2>\/dev\/null && break/);
    // In der Wiederholung ist der Besitz nicht erneut geprueft — also nur eigene Marken.
    const schleife = rumpfA.slice(rumpfA.indexOf('while [ "$versuch" -le 3 ]'));
    expect(schleife, "nur EIGENE Generationen").toMatch(/"\$MARKE_PRAEFIX"\*\)/);
    // Und der Herzschlag muss VOR der Raeumung tot sein, sonst ist die Schranke „ein
    // Nachzuegler" keine.
    expect(rumpfA.indexOf("herzschlag_beenden")).toBeGreaterThan(-1);
    expect(rumpfA.indexOf("herzschlag_beenden")).toBeLessThan(
      rumpfA.indexOf('while [ "$versuch" -le 3 ]'),
    );
  });

  it("der Besitz wird unmittelbar vor dem Umbenennen NOCH EINMAL geprueft", () => {
    // ⚠️ DAS SCHLIESST DAS FENSTER NICHT, ES VERENGT ES — und das steht hier so, weil
    // der Unterschied in diesem Skript schon zweimal Geld gekostet hat. Zwischen der
    // Pruefung am Anfang der Funktion und dem `mv` lagen zwei `date`-Aufrufe, ein
    // `zustand_lesen` (`sed` plus `tail`) und ein Schreibvorgang — ein halbes Dutzend
    // Prozessstarts. Jetzt liegt dazwischen eine Zeile.
    //
    // Ein echtes Fencing-Token gibt es hier nicht: bei der Sperre war `rmdir` auf einen
    // identitaetsgebundenen Namen ein atomares Vergleiche-und-Tausche, fuer „benenne nur
    // um, wenn das Ziel noch X ist" hat POSIX kein Gegenstueck. Der Restschaden ist EIN
    // veralteter Gesundheitsstand, den der naechste Lauf richtigstellt.
    const rumpfZ = funktionsrumpf(befehle, "zustand_schreiben");
    const zeilen = rumpfZ.split("\n");
    const letzteMv = zeilen.findIndex((z) => z.includes('mv "$tmp"'));
    expect(letzteMv, "die Funktion benennt um").toBeGreaterThan(-1);
    const pruefungenVorMv = zeilen
      .slice(0, letzteMv)
      .map((z, i) => (z.includes("sperre_gehoert_uns") ? i : -1))
      .filter((i) => i >= 0);
    expect(pruefungenVorMv.length, "zwei Pruefungen: am Anfang und direkt davor").toBe(2);
    // ⚠️ Der Abstand ist der ganze Inhalt der Zusicherung. Zwischen der letzten Pruefung
    // und dem `mv` darf nichts stehen, was forkt oder schreibt.
    const dazwischen = zeilen
      .slice(pruefungenVorMv[1] + 1, letzteMv)
      .map((z) => z.trim())
      .filter((z) => z !== "" && z !== "fi");
    expect(dazwischen, "zwischen Pruefung und mv steht nur der Abbruchzweig").toEqual([
      'rm -f "$tmp" 2>/dev/null || true',
      'warne "Die Sperre ging verloren, waehrend der Stand geschrieben wurde ($1: $2) — er',
      'wird NICHT veroeffentlicht."',
      // ⚠️ 1, nicht 0 — sonst liest der Erfolgspfad „hinterlegt" (eigener Fall oben).
      "return 1",
    ]);
  });

  it("der Healthcheck prueft das Volume SELBST — eine Marke ueberquert keine Containergrenze", () => {
    // ⚠️ `docker compose run --rm … einmal` IST EIN EIGENER CONTAINER. Der dokumentierte
    // Weg fuer Probelauf und Rollout laeuft also nicht im Dienst, und eine Marke in
    // seinem `/tmp` verschwindet mit `--rm`. Der Healthcheck im bestehenden Dienst saehe
    // sie nie und meldete weiter den alten `ok`-Stand; bei leerem BACKUP_PING_URL ist er
    // das einzige Signal. Deshalb fragt er die URSACHE direkt.
    const rumpfH = funktionsrumpf(befehle, "zustand");
    expect(rumpfH).toMatch(/probe="\$BACKUP_DIR\/\.zustand\.probe/);
    // ⚠️ ZWEI KLEINIGKEITEN, DIE DIE PROBE SONST WERTLOS MACHEN, beide gemessen:
    //   * `printf` statt `:` — `:` ist ein SPEZIELLER Builtin, und ein Umlenkungsfehler
    //     bei einem solchen beendet die Shell (dash: Exit 2). Der Healthcheck haette mit
    //     2 statt 1 geantwortet und die Rohmeldung der Shell ausgegeben.
    //   * Ein BYTE statt einer leeren Datei — auf einem randvollen tmpfs gelingt eine
    //     Datei der Laenge 0 noch (gemessen: exit 0, „ok").
    // Die Probe selbst steckt in `schreibprobe` — sie laeuft unter der Kennung, unter
    // der auch gesichert wird (eigener Fall oben); hier zaehlt, dass `zustand` sie ruft.
    expect(rumpfH).toMatch(/if ! schreibprobe "\$probe"; then/);
    expect(funktionsrumpf(befehle, "schreibprobe")).toMatch(/printf 'x' 2>\/dev\/null >"\$1"/);
    expect(befehle, "kein `:` als Probe").not.toMatch(/if ! : >"\$probe"/);
    // Aufgeraeumt wird in BEIDEN Zweigen — eine liegengebliebene Probe waere Muell im
    // Volume, das dieser Dienst sauber halten soll.
    expect((rumpfH.match(/rm -f "\$probe"/g) ?? []).length).toBe(2);
    // Und der Name faellt nicht unter das Muster der Generationen, sonst hielte die
    // Rotation ihn irgendwann fuer eine Sicherung.
    expect("\.zustand\.probe").not.toMatch(/^\[0-9\]/);
  });

  it("die Schreibprobe laeuft unter der Kennung, unter der auch gesichert wird", () => {
    // ⚠️ DER HEALTHCHECK IST root, DER LAUF IST ES NICHT. `zustand` geht nicht durch
    // `vorbereiten`, und der Dienst deklariert kein `user:` — also root. Root schreibt
    // aber, wo uid 1001 scheitert: Rechte, eine Quota je Nutzer, oder der fuer root
    // reservierte Rest eines vollen Dateisystems (ext4 haelt per Vorgabe 5% zurueck).
    // Eine Probe als root haette dort „gesund" gemeldet, waehrend jeder echte Lauf —
    // der nach `su-exec` laeuft — nichts mehr schreiben kann.
    //
    // GEMESSEN mit einem Verzeichnis, das root gehoert und fuer 1001 nicht schreibbar
    // ist (su-exec-Attrappe ueber `setpriv`, also echter Kennungswechsel): Healthcheck
    // rot. Gegenprobe mit einem Verzeichnis, das 1001 gehoert: gruen, keine Probedatei
    // bleibt liegen. Und ohne `su-exec` im Pfad: direkte Probe, gruen.
    const rumpfP = funktionsrumpf(befehle, "schreibprobe");
    expect(rumpfP).toMatch(/id -u/);
    expect(rumpfP).toMatch(/su-exec "\$\{SUITE_USER:-1001:1001\}"/);
    // Der Rueckfall ist keine Nachlaessigkeit: ohne root oder ohne `su-exec` (etwa in
    // einem `run --rm`-Container ohne Vorlauf) ist es ohnehin dieselbe Kennung.
    expect(rumpfP).toMatch(/else\s*\n\s*printf 'x' 2>\/dev\/null >"\$1"/);
    expect(funktionsrumpf(befehle, "zustand")).toMatch(/if ! schreibprobe "\$probe"; then/);
  });

  it("der Healthcheck faellt auch bei AUSBLEIBENDEN Laeufen, nicht nur bei gescheiterten", () => {
    // Der wichtigere der beiden Faelle: ein Dienst, der gar nicht mehr laeuft, hat
    // keinen gescheiterten Lauf — er hat keinen. Ohne diese Pruefung meldete der
    // Healthcheck bis in alle Ewigkeit den Erfolg von vorletzter Woche.
    expect(befehle).toContain("BACKUP_FRIST_STUNDEN");
    // `[\s\S]` und nicht der `s`-Flag: das tsconfig-Ziel liegt unter es2018, und tsc
    // lehnt `/…/s` dort mit TS1501 ab — gemessen, nicht vermutet.
    expect(befehle).toMatch(/alter[\s\S]*-gt[\s\S]*BACKUP_FRIST_STUNDEN \* 3600/);
  });
});

describe("die Kette Repo → Server → Rollout haelt zusammen", () => {
  it("scripts/deploy.sh vergleicht BEIDE neuen Dateien mit dem Repo", () => {
    // Sie liegen ab jetzt per Bind-Mount auf dem Server, sind also dieselbe Art Datei
    // wie `clamd.files.conf`. Ohne den Vergleich driftet die Server-Fassung von der
    // getesteten weg, und kein Tor sieht es — am wenigsten dieses Repo.
    const zeile = deploySh.split("\n").find((z) => z.trim().startsWith("for datei in"));
    expect(zeile, "`scripts/deploy.sh` fuehrt eine Dateiliste in Schritt 1").toBeTruthy();
    expect(zeile).toContain("compose.yaml");
    expect(zeile).toContain("clamd.files.conf");
    expect(zeile).toContain("scripts/backup.sh");
    expect(zeile).toContain("scripts/backup-sidecar.sh");
  });

  it("ein geaendertes Sidecar-Skript loest einen Austausch des Containers aus", () => {
    // ⚠️ `docker compose up -d` tauscht einen Container aus, wenn sich IMAGE oder
    // KONFIGURATION geaendert haben — der Inhalt einer Datei hinter einem unveraenderten
    // Mount-Pfad ist beides nicht. Der Sidecar laeuft aber als EIN `sh`-Prozess ueber
    // Wochen und hat seine Funktionen beim Start gelesen. GEMESSEN an einem Skript, das
    // im Takt eine Zeile schreibt und dabei ausgetauscht wird: der laufende Prozess gab
    // sechsmal die ALTE Fassung aus, ein neu gestarteter sofort die neue. Schritt 1
    // meldet die Datei dabei als „identisch" — sie IST es ja.
    expect(deploySh, "der Sidecar wird bei Bedarf ausgetauscht").toMatch(
      /docker compose up -d --force-recreate backup/,
    );
    // ⚠️ UND ZWAR ERST, WENN DER ROLLOUT BEWIESEN IST. In Schritt 5 läge der Austausch in
    // dem Fenster, in dem Produktion schon angefasst ist, `zurueck_und_raus` aber noch
    // nicht definiert — ein Docker-Fehler beendete das Skript per `set -e`, und eine
    // UNGEPRUEFTE Fassung liefe weiter, ohne dass der festgehaltene Rückweg je gegangen
    // wird. Erst Existenz, dann Reihenfolge (sonst prüft −1 gegen −1).
    const rueckweg = deploySh.indexOf("zurueck_und_raus() {");
    const beweis = deploySh.indexOf("Schritt 7: Revision der laufenden Instanz");
    const austausch = deploySh.indexOf("docker compose up -d --force-recreate backup");
    for (const [wert, was] of [
      [rueckweg, "der Rückweg"],
      [beweis, "die Revisionsprüfung"],
      [austausch, "der Austausch"],
    ] as const) {
      expect(wert, `${was} steht im Skript`).toBeGreaterThan(-1);
    }
    expect(austausch, "der Austausch steht NACH dem Rückweg").toBeGreaterThan(rueckweg);
    expect(austausch, "und NACH dem Beweis aus Schritt 7").toBeGreaterThan(beweis);
    // Gemessen statt gescannt: die Entscheidung wird aus dem Skript geschnitten und in
    // `bash` ausgefuehrt (sie benutzt `local`, `sh` reicht nicht).
    const quelle = deploySh.slice(
      deploySh.indexOf("backup_skripte_neuer_als() {"),
      deploySh.indexOf("\n}\n", deploySh.indexOf("backup_skripte_neuer_als() {")),
    );
    expect(quelle, "die Entscheidung steht als eigene Funktion da").toContain("stat -c");
    const kladde = mkdtempSync(path.join(os.tmpdir(), "backup-deploy-"));
    const entscheide = (seit: number) => {
      const ergebnis = spawnSync(
        "bash",
        [
          "-c",
          `${quelle}\n}\nSTACK_DIR=${kladde}\nif backup_skripte_neuer_als "$1"; then echo NEUSTART; else echo nein; fi`,
          "bash",
          String(seit),
        ],
        { encoding: "utf8" },
      );
      return ergebnis.stdout.trim().split("\n").pop();
    };
    try {
      mkdirSync(path.join(kladde, "scripts"));
      for (const name of ["backup.sh", "backup-sidecar.sh"]) {
        writeFileSync(path.join(kladde, "scripts", name), "");
      }
      const jetzt = Math.floor(Date.now() / 1000);
      expect(entscheide(jetzt + 100), "Container juenger als beide Skripte").toBe("nein");
      expect(entscheide(jetzt - 100), "ein Skript frisch hingelegt").toBe("NEUSTART");
      // ⚠️ DER FALL, DER DIE ZEITQUELLE ENTSCHEIDET: `cp -p`, `install -p` und `rsync -a`
      // erhalten die mtime. Eine mtime-Pruefung hielte eine eben kopierte Datei fuer alt
      // und liesse den Dienst auf dem alten Stand — die ctime setzt der Kern beim
      // Schreiben, sie laesst sich nicht erhalten.
      const damals = new Date("2020-01-01T00:00:00Z");
      for (const name of ["backup.sh", "backup-sidecar.sh"]) {
        utimesSync(path.join(kladde, "scripts", name), damals, damals);
      }
      expect(entscheide(jetzt - 100), "mtime alt, ctime frisch: trotzdem Neustart").toBe(
        "NEUSTART",
      );
      // Ist die Startzeit nicht zu lesen, wird neugestartet — lieber einmal zu viel als
      // eine Nacht auf dem alten Stand.
      expect(entscheide(0), "Startzeit unbekannt").toBe("NEUSTART");
    } finally {
      rmSync(kladde, { recursive: true, force: true });
    }
  });

  it("ein gescheiterter Austausch des Sidecars rollt den Rollout NICHT zurueck", () => {
    // ⚠️ ER DARF AUCH NICHT STILL SEIN — beides zusammen ist der Fall: der Backup-Dienst
    // hat in KEINE Richtung ein `depends_on`, ein Image-Rollback machte einen
    // Docker-Fehler an ihm nicht besser (er verlängerte nur die Störung); zugleich
    // sichert der Sidecar ohne Austausch still nach dem alten Skript.
    //
    // GEMESSEN mit einer `docker`-Attrappe, die genau beim Austausch scheitert — der
    // Block wird aus `scripts/deploy.sh` geschnitten und unter `set -euo pipefail`
    // gefahren, also so, wie ihn der Rollout fährt.
    const kladde = mkdtempSync(path.join(os.tmpdir(), "backup-8b-"));
    const ab = deploySh.indexOf('melde "Schritt 8b:');
    const bis = deploySh.indexOf("# ══ Schritt 9", ab === -1 ? 0 : ab);
    expect(ab, "Schritt 8b steht im Skript").toBeGreaterThan(-1);
    expect(bis, "und endet vor Schritt 9").toBeGreaterThan(ab);
    const fuss = deploySh.indexOf("backup_skripte_neuer_als() {");
    const funktion = deploySh.slice(fuss, deploySh.indexOf("\n}\n", fuss)) + "\n}";
    const lauf = (block: string) => {
      writeFileSync(
        path.join(kladde, "bin/docker"),
        [
          "#!/bin/sh",
          'case "$*" in',
          '  "compose ps -q backup") echo cid-abc ;;',
          '  "inspect -f {{.State.StartedAt}} cid-abc") echo 2020-01-01T00:00:00Z ;;',
          '  "compose up -d --force-recreate backup") echo "Attrappe: Austausch gescheitert" >&2; exit 1 ;;',
          '  *) echo "unerwartet: $*" >&2; exit 99 ;;',
          "esac",
          "",
        ].join("\n"),
      );
      chmodSync(path.join(kladde, "bin/docker"), 0o755);
      const p = spawnSync(
        "bash",
        [
          "-c",
          [
            "set -euo pipefail",
            "melde() { echo \"== $*\"; }",
            "warne() { echo \"WARNUNG: $*\" >&2; }",
            `STACK_DIR=${kladde}/stack`,
            funktion,
            block,
            'echo "SCHRITT 9 ERREICHT"',
          ].join("\n"),
        ],
        { encoding: "utf8", env: { ...process.env, PATH: `${kladde}/bin:${process.env.PATH}` } },
      );
      return { code: p.status, aus: `${p.stdout}${p.stderr}` };
    };
    try {
      mkdirSync(path.join(kladde, "bin"));
      mkdirSync(path.join(kladde, "stack/scripts"), { recursive: true });
      for (const name of ["backup.sh", "backup-sidecar.sh"]) {
        writeFileSync(path.join(kladde, "stack/scripts", name), "");
      }
      const jetzt = lauf(deploySh.slice(ab, bis));
      expect(jetzt.code, "der Rollout läuft zu Ende").toBe(0);
      expect(jetzt.aus, "und erreicht sein Ergebnis").toMatch(/SCHRITT 9 ERREICHT/);
      expect(jetzt.aus, "aber laut, mit dem Handgriff").toMatch(
        /WARNUNG:[\s\S]*docker compose up -d --force-recreate backup/,
      );
      // ⚠️ Die Gegenprobe ist die Hälfte der Messung: ohne den Auffangzweig beendet
      // `set -e` das Skript genau hier — und genau das war der Befund.
      const ohne = lauf(deploySh.slice(ab, bis).replace(/ \|\| warne "Der Austausch[\s\S]*?backup"/, ""));
      expect(ohne.code, "ohne Auffangzweig bricht der Rollout ab").toBe(1);
      expect(ohne.aus, "und Schritt 9 wird nie erreicht").not.toMatch(/SCHRITT 9 ERREICHT/);
    } finally {
      rmSync(kladde, { recursive: true, force: true });
    }
  });

  it(".env.example nennt die Betreiberknoepfe — sonst findet sie niemand", () => {
    // Alle sind in `compose.yaml` bzw. im Skript vorbelegt und deshalb optional. Genau
    // darum stehen sie hier: eine Vorgabe, die niemand kennt, ist keine Entscheidung.
    for (const name of [
      "SUITE_BACKUP_IMAGE",
      "SUITE_BACKUP_START_PERIOD",
      "BACKUP_UHRZEIT",
      "BACKUP_KEEP",
      "BACKUP_RCLONE_ZIEL",
      "BACKUP_RCLONE_KEEP",
      "BACKUP_PING_URL",
      "BACKUP_FRIST_STUNDEN",
      "BACKUP_SPERRE_FRIST_MINUTEN",
      "BACKUP_SPERRE_ALTER_STUNDEN",
      "BACKUP_HERZSCHLAG_SEKUNDEN",
      "BACKUP_PING_URL_FEHLER",
      "SUITE_BACKUP_STOP_GRACE",
    ]) {
      expect(envBeispiel, `${name} steht in .env.example`).toContain(name);
    }
  });
});

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
    // Ein angehaengtes `/fail` landet damit im WERT von `ping=`, der Pfad bleibt
    // derselbe, `status=up` steht unveraendert drin — der Ruf frischt den Waechter auf
    // GRUEN auf. Gemessen an beiden Formen.
    expect(befehle).toContain("BACKUP_PING_URL_FEHLER");
    const rumpfP = funktionsrumpf(befehle, "ping_senden");
    expect(rumpfP).toMatch(/elif \[ -n "\$BACKUP_PING_URL_FEHLER" \]; then/);
    // Und die Vorbelegung bleibt die healthchecks.io-Form, damit der haeufige Fall
    // ohne zweite Zeile auskommt.
    expect(rumpfP).toMatch(/ziel="\$BACKUP_PING_URL\/fail"/);
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
    expect(befehle).toMatch(/meine_marke="eigner\.\$\$\.\$\(date \+%s\)"/);
    const hineingeschrieben = befehle
      .split("\n")
      .filter((z) => z.includes("$SPERRVERZEICHNIS/"))
      .filter((z) => !z.includes("rmdir"));
    expect(hineingeschrieben.map((z) => z.trim())).toEqual([
      'mkdir "$SPERRVERZEICHNIS/$meine_marke" 2>/dev/null || meine_marke=""',
    ]);
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
    expect(befehle).toMatch(/touch "\$SPERRVERZEICHNIS"/);
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
    expect(befehle).toMatch(
      /while \[ -d "\$SPERRVERZEICHNIS" \] && kill -0 "\$eltern" 2>\/dev\/null; do/,
    );
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
    expect(rumpfF).toMatch(/rmdir "\$SPERRVERZEICHNIS\/\$meine_marke" 2>\/dev\/null/);
    // Und das Verzeichnis selbst nur, wenn es danach leer ist.
    expect(rumpfF).toMatch(/rmdir "\$SPERRVERZEICHNIS" 2>\/dev\/null/);
    // Die Marke muss bei JEDER Belegung festgehalten werden, sonst gibt es nichts zu pruefen.
    expect(befehle).toMatch(/meine_marke="eigner\.\$\$\.\$\(date \+%s\)"/);
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

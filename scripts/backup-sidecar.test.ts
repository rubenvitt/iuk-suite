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

  it("der zweite Lauf WARTET, statt zu ueberspringen", () => {
    // Ein uebersprungener Lauf waere fuer `deploy.sh` ein gruener Exit-Code OHNE
    // Sicherung — es rollte dann ohne aus. Ein zweites Tarball kostet nur Platz.
    expect(befehle).toContain("BACKUP_SPERRE_FRIST_MINUTEN");
    expect(befehle).toMatch(/while ! sperre_holen/);
  });

  it("die Uebernahme einer verwaisten Sperre SERIALISIERT SICH SELBST", () => {
    // ⚠️ GEMESSEN, ALS SIE ES NICHT TAT: der naheliegende Weg ist, die Verwaistheit zu
    // pruefen und dann wegzuraeumen und neu anzulegen. Zwei Wartende faellen dann
    // dasselbe Urteil, BEVOR einer handelt — A raeumt weg und legt neu an, B raeumt A's
    // FRISCHE Sperre weg und legt wieder neu an, und danach halten sich beide fuer den
    // Eigentuemer. Mit acht gleichzeitigen Wartenden gegen eine 8h alte Sperre gemessen:
    // DREI begannen ihren Lauf in derselben Sekunde, also genau die Gleichzeitigkeit,
    // gegen die es die Sperre gibt.
    //
    // ⚠️ EIN BLOSSES `mv` STATT `rm -rf` REICHT NICHT, so atomar `rename()` auch ist: es
    // verengt das Fenster, schliesst es aber nicht, weil das Urteil weiterhin VORHER
    // faellt. Was traegt, ist die zweite, eigene Sperre — `mkdir` laesst genau einen in
    // den Abschnitt, und dort drin wird noch einmal geprueft. Nach der Aenderung: 8 und
    // 12 Wettlaeufer, nie mehr als einer gleichzeitig.
    expect(befehle).toContain("UEBERNAHMEVERZEICHNIS=");
    // Eingegrenzt auf DIESE Funktion — quer durch die Datei faende ein Regex die
    // Bestandteile auch dann, wenn sie hier fehlen (siehe `funktionsrumpf`).
    const rumpfU = funktionsrumpf(befehle, "sperre_uebernehmen");
    expect(rumpfU).toMatch(/mkdir "\$UEBERNAHMEVERZEICHNIS" 2>\/dev\/null \|\| return 1/);
    // ⚠️ DIE ZWEITE PRUEFUNG IST DER KERN, NICHT DIE ZWEITE SPERRE: ohne sie betraete zwar
    // nur einer den Abschnitt, uebernaehme dort aber blind — und damit auch eine Sperre,
    // die inzwischen ein anderer ganz regulaer angelegt hat.
    const pruefung = rumpfU.indexOf("if sperre_ist_verwaist; then");
    const raeumen = rumpfU.indexOf('rm -rf "$SPERRVERZEICHNIS"');
    expect(pruefung, "im Abschnitt wird die Verwaistheit ERNEUT geprueft").toBeGreaterThan(-1);
    expect(raeumen, "und erst danach geraeumt").toBeGreaterThan(pruefung);
    // Der Abschnitt wird in JEDEM Ausgang wieder freigegeben.
    expect(rumpfU).toMatch(/rm -rf "\$UEBERNAHMEVERZEICHNIS"\s*\n\s*return "\$ergebnis"/);
  });

  it("eine verwaiste Sperre wird nach ihrem ALTER uebernommen, nicht nach einer PID", () => {
    // ⚠️ EINE PID NUETZT HIER NICHTS: die beiden Laeufe sitzen in verschiedenen Containern,
    // also in verschiedenen PID-Namensraeumen. Ohne die Uebernahme stuende das Backup nach
    // einem SIGKILL dauerhaft still — und zwar still, bis der Healthcheck nach 26h anspringt.
    expect(befehle).toContain("BACKUP_SPERRE_ALTER_STUNDEN");
    expect(befehle).toMatch(/alter.*-gt.*BACKUP_SPERRE_ALTER_STUNDEN \* 3600/);
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
      "SUITE_BACKUP_STOP_GRACE",
    ]) {
      expect(envBeispiel, `${name} steht in .env.example`).toContain(name);
    }
  });
});

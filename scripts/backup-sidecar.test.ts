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
    expect(sidecar).toContain('exec su-exec "$NUTZER" /bin/sh "$0" "$1"');
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
    expect(befehle).toMatch(/einmal\)\s+vorbereiten lauf/);
    expect(befehle).toMatch(/dienst\)\s+vorbereiten schleife/);
  });
});

describe("scripts/backup-sidecar.sh — was am Ziel geloescht werden darf", () => {
  it("die Rotation am Ziel filtert auf `*.tar.gz` und loescht EINZELN", () => {
    // ⚠️ DIESER BLOCK LOESCHT AN EINEM FREMDEN ZIEL. Ein gemeinsam genutzter Eimer oder
    // ein `BACKUP_RCLONE_ZIEL` mit einem Pfad zu wenig verloere sonst still fremde
    // Daten. Geloescht wird nur, was aussieht wie unser Tarball.
    expect(befehle).toContain("--include '*.tar.gz'");
    expect(befehle).toContain("deletefile");
    // `delete`/`purge` arbeiten auf dem VERZEICHNIS und kennen den Filter oben nicht.
    expect(befehle).not.toMatch(/rclone_ruf\s+(delete|purge)\b/);
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
    ]) {
      expect(envBeispiel, `${name} steht in .env.example`).toContain(name);
    }
  });
});

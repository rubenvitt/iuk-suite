import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Der clamav-Sidecar ist eine STACK-Aenderung, und kein anderes Gate beruehrt
 * sie: E2E benutzt kein Compose (dort laeuft `scripts/fake-clamd.mjs`),
 * `pnpm build` liest keine `compose.yaml`, und `docker compose config` prueft
 * nur die Syntax. Ein Netz zu viel, ein Mount zu wenig oder ein fehlendes `:-`
 * faellt damit erst in Produktion auf — als „kaputtes Modul" (Plan T24).
 *
 * WARUM DIESER SCAN DEN YAML-BAUM SELBST ZERLEGT und nicht nur `includes()`
 * ueber die ganze Datei sucht: die tragenden Aussagen sind BLOCK-BEZOGEN.
 * „`suite_data` ist im Sidecar NICHT gemountet" ist per Volltextsuche
 * unbeweisbar, weil `suite_data:/data` unter `suite` voellig zu Recht steht;
 * dasselbe gilt fuer „clamav haengt NUR am Netz `av`". Ein `yaml`-Paket steht
 * als DIREKTE Abhaengigkeit nicht zur Verfuegung (`js-yaml` liegt nur
 * transitiv im Store), also zerlegt dieser Test die zwei Ebenen, die die Datei
 * hat, ueber die Einrueckung — fuer eine Datei mit zwei Services ist das
 * ehrlich, und die Alternative waere eine undeklarierte Abhaengigkeit.
 */

const WURZEL = path.resolve(__dirname, "../../../../..");

const composeZeilen = readFileSync(path.join(WURZEL, "compose.yaml"), "utf8").split("\n");
const clamdConf = readFileSync(path.join(WURZEL, "clamd.files.conf"), "utf8");
const envBeispiel = readFileSync(path.join(WURZEL, ".env.example"), "utf8");

/** Einrueckungstiefe; -1 fuer Leerzeilen, damit sie einen Block nicht beenden. */
function tiefe(zeile: string): number {
  if (zeile.trim() === "") return -1;
  return zeile.length - zeile.trimStart().length;
}

/** Zeile eines Schluessels auf genau dieser Tiefe — samt etwaigem Inline-Wert. */
function kopfzeile(zeilen: string[], name: string, ebene: number): string | undefined {
  const praefix = " ".repeat(ebene) + name + ":";
  return zeilen.find((z) => z === praefix || z.startsWith(praefix + " "));
}

/**
 * Rumpf eines Schluessels: alle folgenden Zeilen, die TIEFER eingerueckt sind.
 * Die Tiefe ist der Anker, nicht die Reihenfolge — nur so treffen `volumes:`
 * auf Ebene 0 und `volumes:` auf Ebene 4 nicht dieselbe Suche.
 */
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

/**
 * Eintraege einer Liste, in BEIDEN YAML-Schreibweisen: `networks: [proxy, av]`
 * (Flow, so steht es im Spec-Schnipsel §6.5) und `- proxy` untereinander
 * (Block, so steht `volumes:` heute in der Datei). Wer nur eine Form kennt,
 * hat einen Test, der bei einer harmlosen Umformatierung rot wird — und der
 * dann als „falscher Alarm" entfernt wird.
 */
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
  const koerper = rumpf(zeilen, name, ebene);
  const direkt = koerper.filter((z) => z.trim().startsWith("- "));
  if (direkt.length === 0) return [];
  // Nur die DIREKTEN Kinder: `env_file` traegt `- path: .env` eine Ebene
  // tiefer, und das ist kein Eintrag dieser Liste.
  const flach = Math.min(...direkt.map(tiefe));
  return direkt
    .filter((z) => tiefe(z) === flach)
    .map((z) => z.trim().slice(2).replace(/#.*$/, "").trim());
}

const services = rumpf(composeZeilen, "services", 0);
const suite = rumpf(services, "suite", 2);
const clamav = rumpf(services, "clamav", 2);

/** Ein Zuordnungswert (`MaxFileSize 500`) aus der clamd-Konfiguration. */
function clamdWert(name: string): string | undefined {
  const treffer = clamdConf
    .split("\n")
    .map((z) => z.trim())
    .filter((z) => !z.startsWith("#"))
    .map((z) => new RegExp(`^${name}\\s+(\\S+)$`).exec(z))
    .filter((m): m is RegExpExecArray => m !== null);
  expect(treffer.length, `${name} steht genau einmal ungeschachtelt in clamd.files.conf`).toBe(1);
  return treffer[0][1];
}

describe("compose.yaml — der clamav-Sidecar sitzt abgeschottet (Spec §6.5)", () => {
  it("Punkt 1: clamav haengt NUR am Netz `av`, und `av` ist internal", () => {
    expect(liste(clamav, "networks", 4)).toEqual(["av"]);

    // `internal: true`, weil clamd unauthentifiziert auf 0.0.0.0:3310 lauscht:
    // am externen `proxy`-Netz spraeche jeder fremde Container dort ohne
    // Zugangsdaten `zSCAN` mit einem Pfad IM clamav-Container.
    const netze = rumpf(composeZeilen, "networks", 0);
    const av = [kopfzeile(netze, "av", 2) ?? "", ...rumpf(netze, "av", 2)].join("\n");
    expect(av, "Netz `av` ist deklariert").not.toBe("");
    expect(av).toMatch(/internal:\s*true/);
  });

  it("Punkt 2: clamav hat kein `ports:` — der Scanner ist von aussen nicht erreichbar", () => {
    const schluessel = clamav.filter((z) => tiefe(z) === 4).map((z) => z.trim());
    expect(schluessel.some((z) => z.startsWith("ports:"))).toBe(false);
  });

  it("Punkt 3: `files_data` liegt im Sidecar `:ro`, `suite_data` liegt dort GAR NICHT", () => {
    const mounts = liste(clamav, "volumes", 4);
    expect(mounts).toContain("files_data:/data/files:ro");
    // Die Datenbanken (portal.db, qr.db, feedback.db, files.db) liegen in
    // `suite_data`. clamd darf sie nicht sehen — auch nicht lesend.
    expect(mounts.filter((m) => m.includes("suite_data"))).toEqual([]);
  });

  it("Punkt 4: `clamav_db:/var/lib/clamav` ueberlebt ein Recreate", () => {
    expect(liste(clamav, "volumes", 4)).toContain("clamav_db:/var/lib/clamav");
    const benannt = rumpf(composeZeilen, "volumes", 0).join("\n");
    expect(benannt, "`clamav_db` ist ein benanntes Volume").toMatch(/^\s{2}clamav_db:/m);
  });

  it("Punkt 5: suite wartet auf `clamav: condition: service_healthy`", () => {
    const abhaengig = rumpf(suite, "depends_on", 4).join("\n");
    expect(abhaengig).toMatch(/^\s{6}clamav:/m);
    expect(abhaengig).toMatch(/condition:\s*service_healthy/);
  });

  it("Punkt 5b: der Sidecar HAT einen Healthcheck — sonst wird er nie healthy", () => {
    // `depends_on: service_healthy` gegen einen Service ohne `healthcheck`
    // laesst die Suite mit allen vier Modulen nicht starten, und
    // `docker compose config` sieht das nicht.
    const pruefung = rumpf(clamav, "healthcheck", 4).join("\n");
    expect(pruefung).toMatch(/clamdcheck\.sh/);
    expect(pruefung).toMatch(/start_period:/);
  });

  it("Punkt 6: Image-Tag und `start_period` sind Variablen MIT Vorbelegung (`:-`)", () => {
    const text = clamav.join("\n");
    // Woertlich, samt Doppelpunkt: ohne `:-` setzt Compose eine nicht gesetzte
    // Variable auf den LEEREN String, und ein leerer `image:`-Wert laesst
    // `docker compose config` scheitern. `${VAR-vorgabe}` (ohne Doppelpunkt)
    // greift nur bei „gar nicht gesetzt", nicht bei „leer gesetzt" — genau der
    // Unterschied, den dieser Punkt bewachen soll.
    expect(text).toContain("${SUITE_CLAMAV_IMAGE:-clamav/clamav:1.4}");
    expect(text).toContain("${SUITE_CLAMAV_START_PERIOD:-120s}");
  });

  it("Punkt 6b: die gemeinsame gid ist eine Variable MIT Vorbelegung (`:-`)", () => {
    /*
     * `storage.ts` schreibt Blobs 0o640 und Ablagen 0o750 und beruft sich auf „gemeinsame
     * gid" als die geltende der zwei zugelassenen Varianten — hergestellt wird sie aber
     * erst hier. Fehlt die Zeile, betritt clamd die 0750-Verzeichnisse nicht („File path
     * check failure: Permission denied"), und nach FILES_AV_VERSUCHE steht
     * `av_status = 'error'`: fail-closed, Download dauerhaft gesperrt, Anblick eines
     * kaputten Moduls. Kein anderes Gate beruehrt das — E2E benutzt kein Compose, und in
     * einem Container laeuft der Testlauf ohnehin nicht.
     *
     * `:-` woertlich samt Doppelpunkt, aus demselben Grund wie in Punkt 6: eine nicht
     * gesetzte Variable macht Compose zum LEEREN String, und ein leerer `user:`-Wert
     * laesst `docker compose config` scheitern.
     *
     * Und die Vorbelegung ist NICHT frei waehlbar: die uid MUSS 1001 sein (nextjs, der
     * Eigentuemer von /data und /data/files im Image), sonst nimmt das blosse Einfuehren
     * dieser Zeile jedem Host, der die Variable nicht setzt, den Zugriff auf seine eigenen
     * Daten. Die gid 1001 (nodejs) ist dagegen bewusst NICHT die des Images: `USER nextjs`
     * laeuft als 1001:65533(nogroup), weil das Dockerfile kein `-G nodejs` setzt. 1001 ist
     * die Gruppe, der /data ohnehin gehoert — die Zeile korrigiert das mit, statt `nogroup`
     * einzufrieren.
     */
    expect(suite.join("\n")).toContain("${SUITE_USER:-1001:1001}");
  });

  it("Punkt 8: suite haengt an `proxy` UND `av` — sonst erreicht sie clamd nicht", () => {
    // Fehlt `av`, laeuft jeder Scan in ECONNREFUSED und nach
    // FILES_AV_VERSUCHE in `av_status = 'error'`. Fail-closed, in Produktion,
    // und es sieht wie ein kaputtes Modul aus.
    const netze = liste(suite, "networks", 4);
    expect(netze).toContain("proxy");
    expect(netze).toContain("av");
  });

  it("Punkt 9: suite und Sidecar mounten DASSELBE benannte Volume auf /data/files", () => {
    const zielSuite = liste(suite, "volumes", 4).filter((m) => m.endsWith(":/data/files"));
    expect(zielSuite, "suite mountet ein Volume auf /data/files").toHaveLength(1);
    const name = zielSuite[0].split(":")[0];

    const zielAv = liste(clamav, "volumes", 4).filter((m) => m.endsWith(":/data/files:ro"));
    expect(zielAv, "clamav mountet /data/files lesend").toHaveLength(1);
    // Zwei verschiedene Volumesnamen wuerden dem Sidecar ein LEERES
    // Verzeichnis zeigen; er antwortete dann auf jeden `zSCAN` mit
    // „Can't access file ERROR" — grün im Punkt-3-Test, kaputt im Betrieb.
    expect(zielAv[0].split(":")[0]).toBe(name);

    expect(rumpf(composeZeilen, "volumes", 0).join("\n")).toMatch(
      new RegExp(`^\\s{2}${name}:`, "m"),
    );
  });

  it("die Konfigurationsdatei erreicht clamd ueberhaupt (Mount auf clamd.conf)", () => {
    // Ohne diesen Mount ist `clamd.files.conf` ein Repo-Schmuckstueck und die
    // Uebergrosse bleibt ein stilles `OK`.
    expect(liste(clamav, "volumes", 4)).toContain("./clamd.files.conf:/etc/clamav/clamd.conf:ro");
  });
});

describe("clamd.files.conf — Uebergroesse ist ein FUND, kein `OK` (Spec §6.5, §6.6)", () => {
  it("`AlertExceedsMax yes` — sonst tauscht der Pfad-Scan fail-closed gegen fail-open", () => {
    // Gemessen (Analyse): `zSCAN` per Pfad meldet eine Uebergroesse als `OK`
    // mit dem Protokolleintrag „AlertExceedsMax heuristic detection disabled".
    expect(clamdWert("AlertExceedsMax")).toBe("yes");
  });

  it("`MaxFileSize` == `StreamMaxLength` — EINE Quelle, nicht zwei Zahlen", () => {
    expect(clamdWert("MaxFileSize")).toBe(clamdWert("StreamMaxLength"));
  });

  it("und die Quelle traegt den GEMESSENEN Wert, nicht irgendeinen", () => {
    /*
     * Ohne diese Zeile besitzen die Tests nur die BEZIEHUNGEN (== und >=) und die
     * Ziffernreinheit, nicht den Wert. Gemessen: alle drei Groessen von 524288000
     * auf 104857600 gedreht — 18/18 gruen. Damit passierte ein stiller Rueckfall
     * auf clamds 100-MiB-Vorgabe jedes Gate, und `FILES_MAX_DATEI_BYTES <=
     * FILES_AV_MAX_BYTES` faengt ihn nicht: das ist eine reine Env-Pruefung, die
     * die Datei hier gar nicht liest.
     *
     * 524288000 = 500 MiB ist keine gewaehlte Zahl, sondern die gemessene Grenze
     * BEIDER Alt-Anwendungen (Spec §13.1 Frage 1, Analyse Falle 22). Aendert der
     * Betreiber sie im Runbook, aendert sich diese Zeile mit — und genau das ist
     * der Zweck: eine Aenderung soll sichtbar sein, nicht stillschweigend.
     */
    expect(clamdWert("MaxFileSize")).toBe("524288000");
  });

  it("die Groessen stehen in reinen BYTES, ohne Einheitenkuerzel", () => {
    // Analyse-Falle 22 ist eine EINHEITEN-Falle: `MAX_FILE_SIZE` in Bytes
    // gegen `MAX_FILE_SIZE_MB` in Megabytes. clamd akzeptiert zusaetzlich
    // `500M` — dieselbe Zahl mit Kuerzel ist ein anderer Wert, und
    // `FILES_AV_MAX_BYTES` traegt seine Einheit im Namen. Also ziffernrein.
    for (const name of ["MaxFileSize", "StreamMaxLength", "MaxScanSize"]) {
      expect(clamdWert(name), `${name} ziffernrein`).toMatch(/^[0-9]+$/);
    }
  });

  it("`MaxScanSize` ist NICHT kleiner als `MaxFileSize`", () => {
    // Zusammen mit `AlertExceedsMax yes` waere ein kleineres `MaxScanSize`
    // eine Fund-Meldung fuer JEDE grosse Datei
    // (`Heuristics.Limits.Exceeded`) — fail-closed aus dem falschen Grund,
    // und der Nutzer liest „Virus gefunden". Das Image-eigene `MaxScanSize`
    // (400M) ist mit diesem Mount weg, es gilt sonst clamds 100-MiB-Vorgabe.
    expect(Number(clamdWert("MaxScanSize"))).toBeGreaterThanOrEqual(
      Number(clamdWert("MaxFileSize")),
    );
  });

  it("der Name `FILES_AV_MAX_BYTES` steht als Kommentar daneben", () => {
    // Die App kann die clamd-Kappe nicht LESEN (Spec §6.6). Die Klammer
    // zwischen Repo-Datei und Env-Variable ist deshalb dieser Kommentar —
    // ohne ihn aendert jemand nur eine der beiden Stellen.
    expect(clamdConf).toContain("FILES_AV_MAX_BYTES");
  });

  it("`LocalSocket` und `TCPSocket 3310` bleiben gesetzt", () => {
    // Dieser Mount ERSETZT die Datei des Images. `clamdcheck.sh` (der
    // Healthcheck) spricht den lokalen Socket an: faellt `LocalSocket` weg,
    // wird der Sidecar nie healthy — und `depends_on` haelt dann die GANZE
    // Suite unten. `TCPSocket` ist der Weg, den die Suite selbst nimmt.
    expect(clamdWert("LocalSocket")).toMatch(/^\//);
    expect(clamdWert("TCPSocket")).toBe("3310");
  });

  it("`DatabaseDirectory` zeigt auf das Volume `clamav_db`", () => {
    expect(clamdWert("DatabaseDirectory")).toBe("/var/lib/clamav");
    expect(liste(clamav, "volumes", 4)).toContain("clamav_db:/var/lib/clamav");
  });
});

describe(".env.example — die zwei Betreiberknoepfe des Sidecars", () => {
  it("nennt beide `SUITE_CLAMAV_*`-Namen mit ihrer Vorbelegung", () => {
    // Beide sind in `compose.yaml` vorbelegt, also OPTIONAL — und genau
    // deshalb faende sie ohne diese Zeilen niemand, der sie braucht: der
    // Image-Tag auf arm64 (`clamav/clamav:1.4` hat nur ein
    // `linux/amd64`-Manifest) und die am Zielhost gemessene `start_period`.
    expect(envBeispiel).toContain("SUITE_CLAMAV_IMAGE");
    expect(envBeispiel).toContain("SUITE_CLAMAV_START_PERIOD");
    expect(envBeispiel).toMatch(/clamav\/clamav:1\.4/);
  });
});

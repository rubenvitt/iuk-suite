import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * `scripts/backup.sh` sichert heute ausschliesslich `"$DATA_DIR"/*.db`. Ab dem Modul
 * `files` liegen die Nutzdaten daneben im Dateisystem — ohne diese Erweiterung ist das
 * Backup ab jetzt unvollstaendig UND MELDET ERFOLG (Spec §5.5).
 *
 * WARUM DAS EIN QUELLTEXT-SCAN IST: ein echter Lauf des Skripts gegen ein echtes
 * `DATA_DIR` verlangt `sqlite3`, `tar` und `rsync` auf dem Laeufer und ist deshalb
 * ausdruecklich KEIN Gate, sondern ein Runbook-Schritt (Plan T25). Ein
 * `skipIf(!hasRsync)` waere auf dem Laeufer gruen durch Abwesenheit und beliese nichts.
 * Was ein Scan dagegen wirklich besitzt, ist die REIHENFOLGE der vier Bloecke: beide
 * naheliegenden Umbauten scheitern still (siehe unten), und beide sind reine
 * Positionsfehler, die kein `toContain` sieht.
 *
 * `bash -n` gehoert dazu und laeuft hier mit: ein Syntaxfehler in einem Cron-Skript
 * faellt sonst erst nachts auf, und dann fuer ALLE vier Module.
 */

const WURZEL = path.resolve(__dirname, "../../../../..");
const SKRIPT = path.join(WURZEL, "scripts/backup.sh");
const quelle = readFileSync(SKRIPT, "utf8");
const zeilen = quelle.split("\n");

/**
 * Nur die Befehlszeilen. Die VERBOTE muessen hierauf zielen und nicht auf den ganzen
 * Text: das Skript BEGRUENDET in Kommentaren, warum `cp -al` und `tar -rf` falsch waeren
 * — ein Scan ueber die ganze Datei verboete damit genau die Erklaerung, die den naechsten
 * Leser vor dem Rueckbau bewahrt.
 */
const befehle = zeilen.filter((z) => !z.trim().startsWith("#"));
const befehleText = befehle.join("\n");

/**
 * Index der ERSTEN Zeile, die `teil` enthaelt — Kommentarzeilen ausgenommen. Ohne diese
 * Ausnahme genuegte ein erklaerender Kommentar oberhalb, um die Reihenfolgekette gruen zu
 * faerben, ohne dass der Befehl selbst umzieht.
 */
function zeileMit(teil: string): number {
  const i = zeilen.findIndex((z) => !z.trim().startsWith("#") && z.includes(teil));
  expect(i, `scripts/backup.sh fuehrt eine Befehlszeile mit "${teil}"`).toBeGreaterThanOrEqual(0);
  return i;
}

/**
 * Der `.part`-Suffix wird NICHT hier hartkodiert, sondern aus `_lib/storage.ts` gelesen.
 * Sonst waere ein Umbenennen dort selbstkonsistent: Ablage und Ausschlussregel truegen
 * verschiedene Suffixe, halbe Uploads landeten im Backup, und beide Tests blieben gruen.
 * storage.ts (`TEIL_SUFFIX`) nennt `scripts/backup.sh` als Gegenstueck — die Kopplung ist echt.
 * Gelesen als Text, weil `TEIL_SUFFIX` dort absichtlich nicht exportiert ist.
 */
function teilSuffixAusStorage(): string {
  const storage = readFileSync(path.join(__dirname, "storage.ts"), "utf8");
  const treffer = storage.match(/const TEIL_SUFFIX = "([^"]+)"/);
  expect(treffer, "TEIL_SUFFIX in _lib/storage.ts").not.toBeNull();
  return treffer?.[1] ?? "";
}

describe("scripts/backup.sh — BLOB_DIR ist eine eigene Variable", () => {
  it("faellt auf $DATA_DIR/files zurueck, statt den Pfad fest zu verdrahten", () => {
    // Ohne eigene Variable ist `$DATA_DIR/files` host-seitig ein LEERER Mountpunkt,
    // sobald die Blobs im eigenen Volume `files_data` liegen (Spec §6.5): das `tar`
    // sicherte nichts und meldete Erfolg. Der Rueckfall deckt die Lage ohne eigenen
    // Mount ab (Dev, und der Zustand vor der Compose-Aenderung) — beide Faelle, weil
    // §13.2 Frage 11 offen ist.
    expect(quelle).toMatch(/^BLOB_DIR="\$\{BLOB_DIR:-\$DATA_DIR\/files\}"$/m);
  });

  it("nennt im Kommentar beide produktiven Belegungen, damit der Betreiber waehlen kann", () => {
    // Ein Rueckfall ohne den benannten Alternativwert ist fuer den Betreiber unsichtbar:
    // er sieht keinen Fehler, nur ein zu kleines Tarball.
    expect(quelle).toContain("files_data");
    expect(quelle).toMatch(/BLOB_DIR=\/(var|srv)\//);
  });

  it("erwaehnt BACKUP_KEEP als Multiplikator des neuen Platzbedarfs", () => {
    // Die Blob-Menge geht ab jetzt in JEDE der 7 Generationen ein (Spec §5.5 Punkt 7,
    // §13.2 Frage 12). Steht das nirgends, laeuft die Platte voll, und das Backup
    // scheitert genau dann, wenn man es braucht.
    const block = quelle.split("\n").filter((z) => z.includes("BACKUP_KEEP"));
    expect(block.some((z) => z.trim().startsWith("#"))).toBe(true);
  });
});

describe("scripts/backup.sh — das rsync der Blobs", () => {
  it("kopiert mit rsync -a und schliesst *.part aus", () => {
    // Halbe Uploads gehoeren nicht ins Backup (Spec §5.5 Punkt 4).
    expect(quelle).toContain(`rsync -a --exclude='*${teilSuffixAusStorage()}'`);
  });

  it("schreibt den Quellpfad MIT abschliessendem Schraegstrich", () => {
    // `"$BLOB_DIR"` ohne Slash legt `$work/files/files/…` an. Das Tarball enthaelt dann
    // trotzdem Blobs, die Abbruchpruefung zaehlt trotzdem Dateien — die Wiederherstellung
    // greift nur ins Leere. Diesen Fehler kann NUR der Scan sehen.
    expect(quelle).toContain(`"$BLOB_DIR/" "$work/files/"`);
  });

  it("laeuft nur, wenn das Blob-Verzeichnis existiert", () => {
    // Vor dem ersten Upload existiert es nicht; ein nacktes `rsync` naehme unter
    // `set -euo pipefail` das Backup der anderen drei Module mit.
    const i = zeileMit("rsync -a --exclude=");
    const davor = zeilen.slice(Math.max(0, i - 3), i).join("\n");
    expect(davor).toContain('[ -d "$BLOB_DIR" ]');
  });

  it("benutzt NICHT cp -al", () => {
    // Hardlinks scheitern ueber eine Dateisystemgrenze, und `BLOB_DIR` liegt je nach
    // §13.2 Frage 11 in einem anderen Volume-Root als `$DATA_DIR` — unter `pipefail`
    // waere das ein abgebrochenes Backup ALLER Module.
    expect(befehleText).not.toContain("cp -al");
  });

  it("nennt rsync im Kopf als Voraussetzung des Laeufers", () => {
    // Der Kopf ist die Voraussetzungsliste fuer den Host-Cron und stand bisher auf
    // „sqlite3 + tar". Ein fehlendes rsync auf einem schmalen Zielhost ist unter
    // `set -e` ein abgebrochenes Backup ALLER Module — und die Zeile ist der einzige
    // Ort, an dem das vorher auffaellt.
    // Geprueft wird der Satz BIS ZUM PUNKT, nicht die Zeile: derselbe Kopf erwaehnt
    // „Externes Ziel (rclone/rsync)" im naechsten Satz, und eine Suche ueber die ganze
    // Zeile waere davon von Anfang an gruen gewesen — ohne irgendeine Zusage zu halten.
    const kopf = zeilen.slice(0, 6).join("\n");
    const satz = kopf.match(/benötigt([^.]*)\./);
    expect(satz, "der Kopf fuehrt einen `benötigt …`-Satz").not.toBeNull();
    expect(satz?.[1]).toContain("rsync");
  });

  it("begruendet im Kommentar, warum Konsistenz ohne Freeze hier reicht", () => {
    // Der Grund ist nicht offensichtlich und die naechste Aufraeumrunde entfernte sonst
    // das rsync als vermeintlich unsicher: eine Blob-Datei entsteht ausschliesslich per
    // atomarem `rename` und wird danach nie veraendert.
    expect(quelle).toMatch(/rename/);
  });
});

describe("scripts/backup.sh — die Abbruchpruefung fuer den stillen Fall", () => {
  it("liest die KOPIE in $work und ist auf deren Existenz bedingt", () => {
    // Die laufende DB zu lesen waere ein zweiter, inkonsistenter Stand. Und vor dem
    // ersten files-Deploy gibt es die Datei ueberhaupt nicht — ohne `-f` nimmt der
    // Abbruch das Backup der anderen Module mit.
    expect(quelle).toContain('[ -f "$work/files.db" ]');
    expect(quelle).toContain('sqlite3 "$work/files.db"');
  });

  it("fragt share_files nach bytes_vollstaendig_at und traegt || echo 0", () => {
    // `|| echo 0` ist Pflicht, nicht Vorsicht: vor der ersten Migration existiert die
    // TABELLE nicht, und eine nackte Abfrage bricht unter `pipefail` alles ab.
    expect(quelle).toMatch(/from share_files where bytes_vollstaendig_at is not null/);
    // BEIDE Richtungen des Moduls. Ein Bestand nur aus Inbox-Uploads ist derselbe
    // stille Fall wie einer nur aus Freigaben — gemessen: leere `share_files`, eine
    // vollstaendige Zeile in `inbox_files`, leeres Blob-Verzeichnis → exit 0 und ein
    // Tarball mit leerem `files/`. Der Riegel fragte damals nur die eine Tabelle.
    expect(quelle).toMatch(/from inbox_files where bytes_vollstaendig_at is not null/);
    expect(quelle).toContain("|| echo 0");
  });

  it("bricht mit exit 1 ab, wenn vollstaendige Zeilen ohne kopierte Blobs dastehen", () => {
    // Dieselbe Linie wie der bestehende Abbruch bei „keine *.db gefunden" (:20-23):
    // kein Tarball schreiben und Erfolg melden. Cron soll das sehen, also stderr.
    const i = zeileMit('[ -f "$work/files.db" ]');
    const bis = zeileMit("tar -czf");
    const block = zeilen.slice(i, bis).join("\n");
    expect(block).toContain("exit 1");
    expect(block).toContain(">&2");
    // Die BEDINGUNG gehoert dazu, nicht nur ihre Existenz: mit `-lt 0` statt `-gt 0`
    // (oder `-ne 0` auf der Blob-Seite) steht der ganze Block unveraendert da, feuert
    // aber nie — und ein Scan, der nur `-f`, die Abfrage und `exit 1` sieht, ist dann
    // vollstaendig gruen bei einem toten Riegel. Gemessen: diese Mutation ueberlebte
    // die uebrigen 16 Faelle.
    expect(block).toContain('[ "$zeilen" -gt 0 ]');
    expect(block).toContain('[ "$blobs" -eq 0 ]');
    /*
     * DIE ZAEHLMECHANIK GEHOERT EBENFALLS DAZU — beide Teile, und beide sind
     * gemessen, nicht vermutet:
     *
     * 1. `-type f` weglassen (EIN Token) und der Riegel feuert nie: `find` zaehlt
     *    dann das leere Verzeichnis `$work/files` SELBST mit, `blobs` ist 1 statt
     *    0, und das Backup meldet Erfolg mit einem Tarball ohne einen einzigen
     *    Blob. Nachgestellt mit DATA_DIR=tmp, einer vollstaendigen Zeile in
     *    files.db und leerem $DATA_DIR/files: „backup: wrote …tar.gz", exit 0.
     *    Das ist woertlich der Fehlermodus „leerer Mountpunkt" aus Spec §5.5.
     * 2. Den Wrapper `[ -d "$work/files" ]` weglassen und der Lauf stirbt im
     *    Normalfall VOR dem ersten Upload: `find` schreibt „No such file or
     *    directory", die Kommandosubstitution scheitert, `set -euo pipefail`
     *    reisst alles ab — kein Tarball, auch nicht fuer portal, qr und feedback.
     *
     * Beide Mutationen ueberlebten die uebrigen 16 Faelle gruen.
     */
    expect(block).toContain('find "$work/files" -type f');
    expect(block).toContain('[ -d "$work/files" ]');
  });
});

describe("scripts/backup.sh — die Reihenfolge der vier Bloecke", () => {
  it("stellt rsync und Abbruchpruefung zwischen die sqlite3-Schleife und das eine tar", () => {
    // DIE tragende Zusage dieser Suite. Drei Positionsfehler sind je fuer sich still:
    //  * rsync VOR der `sqlite3 .backup`-Schleife: `$work` existiert, aber die
    //    Abbruchpruefung findet keine `files.db` und schweigt.
    //  * rsync NACH dem `tar`: das Tarball enthaelt keine Blobs, die Rotation hat aber
    //    schon eine gute Generation verdraengt.
    //  * Abbruchpruefung NACH dem `tar`: das Skript schreibt erst ein unbrauchbares
    //    Tarball, rotiert, und faellt dann um.
    // Kein `toContain` sieht irgendeinen davon.
    const schleife = zeileMit(".backup '");
    const kopie = zeileMit("rsync -a --exclude=");
    const pruefung = zeileMit('[ -f "$work/files.db" ]');
    const packen = zeileMit("tar -czf");
    expect(schleife).toBeLessThan(kopie);
    expect(kopie).toBeLessThan(pruefung);
    expect(pruefung).toBeLessThan(packen);
  });
});

describe("scripts/backup.sh — der Zeitstempel ist der NAME der Generation", () => {
  it("prueft, ob der Name schon belegt ist, BEVOR er das Arbeitsverzeichnis anlegt", () => {
    // ⚠️ GEMESSEN MIT ZWEI UNMITTELBAR AUFEINANDERFOLGENDEN LAEUFEN: beide meldeten
    // `backup: wrote …T223946.tar.gz`, beide exit 0 — im Ziel lag EIN Tarball. `date`
    // ist sekundengenau, und `tar -czf` legt nicht daneben, sondern DARUEBER.
    //
    // Die Sperre im Sidecar verhindert das nicht, sie ERZEUGT den Fall: sie
    // serialisiert, und zwei serialisierte Laeufe folgen einander um Sekundenbruchteile.
    // Am externen Ziel wiederholt sich das, weil derselbe Name hochgeladen wird.
    const i = zeileMit('stamp="$(date +%Y%m%dT%H%M%S)"');
    const pruefung = zeileMit('if [ ! -e "$BACKUP_DIR/$stamp.tar.gz" ]; then');
    const anlegen = zeileMit('if mkdir "$BACKUP_DIR/$stamp" 2>/dev/null; then');
    expect(i, "erst stempeln").toBeLessThan(pruefung);
    expect(pruefung, "dann auf Belegung pruefen, erst dann anlegen").toBeLessThan(anlegen);
  });

  it("beansprucht das Arbeitsverzeichnis per exklusivem `mkdir`, nie per `mkdir -p`", () => {
    // ⚠️ DRK-416. `mkdir -p` gelingt auch fuer ein Verzeichnis, das es schon gibt: zwei
    // Laeufe derselben Sekunde kamen beide durch Pruefung und Anlegen, schrieben in
    // DASSELBE Verzeichnis, und das `rm -rf` des einen raeumte es unter dem `tar` des
    // anderen weg. GEMESSEN mit zwei gleichzeitigen Laeufen: vorher meldeten beide
    // `backup: wrote …T195337.tar.gz`, nachher lagen `…T195340` und `…T195341` da.
    // Ein liegengebliebenes Arbeitsverzeichnis (SIGKILL im vorigen Lauf) belegt den
    // Namen damit von selbst — das nackte `mkdir` scheitert daran.
    expect(befehleText).not.toMatch(/mkdir -p "\$work"/);
    expect(befehleText).not.toMatch(/mkdir -p "\$BACKUP_DIR\/\$stamp"/);
    // Nach dem `mkdir` NOCH EINMAL aufs Archiv schauen: ein Lauf mit demselben Stempel
    // kann dazwischen fertig geworden sein (er benennt um, bevor er abraeumt).
    const anlegen = zeileMit('if mkdir "$BACKUP_DIR/$stamp" 2>/dev/null; then');
    const nachpruefen = zeileMit('[ -e "$BACKUP_DIR/$stamp.tar.gz" ] || break');
    const zurueck = zeileMit('rmdir "$BACKUP_DIR/$stamp"');
    expect(anlegen).toBeLessThan(nachpruefen);
    expect(nachpruefen).toBeLessThan(zurueck);
    // `BACKUP_DIR` selbst darf weiter per `-p` entstehen (Aufruf von Hand), aber VOR
    // der Schleife — sonst scheiterte das nackte `mkdir` beim ersten Lauf.
    expect(zeileMit('mkdir -p "$BACKUP_DIR"')).toBeLessThan(anlegen);
  });

  it("WARTET auf die naechste Sekunde, statt einen Zusatz an den Namen zu haengen", () => {
    // ⚠️ DER NAHELIEGENDE FIX WAERE DER FALSCHE. Ein `…T223946-2.tar.gz` faellt aus
    // TARBALL_MUSTER, mit dem `backup-sidecar.sh` am externen Ziel die eigenen
    // Sicherungen von fremden Dateien unterscheidet: es wuerde dort als fremd gewarnt
    // und NIE MEHR wegrotiert. Ausserdem beruht die Rotation darauf, dass der Name
    // lexikografisch wie chronologisch sortiert.
    const rumpf = quelle.slice(
      quelle.indexOf("while :; do"),
      quelle.indexOf('work="$BACKUP_DIR/$stamp"'),
    );
    expect(rumpf).toContain("sleep 1");
    expect(rumpf).toContain('stamp="$(date +%Y%m%dT%H%M%S)"');
    // Kein Namenszusatz — der Stempel bleibt das, was `date` liefert.
    expect(befehleText).not.toMatch(/stamp="\$\{?stamp\}?[-_.]/);
    const muster = readFileSync(path.join(WURZEL, "scripts/backup-sidecar.sh"), "utf8").match(
      /TARBALL_MUSTER='([^']+)'/,
    );
    expect(muster, "TARBALL_MUSTER in scripts/backup-sidecar.sh").not.toBeNull();
    expect(muster?.[1]).toBe(
      "[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9].tar.gz",
    );
  });

  it("bricht ab, statt ewig zu warten, wenn der Stempel nicht wechselt", () => {
    // Eine stehende Uhr liesse die Schleife sonst nie enden und der Dienst haenge
    // stumm. GEMESSEN mit einer `date`-Attrappe: exit 1 nach 5s, die vorhandene
    // Generation unversehrt. Der Sidecar wertet das als Fehlschlag — laut, wie es sein
    // soll; stilles Ueberschreiben ist genau der Schaden, den die Schleife verhindert.
    expect(befehleText).toContain('if [ "$versuche" -gt 5 ]; then');
    expect(befehleText).toMatch(/aborting \(steht die Uhr\?\)/);
    const abbruch = zeileMit('if [ "$versuche" -gt 5 ]; then');
    const schlafen = zeileMit("sleep 1");
    expect(abbruch, "erst zaehlen und abbrechen, dann schlafen").toBeLessThan(schlafen);
  });
});

describe("scripts/backup.sh — ein wachsendes Archiv ist keine Generation", () => {
  it("packt unter `.part` und benennt erst nach dem `tar` um, VOR dem Abraeumen", () => {
    // ⚠️ DRK-416. `tar` schrieb direkt auf den endgueltigen Namen, und ein halbes Archiv
    // passt auf das Muster, mit dem gezaehlt wird: es besetzte einen KEEP-Platz, und die
    // naechste fertige Generation fiel dafuer. GEMESSEN mit SIGKILL mitten im `tar` und
    // 30 MB Daten: vorher lagen 6 MB unter `…T195353.tar.gz`, nachher nur
    // `…T195354.tar.gz.part`.
    const packen = zeileMit('tar -czf "$work.tar.gz.part"');
    const umbenennen = zeileMit('mv -f "$work.tar.gz.part" "$work.tar.gz"');
    const abraeumen = zeilen.findIndex(
      (z, i) => i > packen && !z.trim().startsWith("#") && z.includes('rm -rf "$work"'),
    );
    expect(packen).toBeLessThan(umbenennen);
    // Umbenennen VOR dem Abraeumen: so steht in jedem Augenblick Verzeichnis ODER
    // Archiv, und die Pruefung auf Belegung sieht den Namen nie frei.
    expect(umbenennen).toBeLessThan(abraeumen);
    // Und der Vertrag mit dem Sidecar nennt den FERTIGEN Namen.
    expect(befehleText).toContain('echo "backup: wrote $work.tar.gz"');
  });

  it("der Zwischenname faellt durch BEIDE Zaehlmuster", () => {
    // Lokal rotiert der Sidecar ueber TARBALL_MUSTER, von Hand `backup.sh` ueber
    // `*.tar.gz`. Ein Zwischenname wie `….part.tar.gz` fiele durch das eine, nicht durch
    // das andere — deshalb haengt `.part` HINTER `.tar.gz`.
    // Der Zwischenname kommt aus dem `tar`-Aufruf selbst, nicht aus diesem Test.
    const zusatz = befehleText.match(/tar -czf "\$work([^"]+)"/)?.[1];
    expect(zusatz, "tar packt nach \"$work<zusatz>\"").toBeDefined();
    const name = `20260101T030000${zusatz}`;
    expect(name.endsWith(".tar.gz")).toBe(false);
    const muster = readFileSync(path.join(WURZEL, "scripts/backup-sidecar.sh"), "utf8").match(
      /TARBALL_MUSTER='([^']+)'/,
    );
    expect(muster, "TARBALL_MUSTER in scripts/backup-sidecar.sh").not.toBeNull();
    const p = execFileSync(
      "sh",
      ["-c", 'case "$1" in $2) echo passt ;; *) echo faellt ;; esac', "sh", name, muster?.[1] ?? ""],
      { encoding: "utf8" },
    );
    expect(p.trim()).toBe("faellt");
  });
});

describe("scripts/backup.sh — wer scheitert, raeumt seinen eigenen Rest weg (DRK-476)", () => {
  /**
   * Seit DRK-416 zaehlen `<stempel>/` und `<stempel>.tar.gz.part` bewusst nicht als
   * Generation — und fielen damit aus jeder Rotation. Ein abgebrochener Lauf liess sie
   * fuer immer liegen, und der haeufigste Abbruch ist ausgerechnet ein volles Volume.
   *
   * ⚠️ HIER LAEUFT DAS SKRIPT WIRKLICH, anders als im Rest dieser Datei: `sqlite3`,
   * `rsync` und `tar` sind Attrappen im PATH. Echte Werkzeuge braucht die Frage nicht —
   * sie handelt davon, was nach einem Abbruch im Verzeichnis LIEGT, nicht davon, was im
   * Archiv steht. Und ein Scan saehe die Falle, nicht ihre Wirkung.
   *
   * GEMESSEN mit dem Stand von DRK-416 (ohne Falle): nach `tar`-Fehler wie nach SIGTERM
   * lagen `<stempel>/` und `<stempel>.tar.gz.part` im Verzeichnis.
   */
  const lauf = (tarModus: "ok" | "scheitert" | "haengt", signal?: "TERM" | "HUP" | "KILL") => {
    const kladde = mkdtempSync(path.join(os.tmpdir(), "backup-falle-"));
    const bin = path.join(kladde, "bin");
    const daten = path.join(kladde, "daten");
    mkdirSync(bin);
    mkdirSync(daten);
    writeFileSync(path.join(daten, "portal.db"), "");
    const ablegen = (name: string, inhalt: string) => {
      writeFileSync(path.join(bin, name), inhalt);
      chmodSync(path.join(bin, name), 0o755);
    };
    // `.backup '<ziel>'` → das Ziel anlegen, damit das Arbeitsverzeichnis Inhalt hat.
    ablegen("sqlite3", `#!/bin/sh\nziel=$(printf '%s' "$2" | sed "s/^.backup '\\(.*\\)'$/\\1/")\nprintf db >"$ziel"\n`);
    ablegen("rsync", "#!/bin/sh\nexit 0\n");
    // `tar -czf <ziel> …`: halb schreiben, dann je nach Lage fertig, scheitern oder haengen.
    // Die Marke sagt dem Test, dass das `.part` jetzt liegt — erst dann kommt das Signal.
    ablegen(
      "tar",
      `#!/bin/sh\nprintf halb >"$2"\n: >"${kladde}/packt"\ncase "${tarModus}" in scheitert) exit 2 ;; haengt) sleep 1 ;; esac\nexit 0\n`,
    );
    const skript = signal
      ? `bash "$1" & p=$!; while [ ! -e "$2/packt" ]; do sleep 0.02; done; kill -${signal} "$p"; wait "$p"; echo "rc=$?"; sleep 1.2`
      : `bash "$1"; echo "rc=$?"`;
    try {
      const aus = spawnSync("bash", ["-c", skript, "bash", SKRIPT, kladde], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          DATA_DIR: daten,
          BACKUP_DIR: path.join(daten, "backups"),
          BLOB_DIR: path.join(daten, "files"),
          BACKUP_ROTATE: "0",
        },
      });
      return {
        rc: Number(aus.stdout.match(/rc=(\d+)/)?.[1]),
        uebrig: readdirSync(path.join(daten, "backups")).sort(),
      };
    } finally {
      rmSync(kladde, { recursive: true, force: true });
    }
  };

  it("der gelungene Lauf hinterlaesst genau sein Archiv — die Falle raeumt es NICHT weg", () => {
    const r = lauf("ok");
    expect(r.rc).toBe(0);
    expect(r.uebrig).toHaveLength(1);
    expect(r.uebrig[0]).toMatch(/^\d{8}T\d{6}\.tar\.gz$/);
  });

  it("scheitert `tar` (volles Volume), bleibt weder Verzeichnis noch `.part` liegen", () => {
    const r = lauf("scheitert");
    expect(r.rc).not.toBe(0);
    expect(r.uebrig).toEqual([]);
  });

  // ⚠️ INT NICHT HIER: ein Hintergrundjob einer nicht interaktiven Shell erbt SIGINT als
  // IGNORIERT, und bash kann ein beim Start ignoriertes Signal nicht fangen — gemessen,
  // rc=0 und alles fertig gepackt. Ein echtes Strg-C trifft die Vordergrundgruppe; die
  // Falle dafuer prueft der letzte Fall als Text.
  it.each(["TERM", "HUP"] as const)("nach SIG%s mitten im Packen bleibt nichts liegen", (signal) => {
    const r = lauf("haengt", signal);
    expect(r.rc).not.toBe(0);
    expect(r.uebrig).toEqual([]);
  });

  it("SIGKILL erreicht keine Falle — das ist die Luecke, die der Sidecar schliesst", () => {
    // Die Gegenprobe zur Messung selbst: hier MUSS etwas liegen bleiben, sonst misst der
    // Aufbau nicht, was er vorgibt. Weggeraeumt wird es von `reste_aufraeumen`.
    const r = lauf("haengt", "KILL");
    expect(r.rc).toBe(137);
    expect(r.uebrig).toHaveLength(2);
    expect(r.uebrig[1]).toMatch(/\.tar\.gz\.part$/);
  });

  it("die Falle fasst nur den eigenen Stempel an und ist nach dem Abraeumen entschaerft", () => {
    // Sie wird erst gesetzt, wenn der Stempel per exklusivem `mkdir` UNSER ist — vorher
    // koennte `$work` der Name eines anderen Laufs sein.
    const anspruch = zeileMit('mkdir "$BACKUP_DIR/$stamp"');
    const falle = zeileMit("trap rest_aufraeumen EXIT");
    expect(anspruch).toBeLessThan(falle);
    expect(befehleText).toContain('rm -rf "$eigener_rest" "$eigener_rest.tar.gz.part"');
    expect(befehleText).not.toMatch(/rm -rf[^\n]*\.tar\.gz"/);
    // Entschaerft erst NACH dem regulaeren Abraeumen: scheitert das `rm -rf`, versucht es
    // die Falle noch einmal — das fertige Archiv faellt dabei nie darunter.
    const umbenennen = zeileMit('mv -f "$work.tar.gz.part" "$work.tar.gz"');
    const entschaerft = zeileMit('eigener_rest=""');
    expect(entschaerft).toBeGreaterThan(umbenennen);
    for (const s of ["TERM", "INT", "HUP"]) expect(befehleText).toMatch(new RegExp(`trap 'exit \\d+' ${s}`));
  });
});

describe("scripts/backup.sh — was unveraendert bleiben muss", () => {
  it("packt genau EIN tar und haengt nichts an ein gzip-Archiv an", () => {
    // `tar -rf` an ein gzip-Archiv ist unmoeglich („Cannot append to compressed
    // archive") und braeche unter `set -euo pipefail` den GANZEN Lauf ab — auch fuer
    // portal, qr und feedback. Deshalb wandern die Blobs vorher ins Arbeitsverzeichnis.
    expect(quelle).toContain('tar -czf "$work.tar.gz.part" -C "$BACKUP_DIR" "$stamp"');
    expect(befehleText).not.toMatch(/tar\s+-[a-z]*r/);
    expect(befehle.filter((z) => z.includes("tar -"))).toHaveLength(1);
  });

  it("laesst die Rotation und den bestehenden DATA_DIR-Abbruch stehen", () => {
    expect(quelle).toContain('ls -1t "$BACKUP_DIR"/*.tar.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f');
    expect(quelle).toContain("shopt -s nullglob");
    expect(quelle).toContain("shopt -u nullglob");
    expect(quelle).toContain('if [ "${#dbs[@]}" -eq 0 ]; then');
    expect(quelle).toContain("set -euo pipefail");
  });

  it("KEEP verliert fuehrende Nullen, bevor die Rotation damit rechnet", () => {
    // ⚠️ Fuehrende Nullen sind in Shell-Arithmetik OKTAL, mit zwei Folgen: `08` bricht
    // `tail -n +$((KEEP + 1))` mit einem Syntaxfehler ab, `010` rechnet STILL 8 statt 10.
    // Gemessen mit zwoelf Generationen und BACKUP_KEEP=010: vorher blieben 8, jetzt 10.
    const i = zeileMit('KEEP="${BACKUP_KEEP:-7}"');
    const j = zeileMit('KEEP="${KEEP#0}"');
    const rotation = zeileMit("tail -n +$((KEEP + 1))");
    expect(j, "entnullt wird direkt nach der Belegung").toBeGreaterThan(i);
    expect(j, "und lange vor der Rotation").toBeLessThan(rotation);
  });

  it("ist syntaktisch gueltiges bash", () => {
    // Ein Cron-Skript mit Syntaxfehler faellt sonst nachts auf, und dann fuer alle
    // vier Module gleichzeitig.
    expect(() => execFileSync("bash", ["-n", SKRIPT], { stdio: "pipe" })).not.toThrow();
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { pruefeSignatur } from "./einsatzbuch-signaturen-pruefen.mjs";

/*
 * Die Prüfung, die `release-veroeffentlichen` vor dem Veröffentlichen fährt: Passt jede `.sig`
 * zum öffentlichen Schlüssel in `tauri.conf.json`? Die Werte unten sind echte Ausgaben von
 * `tauri signer generate` und `tauri signer sign` (CLI 2.11.5, 25.09.2026) mit zwei
 * Wegwerf-Schlüsselpaaren; die privaten Teile sind gelöscht. So prüft der Test gegen das, was
 * Tauri wirklich erzeugt, nicht gegen die eigene Lesart des Formats.
 */

// Inhalt der `.pub`-Dateien, so wie er in `plugins.updater.pubkey` stünde.
const PUB_A =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEZCQzUwQjU4RDUyNTQwQzIKUldUQ1FDWFZXQXZGK3dnemV2blk5R1ptbHVkbmhLN0V2ZCtNbWlpUnlNOWxybHRnUTgxbytnT2EK";
const PUB_B =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDIxQzcxMzAyQ0Y5QTkxOEMKUldTTWtaclBBaFBISWRzVEpwall3L0x4Q0cvQTRoajhGRTlNODhCSTQ4dVc1azJuVVV5eG5mTnUK";
// Inhalt der `.sig`-Datei zu `DATEN`, signiert mit Schlüssel A.
const SIG_A =
  "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVUQ1FDWFZXQXZGKzVKcXp6UDdsaXRESkplSm1GRE9OcUxJU3A0TWlxbWUwWFIrSHpiMXRMdDg3eTJMN0JhVGE3WjFuZkZDUjdaNGZlQUtlZDJucWQ5UTVtQyt2OFJOMmc4PQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkwMzc0NjM1CWZpbGU6cGFrZXQuYmluCk1lZmQvTG9pKzdjYms5M0VGcTg4L05McDZiaXRjUC9FSHlOUlFaTW1hbHdXekpIQVZzT1lNdFZpV2ptMU5VeFpXUmVVV2V2QVF5bC96YXVEbzVNYURRPT0K";
// Dieselben Daten, signiert mit Schlüssel B.
const SIG_B =
  "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVTTWtaclBBaFBISVlZZ09QOXNpamhQcHR3UUJEOEd5Yk5IUUVmMUNLUGRBVnFUZXVqditXaU5sdlF3RFd6eUdRVzZpbng1VTJ1K1k3WHl4U0o0TTN5OUp0VlpKOUVndmdnPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkwMzc1MzYyCWZpbGU6cGFrZXQtYi5iaW4KazJZUFJGTTlmaU5nRUcrS0hJRnhua1dFTmR2OU1JTVVWN2pmK3VMNGlrWnFxU1hxLzM5b20vYkZkWUcxcmJ1THNwNmhXVGJPMk9nbVo0Q2NnZzA4Q3c9PQo=";
const DATEN = Buffer.from("Einsatzbuch Testpaket\n", "utf8");

const zeilen = (b64: string) => Buffer.from(b64, "base64").toString("utf8").split("\n");
const kodiere = (z: string[]) => Buffer.from(z.join("\n"), "utf8").toString("base64");

describe("pruefeSignatur — Ausgaben von tauri signer", () => {
  it("Tauri signiert vorgehasht (Algorithmus ED)", () => {
    expect(Buffer.from(zeilen(SIG_A)[1], "base64").subarray(0, 2).toString("latin1")).toBe("ED");
  });

  it("passende Signatur", () => {
    expect(pruefeSignatur({ pubkey: PUB_A, signatur: SIG_A, daten: DATEN })).toBeNull();
    expect(pruefeSignatur({ pubkey: PUB_B, signatur: SIG_B, daten: DATEN })).toBeNull();
  });

  it("Signatur eines anderen Schlüssels nennt beide Schlüssel-IDs", () => {
    const grund = pruefeSignatur({ pubkey: PUB_B, signatur: SIG_A, daten: DATEN });
    expect(grund).toContain("Signiert mit Schlüssel FBC50B58D52540C2, tauri.conf.json nennt aber 21C71302CF9A918C");
    expect(grund).toContain("TAURI_SIGNING_PRIVATE_KEY");
    expect(pruefeSignatur({ pubkey: PUB_A, signatur: SIG_B, daten: DATEN })).toContain("Signiert mit Schlüssel 21C71302CF9A918C");
  });

  it("veränderte Datei", () => {
    const anders = Buffer.from(DATEN);
    anders[0] ^= 1;
    expect(pruefeSignatur({ pubkey: PUB_A, signatur: SIG_A, daten: anders })).toMatch(/passt nicht zur Datei/);
  });

  it("veränderter trusted comment", () => {
    const z = zeilen(SIG_A);
    z[2] = z[2].replace("paket.bin", "paket.exe");
    expect(pruefeSignatur({ pubkey: PUB_A, signatur: kodiere(z), daten: DATEN })).toMatch(/globale Signatur passt nicht/);
  });

  it("Platzhalter und kaputtes Base64 statt Schlüssel oder Signatur", () => {
    const platzhalter = "PLATZHALTER — öffentlichen Minisign-Schlüssel nach docs/runbooks/einsatzbuch-release.md eintragen";
    expect(pruefeSignatur({ pubkey: platzhalter, signatur: SIG_A, daten: DATEN })).toBe("Der öffentliche Schlüssel ist kein Base64.");
    expect(pruefeSignatur({ pubkey: PUB_A, signatur: `${SIG_A}#`, daten: DATEN })).toBe("Die Signaturdatei ist kein Base64.");
    expect(pruefeSignatur({ pubkey: PUB_A, signatur: kodiere(zeilen(SIG_A).slice(0, 2)), daten: DATEN })).toMatch(
      /keine Minisign-Signatur/,
    );
  });

  it("nimmt eine .sig mit Zeilenende am Schluss", () => {
    expect(pruefeSignatur({ pubkey: PUB_A, signatur: `${SIG_A}\n`, daten: DATEN })).toBeNull();
  });
});

/**
 * Das alte Minisign-Format `Ed` (ohne Vorhash) erzeugt `tauri signer` nicht, der Updater nimmt es
 * aber an (`allow_legacy = true`). Hier mit einem frischen Ed25519-Paar nachgebaut.
 */
describe("pruefeSignatur — altes Format Ed", () => {
  function altesPaar(daten: Buffer, kommentar = "timestamp:1790374635\tfile:alt.bin") {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const roh = Buffer.from(publicKey.export({ format: "jwk" }).x as string, "base64url");
    const id = randomBytes(8);
    const pub = Buffer.concat([Buffer.from("Ed", "latin1"), id, roh]);
    const pubkey = kodiere(["untrusted comment: minisign public key", pub.toString("base64"), ""]);
    const sig = sign(null, daten, privateKey);
    const global = sign(null, Buffer.concat([sig, Buffer.from(kommentar)]), privateKey);
    const signatur = kodiere([
      "untrusted comment: signature from minisign secret key",
      Buffer.concat([Buffer.from("Ed", "latin1"), id, sig]).toString("base64"),
      `trusted comment: ${kommentar}`,
      global.toString("base64"),
      "",
    ]);
    return { pubkey, signatur };
  }

  it("passend und verändert", () => {
    const { pubkey, signatur } = altesPaar(DATEN);
    expect(pruefeSignatur({ pubkey, signatur, daten: DATEN })).toBeNull();
    expect(pruefeSignatur({ pubkey, signatur, daten: Buffer.from("anders") })).toMatch(/passt nicht zur Datei/);
  });

  // Der Bundler schreibt die Version in den trusted comment (gemessen, CLI 2.11.5); der Updater
  // lehnt ab, wenn sie nicht zur Version in `latest.json` passt.
  it("signierte Version gegen --version", () => {
    const { pubkey, signatur } = altesPaar(DATEN, "timestamp:1790403543\tfile:Einsatzbuch.app.tar.gz\tversion:1.2.3");
    expect(pruefeSignatur({ pubkey, signatur, daten: DATEN, version: "1.2.3" })).toBeNull();
    expect(pruefeSignatur({ pubkey, signatur, daten: DATEN })).toBeNull();
    expect(pruefeSignatur({ pubkey, signatur, daten: DATEN, version: "1.2.4" })).toBe(
      "Signiert für Version 1.2.3, latest.json nennt aber 1.2.4: Der Updater lehnte das Update ab.",
    );
    // Ohne Feld (so signiert `tauri signer sign`) nimmt der Updater an, also auch die Prüfung.
    const ohne = altesPaar(DATEN);
    expect(pruefeSignatur({ pubkey: ohne.pubkey, signatur: ohne.signatur, daten: DATEN, version: "1.2.4" })).toBeNull();
  });
});

describe("Aufruf im Workflow", () => {
  const skript = path.join(__dirname, "einsatzbuch-signaturen-pruefen.mjs");
  let ordner: string;

  beforeAll(() => {
    ordner = mkdtempSync(path.join(tmpdir(), "signaturen-"));
    writeFileSync(path.join(ordner, "paket.bin"), DATEN);
    writeFileSync(path.join(ordner, "paket.bin.sig"), SIG_A);
    writeFileSync(path.join(ordner, "ohne-sig.bin"), DATEN);
    for (const [name, pubkey] of [
      ["a.json", PUB_A],
      ["b.json", PUB_B],
    ]) {
      writeFileSync(path.join(ordner, name), JSON.stringify({ plugins: { updater: { pubkey } } }));
    }
  });

  afterAll(() => rmSync(ordner, { recursive: true, force: true }));

  const lauf = (config: string, ...pakete: string[]) =>
    spawnSync(process.execPath, [skript, "--config", path.join(ordner, config), ...pakete.map((p) => path.join(ordner, p))], {
      encoding: "utf8",
    });

  it("Exit 0, wenn alles passt", () => {
    const r = lauf("a.json", "paket.bin");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("Signatur passt: paket.bin\n");
  });

  it("Exit 1 mit Anmerkung und Weg zum Runbook bei fremdem Schlüssel", () => {
    const r = lauf("b.json", "paket.bin");
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/^::error file=.*paket\.bin\.sig::paket\.bin: Signiert mit Schlüssel FBC50B58D52540C2/);
    expect(r.stdout).toContain("docs/runbooks/einsatzbuch-release.md (Abschnitt „Updater-Schlüssel“)");
  });

  it("Exit 1, wenn eine .sig fehlt, auch wenn eine andere passt", () => {
    const r = lauf("a.json", "paket.bin", "ohne-sig.bin");
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("Signatur passt: paket.bin");
    expect(r.stdout).toContain("ohne-sig.bin: Die Signaturdatei fehlt.");
  });
});

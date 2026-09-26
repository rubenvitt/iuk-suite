#!/usr/bin/env node
/**
 * Prüft vor dem Veröffentlichen, dass jede Updater-Signatur (`.sig`) zum öffentlichen Schlüssel
 * in `apps/einsatzbuch/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`) passt.
 *
 * Gerufen vom Job `release-veroeffentlichen` in `.github/workflows/einsatzbuch.yml`, bevor ein
 * Release angelegt oder `latest.json` ersetzt wird:
 *
 *   node scripts/einsatzbuch-signaturen-pruefen.mjs \
 *     --config apps/einsatzbuch/src-tauri/tauri.conf.json --version 1.2.3 \
 *     auslieferung/Einsatzbuch.app.tar.gz auslieferung/Einsatzbuch_1.2.3_x64-setup.exe
 *
 * Zu jedem Paket gehört `<Paket>.sig` daneben. Warum: Passt der private Schlüssel der CI nicht
 * zum öffentlichen, warnt `tauri build` nur. Das Release entstünde, und jede installierte App
 * lehnte das Update still ab. Runbook: docs/runbooks/einsatzbuch-release.md, Abschnitt
 * „Updater-Schlüssel“.
 *
 * Geprüft wird wie beim Updater selbst (`tauri-plugin-updater`, `verify_signature`, das
 * `minisign_verify::PublicKey::verify` mit `allow_legacy = true` ruft):
 * - Beide Werte sind Base64 einer Minisign-Datei. Der Schlüssel: Kommentarzeile, dann
 *   Base64 von `Ed` + Schlüssel-ID (8 Byte) + Ed25519-Schlüssel (32 Byte). Die Signatur:
 *   Kommentarzeile, Base64 von Algorithmus (2 Byte) + Schlüssel-ID + Signatur (64 Byte), die
 *   Zeile `trusted comment: …` und die globale Signatur (64 Byte) über Signatur und Kommentar.
 * - Algorithmus `ED` (vorgehasht, BLAKE2b-512; das erzeugt `tauri signer`, gemessen am
 *   25.09.2026 mit CLI 2.11.5) oder `Ed` (alt, über die Rohdaten).
 * - Schlüssel-ID gleich, Signatur über die Datei gültig, globale Signatur gültig.
 * - Mit `--version`: Trägt der trusted comment ein Feld `version:` (das schreibt der Bundler von
 *   CLI 2.11.5, gemessen am 26.09.2026 an einem Debug-Bundle mit Versions-Overlay), muss es diese
 *   Version sein. Der Updater (`verify_signed_version`) vergleicht es mit der Version aus
 *   `latest.json` und lehnt bei Abweichung ab; fehlt das Feld, nimmt er an, und so auch hier.
 *
 * Wie `scripts/einsatzbuch-updater-json.mjs` ohne Abhängigkeiten: Node bringt Ed25519 und
 * BLAKE2b-512 mit, der Job braucht weder `pnpm install` noch ein Paket aus apt.
 */
import { createHash, createPublicKey, verify } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const RUNBOOK = "docs/runbooks/einsatzbuch-release.md (Abschnitt „Updater-Schlüssel“)";
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const KOMMENTAR = "trusted comment: ";

/**
 * Strenges Base64: `Buffer.from(…, "base64")` überspringt fremde Zeichen still.
 * @param {string} text
 * @param {string} was
 */
function base64(text, was) {
  const t = text.trim();
  if (t.length === 0 || t.length % 4 !== 0 || !BASE64.test(t)) {
    throw new Error(`${was} ist kein Base64.`);
  }
  return Buffer.from(t, "base64");
}

/**
 * Schlüssel-ID so, wie Minisign sie in Kommentaren zeigt (Little Endian, groß geschrieben).
 * @param {Buffer} id
 */
function zeigeId(id) {
  return Buffer.from(id).reverse().toString("hex").toUpperCase();
}

/**
 * @param {string} pubkey Inhalt von `plugins.updater.pubkey` (Base64 der `.pub`-Datei)
 * @returns {{ id: Buffer; schluessel: import("node:crypto").KeyObject }}
 */
export function leseSchluessel(pubkey) {
  const zeilen = base64(pubkey, "Der öffentliche Schlüssel").toString("utf8").split(/\r?\n/);
  if (!zeilen[0]?.startsWith("untrusted comment:") || zeilen[1] === undefined) {
    throw new Error("Der öffentliche Schlüssel ist keine Minisign-Datei (Kommentar- und Schlüsselzeile).");
  }
  const roh = base64(zeilen[1], "Die Schlüsselzeile");
  if (roh.length !== 42 || roh.subarray(0, 2).toString("latin1") !== "Ed") {
    throw new Error("Die Schlüsselzeile ist kein öffentlicher Ed25519-Schlüssel von Minisign.");
  }
  const schluessel = createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: roh.subarray(10).toString("base64url") },
    format: "jwk",
  });
  return { id: roh.subarray(2, 10), schluessel };
}

/**
 * Prüft eine Signatur gegen Schlüssel und Daten.
 * @param {{ pubkey: string; signatur: string; daten: Buffer; version?: string }} eingabe
 * @returns {string | null} `null`, wenn sie passt, sonst der Grund
 */
export function pruefeSignatur({ pubkey, signatur, daten, version }) {
  try {
    const { id, schluessel } = leseSchluessel(pubkey);
    const zeilen = base64(signatur, "Die Signaturdatei").toString("utf8").split(/\r?\n/);
    if (!zeilen[0]?.startsWith("untrusted comment:") || zeilen.length < 4 || !zeilen[2].startsWith(KOMMENTAR)) {
      return "Die Signaturdatei ist keine Minisign-Signatur (vier Zeilen mit „trusted comment“).";
    }
    const kopf = base64(zeilen[1], "Die Signaturzeile");
    const global = base64(zeilen[3], "Die globale Signatur");
    if (kopf.length !== 74 || global.length !== 64) {
      return "Die Signaturdatei hat nicht die Längen einer Minisign-Signatur.";
    }
    const algorithmus = kopf.subarray(0, 2).toString("latin1");
    const sigId = kopf.subarray(2, 10);
    const sig = kopf.subarray(10);
    if (!sigId.equals(id)) {
      return (
        `Signiert mit Schlüssel ${zeigeId(sigId)}, tauri.conf.json nennt aber ${zeigeId(id)}: ` +
        "Das Secret TAURI_SIGNING_PRIVATE_KEY passt nicht zum öffentlichen Schlüssel."
      );
    }
    let nachricht;
    if (algorithmus === "ED") nachricht = createHash("blake2b512").update(daten).digest();
    else if (algorithmus === "Ed") nachricht = daten;
    else return `Unbekannter Signaturalgorithmus „${algorithmus}“.`;
    if (!verify(null, nachricht, schluessel, sig)) {
      return "Die Signatur passt nicht zur Datei (Datei verändert oder mit einem anderen Schlüssel gleicher ID signiert).";
    }
    const kommentar = Buffer.from(zeilen[2].slice(KOMMENTAR.length), "utf8");
    if (!verify(null, Buffer.concat([sig, kommentar]), schluessel, global)) {
      return "Die globale Signatur passt nicht: Der „trusted comment“ wurde verändert.";
    }
    if (version !== undefined) {
      const signiert = kommentar
        .toString("utf8")
        .split("\t")
        .find((feld) => feld.startsWith("version:"))
        ?.slice("version:".length);
      if (signiert !== undefined && signiert.replace(/^v/, "") !== version.replace(/^v/, "")) {
        return `Signiert für Version ${signiert}, latest.json nennt aber ${version}: Der Updater lehnte das Update ab.`;
      }
    }
    return null;
  } catch (e) {
    return /** @type {Error} */ (e).message;
  }
}

/**
 * @param {string[]} argv
 * @returns {number} Exit-Code
 */
export function hauptprogramm(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { config: { type: "string" }, version: { type: "string" } },
    allowPositionals: true,
  });
  const config = values.config;
  if (!config || positionals.length === 0) {
    process.stderr.write(
      "Aufruf: einsatzbuch-signaturen-pruefen.mjs --config <tauri.conf.json> [--version X.Y.Z] <Paket> [<Paket> …]\n",
    );
    return 2;
  }
  const pubkey = JSON.parse(readFileSync(config, "utf8"))?.plugins?.updater?.pubkey;
  if (typeof pubkey !== "string") {
    process.stdout.write(`::error file=${config}::plugins.updater.pubkey fehlt – siehe ${RUNBOOK}.\n`);
    return 1;
  }
  let fehler = 0;
  for (const paket of positionals) {
    const sigDatei = `${paket}.sig`;
    const grund = !existsSync(paket)
      ? "Das Paket fehlt."
      : !existsSync(sigDatei)
        ? "Die Signaturdatei fehlt."
        : pruefeSignatur({ pubkey, signatur: readFileSync(sigDatei, "utf8"), daten: readFileSync(paket), version: values.version });
    if (grund === null) {
      process.stdout.write(`Signatur passt: ${path.basename(paket)}\n`);
    } else {
      process.stdout.write(
        `::error file=${sigDatei}::${path.basename(paket)}: ${grund} Keine installierte App nähme dieses Update an; ` +
          `nichts wird veröffentlicht – siehe ${RUNBOOK}.\n`,
      );
      fehler = 1;
    }
  }
  return fehler;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(hauptprogramm(process.argv.slice(2)));
}

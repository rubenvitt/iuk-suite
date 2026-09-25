#!/usr/bin/env node
/**
 * Baut `latest.json`, das Manifest, das der Updater der Einsatzbuch-Desktop-App liest
 * (`plugins.updater.endpoints` in `apps/einsatzbuch/src-tauri/tauri.conf.json`).
 *
 * Gerufen vom Job `release-veroeffentlichen` in `.github/workflows/einsatzbuch.yml`:
 *
 *   node scripts/einsatzbuch-updater-json.mjs --version 1.2.3 --tag einsatzbuch-v1.2.3 \
 *     --mac-archiv Einsatzbuch.app.tar.gz --mac-sig Einsatzbuch.app.tar.gz.sig \
 *     --win-installer Einsatzbuch_1.2.3_x64-setup.exe --win-sig Einsatzbuch_1.2.3_x64-setup.exe.sig \
 *     > latest.json
 *
 * Optional: `--repo owner/name` (sonst `GITHUB_REPOSITORY`), `--notes …` (sonst
 * „Einsatzbuch X.Y.Z“), `--pub-date …` (sonst jetzt). Runbook: docs/runbooks/einsatzbuch-release.md.
 *
 * Das Format ist das statische JSON des Tauri-2-Updaters (https://v2.tauri.app/plugin/updater/,
 * „Static JSON File“): `version`, `notes`, `pub_date` (RFC 3339) und je Plattform `signature`
 * (der INHALT der `.sig`-Datei, nicht ihr Pfad) und `url`. macOS kommt als ein universelles
 * Bundle; `darwin-aarch64` und `darwin-x86_64` zeigen deshalb auf dasselbe Archiv.
 *
 * Wie `scripts/version.mjs` ohne Abhängigkeiten, damit der Job ohne `pnpm install` auskommt.
 * Jeder Fehler bricht laut ab: ein halbes Manifest am Dauer-Release hielte jede installierte
 * App vom nächsten Update fern.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/** @typedef {{ datei: string; signatur: string }} Paket */
/** @typedef {{ signature: string; url: string }} Plattform */
/**
 * @typedef {{
 *   version: string;
 *   notes: string;
 *   pub_date: string;
 *   platforms: Record<"darwin-aarch64" | "darwin-x86_64" | "windows-x86_64", Plattform>;
 * }} LatestJson
 */

/**
 * Nur `X.Y.Z`, ohne `v`: der Workflow schneidet `einsatzbuch-v` vom Tag ab und prüft vorher,
 * dass die Nummer in `tauri.conf.json`, `package.json` und `Cargo.toml` steht. Ein Rest des
 * Präfixes hier hieße, dass dieser Schnitt misslang.
 */
const VERSION_MUSTER = /^\d+\.\d+\.\d+$/;

/** Inhalt einer `.sig`-Datei: Base64 (Standardalphabet), ein Pfad oder Leerraum scheitert. */
const SIGNATUR_MUSTER = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * @param {string} name
 * @param {Partial<Paket> | undefined} paket
 * @returns {Paket}
 */
function pruefePaket(name, paket) {
  const datei = paket?.datei ?? "";
  if (!datei || datei !== path.posix.basename(datei) || datei.includes("\\")) {
    throw new Error(`Dateiname für ${name} fehlt oder enthält ein Verzeichnis: "${datei}"`);
  }
  const signatur = (paket?.signatur ?? "").trim();
  if (!signatur) {
    throw new Error(`Signatur für ${name} fehlt oder ist leer (Inhalt der .sig-Datei).`);
  }
  if (!SIGNATUR_MUSTER.test(signatur)) {
    throw new Error(`Signatur für ${name} ist kein Base64 — Inhalt der .sig-Datei erwartet, nicht ihr Pfad.`);
  }
  return { datei, signatur };
}

/**
 * Das Manifest im Tauri-2-Format.
 *
 * @param {{
 *   version: string;
 *   notes: string;
 *   pubDate: Date | string;
 *   repo: string;
 *   tag: string;
 *   assets: { mac: Paket; windows: Paket };
 * }} eingabe
 * @returns {LatestJson}
 */
export function baueLatestJson({ version, notes, pubDate, repo, tag, assets }) {
  if (!VERSION_MUSTER.test(version ?? "")) {
    throw new Error(`Keine Version: "${version}" (erwartet X.Y.Z ohne v-Präfix)`);
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo ?? "")) {
    throw new Error(`Kein GitHub-repo: "${repo}" (erwartet owner/name)`);
  }
  if (!tag) throw new Error("Kein Release-tag angegeben.");
  const zeitpunkt = pubDate instanceof Date ? pubDate : new Date(pubDate);
  if (Number.isNaN(zeitpunkt.getTime())) {
    throw new Error(`pubDate ist kein Zeitpunkt: "${String(pubDate)}"`);
  }
  const mac = pruefePaket("mac", assets?.mac);
  const windows = pruefePaket("windows", assets?.windows);

  /** @param {Paket} p @returns {Plattform} */
  const plattform = (p) => ({
    signature: p.signatur,
    url: `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(p.datei)}`,
  });

  return {
    version,
    notes,
    pub_date: zeitpunkt.toISOString(),
    platforms: {
      "darwin-aarch64": plattform(mac),
      "darwin-x86_64": plattform(mac),
      "windows-x86_64": plattform(windows),
    },
  };
}

/**
 * @param {string} datei
 */
function leseSignatur(datei) {
  try {
    return readFileSync(datei, "utf8");
  } catch (e) {
    throw new Error(`Signaturdatei nicht lesbar: ${datei} (${/** @type {Error} */ (e).message})`);
  }
}

/**
 * Der Dateiname eines Pakets, das neben dem Manifest hochgeladen wird. Es muss da sein: sonst
 * zeigte `latest.json` auf eine Datei, die es im Release nicht gibt.
 *
 * @param {string} datei
 */
function paketName(datei) {
  if (!statSync(datei, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Paket nicht gefunden: ${datei}`);
  }
  return path.basename(datei);
}

/** @param {string[]} argv */
function hauptprogramm(argv) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      version: { type: "string" },
      tag: { type: "string" },
      repo: { type: "string" },
      notes: { type: "string" },
      "pub-date": { type: "string" },
      "mac-archiv": { type: "string" },
      "mac-sig": { type: "string" },
      "win-installer": { type: "string" },
      "win-sig": { type: "string" },
    },
  });
  for (const pflicht of ["version", "tag", "mac-archiv", "mac-sig", "win-installer", "win-sig"]) {
    if (!values[/** @type {keyof typeof values} */ (pflicht)]) {
      throw new Error(`Argument --${pflicht} fehlt.`);
    }
  }
  const version = /** @type {string} */ (values.version);
  const manifest = baueLatestJson({
    version,
    notes: values.notes ?? `Einsatzbuch ${version}`,
    pubDate: values["pub-date"] ?? new Date(),
    repo: values.repo ?? process.env.GITHUB_REPOSITORY ?? "",
    tag: /** @type {string} */ (values.tag),
    assets: {
      mac: {
        datei: paketName(/** @type {string} */ (values["mac-archiv"])),
        signatur: leseSignatur(/** @type {string} */ (values["mac-sig"])),
      },
      windows: {
        datei: paketName(/** @type {string} */ (values["win-installer"])),
        signatur: leseSignatur(/** @type {string} */ (values["win-sig"])),
      },
    },
  });
  // Nur das Manifest auf stdout: der Workflow leitet stdout in `latest.json` um.
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    hauptprogramm(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`einsatzbuch-updater-json: ${/** @type {Error} */ (e).message}\n`);
    process.exit(1);
  }
}

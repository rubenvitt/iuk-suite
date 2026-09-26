// @vitest-environment node
/// <reference types="node" />
/**
 * Versionsgleichheit der Desktop-App (Stufe 7, Review Focus 5): Dieselbe Nummer steht in
 * `src-tauri/tauri.conf.json` (Tauri schreibt sie in Bundle und Dateinamen, der Updater vergleicht
 * sie mit `latest.json`), in `package.json`, in `src-tauri/Cargo.toml` (`[package]`) und im
 * Eintrag der App in `src-tauri/Cargo.lock` — alle Jobs bauen mit `--locked`, ein veraltetes
 * Lockfile bräche den Release-Lauf erst in der CI ab.
 *
 * Der Release-Workflow (`.github/workflows/einsatzbuch.yml`, Schritt „Tag und Version stimmen
 * überein“) prüft zusätzlich den Tag. Dieser Test fängt die Abweichung schon im Versions-PR.
 * Runbook: docs/runbooks/einsatzbuch-release.md, Abschnitt „Release taggen“.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** Pfade relativ zu dieser Datei, nicht zum Arbeitsverzeichnis des Laufs. */
function lies(relativ: string): string {
  return readFileSync(fileURLToPath(new URL(relativ, import.meta.url)), "utf8");
}

/**
 * `version` aus dem Abschnitt `[package]` wie im Workflow: ab der Kopfzeile bis zum nächsten
 * Abschnitt. Ein `version` in `[workspace.package]` oder an einer Abhängigkeit zählt nicht.
 */
function cargoVersion(toml: string): string | undefined {
  const zeilen = toml.split(/\r?\n/).map((z) => z.trim());
  const start = zeilen.indexOf("[package]");
  if (start < 0) return undefined;
  for (const zeile of zeilen.slice(start + 1)) {
    if (zeile.startsWith("[")) return undefined;
    const treffer = /^version\s*=\s*"([^"]*)"/.exec(zeile);
    if (treffer) return treffer[1];
  }
  return undefined;
}

/** Die Version des Pakets `name` in `Cargo.lock` (`[[package]]`-Block mit `name = "…"`). */
function lockVersion(lock: string, name: string): string | undefined {
  for (const block of lock.split(/^\[\[package\]\]$/m)) {
    if (new RegExp(`^name = "${name}"$`, "m").test(block)) {
      return /^version = "([^"]*)"$/m.exec(block)?.[1];
    }
  }
  return undefined;
}

const SEMVER = /^\d+\.\d+\.\d+$/;

describe("Versionsgleichheit der Desktop-App", () => {
  const tauri = (JSON.parse(lies("../src-tauri/tauri.conf.json")) as { version?: string }).version;
  const paket = (JSON.parse(lies("../package.json")) as { version?: string }).version;
  const cargo = cargoVersion(lies("../src-tauri/Cargo.toml"));
  const cargoLock = lockVersion(lies("../src-tauri/Cargo.lock"), "einsatzbuch");

  // Erst die Form: Drei fehlende Werte wären untereinander gleich und der Vergleich darunter grün.
  it.each([
    ["src-tauri/tauri.conf.json", tauri],
    ["package.json", paket],
    ["src-tauri/Cargo.toml [package]", cargo],
    ["src-tauri/Cargo.lock (einsatzbuch)", cargoLock],
  ])("%s trägt eine Version X.Y.Z", (_datei, version) => {
    expect(version).toMatch(SEMVER);
  });

  it("tauri.conf.json, package.json und Cargo.toml nennen dieselbe Version", () => {
    expect({ paket, cargo }).toEqual({ paket: tauri, cargo: tauri });
  });

  it("Cargo.lock ist nach einer Versionsänderung nachgezogen", () => {
    expect(cargoLock).toBe(cargo);
  });

  it("cargoVersion liest nur den Abschnitt [package]", () => {
    const toml = [
      "[workspace.package]",
      'version = "9.9.9"',
      "",
      "[package]",
      'name = "einsatzbuch"',
      'version = "1.2.3"',
      "",
      "[dependencies]",
      'serde = { version = "1" }',
    ].join("\n");
    expect(cargoVersion(toml)).toBe("1.2.3");
    expect(cargoVersion('[package]\nname = "x"\n\n[dependencies]\nversion = "1.0.0"\n')).toBeUndefined();
  });
});

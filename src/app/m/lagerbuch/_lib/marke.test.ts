import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LAGERBUCH_MARKE, LAGERBUCH_ZEILE, lagerbuchOrganisation } from "./marke";

const MARKE_TS = join(process.cwd(), "src/app/m/lagerbuch/_lib/marke.ts");

/**
 * Die Client-DIREKTIVE, nicht die Zeichenkette irgendwo im Text.
 *
 * ⚠️ EIN NACKTES `toContain('"use client"')` WAERE HIER FALSCH, und der Grund
 * ist nicht Bequemlichkeit: `marke.ts` muss die Client-Grenze ERKLAEREN (der
 * Organisationsname darf nur serverseitig gelesen werden), und eine Erklaerung,
 * die den Ausdruck nicht nennen darf, ist keine. Die Direktive wirkt ausserdem
 * ausschliesslich als erste Anweisung einer Datei — genau das misst diese
 * Probe, und sie ist DIESELBE, die unten jede Client-Datei des Moduls findet.
 */
const CLIENT_DIREKTIVE = /^\s*(["'])use client\1/m;
const MODUL = join(process.cwd(), "src/app/m/lagerbuch");

/**
 * Die ERWARTETEN Werte, und zwar als EIGENE Tabelle dieses Tests. `marke.ts`
 * exportiert seine Vorgabe absichtlich nicht; zoege der Test sie von dort, waere
 * er eine Tautologie und bliebe auch bei einem versehentlich geaenderten
 * Vorgabewert gruen (dieselbe Begruendung wie bei `ZAHL_NAMEN`, `grenzen.ts`).
 */
const VORGABE_ORGANISATION = "DRK Bereitschaft Musterstadt";

describe("marke — zwei Konstanten und ein Regler", () => {
  it("traegt Marke und Unterzeile aus §10.2 als Konstanten", () => {
    expect(LAGERBUCH_MARKE).toBe("Lagerbuch");
    expect(LAGERBUCH_ZEILE).toBe("Bestand, Fahrzeuge, Geräte");
  });

  it("nimmt LAGERBUCH_ORGANISATION aus der Umgebung", () => {
    expect(lagerbuchOrganisation({ LAGERBUCH_ORGANISATION: "DRK Bereitschaft Entenhausen" }))
      .toBe("DRK Bereitschaft Entenhausen");
  });

  it("schneidet Randweiss ab — eine .env-Zeile traegt es leicht", () => {
    expect(lagerbuchOrganisation({ LAGERBUCH_ORGANISATION: "  DRK Musterstadt \n" }))
      .toBe("DRK Musterstadt");
  });

  it("faellt ohne Variable auf die Vorgabe zurueck — `pnpm build` laeuft ohne Konfiguration", () => {
    expect(lagerbuchOrganisation({})).toBe(VORGABE_ORGANISATION);
  });

  it.each(["", "   ", "\t\n"])(
    "behandelt den leer gesetzten Wert %j wie nicht gesetzt",
    (roh) => {
      /**
       * `LAGERBUCH_ORGANISATION=` ist der haeufigere Fall als die fehlende
       * Zeile (jemand raeumt eine .env auf). Ohne diesen Zweig hiesse das
       * Manifest „Lagerbuch · " und die Gate-Unterzeile begaenne mit einem
       * Trennpunkt — beides sieht nach einem Darstellungsfehler aus, nicht nach
       * einer fehlenden Variable.
       */
      expect(lagerbuchOrganisation({ LAGERBUCH_ORGANISATION: roh })).toBe(VORGABE_ORGANISATION);
    },
  );

  it("liest BEI JEDEM AUFRUF, nicht beim Import", () => {
    /**
     * Der Unterschied ist in einem Standalone-Build teuer: ein auf Modulebene
     * festgelegter Wert waere der, den `next build` gesehen hat, und der Regler
     * stuende danach still — ohne dass ein Tor etwas meldet.
     */
    const vorher = process.env.LAGERBUCH_ORGANISATION;
    try {
      process.env.LAGERBUCH_ORGANISATION = "Erster Wert";
      expect(lagerbuchOrganisation()).toBe("Erster Wert");
      process.env.LAGERBUCH_ORGANISATION = "Zweiter Wert";
      expect(lagerbuchOrganisation()).toBe("Zweiter Wert");
    } finally {
      if (vorher === undefined) delete process.env.LAGERBUCH_ORGANISATION;
      else process.env.LAGERBUCH_ORGANISATION = vorher;
    }
  });

  it("traegt keine Client-Direktive — die PWA-Route ist Server-Code (Falle 6)", () => {
    expect(readFileSync(MARKE_TS, "utf8")).not.toMatch(CLIENT_DIREKTIVE);
  });
});

describe("marke — KEIN Client nennt lagerbuchOrganisation", () => {
  /**
   * DIESER SCAN IST DAS EINZIGE TOR GEGEN DIE TEURE FALLE DER UMSTELLUNG — und
   * das ist keine Vorsicht, sondern nachgemessen.
   *
   * Ein `process.env.LAGERBUCH_ORGANISATION` direkt in einer Client-Insel
   * verhaelt sich so:
   *   `next dev`            richtig, vor und nach der Hydration (der erste
   *                         Anstrich kommt per SSR, wo die Prozessumgebung
   *                         da ist).
   *   `next build`/`start`  SSR-HTML richtig, NACH DER HYDRATION die Vorgabe —
   *                         der Browser hat kein `process.env`.
   *
   * Was das fuer die Tore heisst: `typecheck` und `build` pruefen beide Formen
   * klaglos. Vitest kann es strukturell nicht sehen (dort ist `"use client"` ein
   * wirkungsloser String und `process.env` in JEDEM Modul da). UND DER E2E-TEST
   * AUCH NICHT: `e2e/lagerbuch-organisation.spec.ts` faehrt gegen `next dev` und
   * war mit genau dieser Mutation GRUEN. Bleibt der Quelltext.
   *
   * Der Weg ueber die Grenze ist eine PROP (ein String ist serialisierbar) —
   * `page.tsx` liest, `Gate.tsx` zeigt an.
   */
  function dateien(verzeichnis: string): string[] {
    return readdirSync(verzeichnis, { withFileTypes: true }).flatMap((e) => {
      const pfad = join(verzeichnis, e.name);
      if (e.isDirectory()) return e.name === "node_modules" ? [] : dateien(pfad);
      return /\.tsx?$/.test(e.name) ? [pfad] : [];
    });
  }

  const clientDateien = dateien(MODUL).filter((pfad) => {
    if (/\.test\.tsx?$/.test(pfad)) return false;
    const quelle = readFileSync(pfad, "utf8");
    return CLIENT_DIREKTIVE.test(quelle);
  });

  it("findet ueberhaupt Client-Dateien — sonst pruefte der Scan nichts", () => {
    expect(clientDateien.length).toBeGreaterThan(0);
  });

  // Der Testname traegt den MODULRELATIVEN Pfad — ein absoluter waere je Maschine
  // ein anderer und machte den Bericht unvergleichbar.
  it.each(clientDateien.map((pfad) => pfad.slice(MODUL.length + 1)))(
    "%s nennt lagerbuchOrganisation nicht",
    (kurz) => {
      expect(readFileSync(join(MODUL, kurz), "utf8")).not.toContain("lagerbuchOrganisation");
    },
  );
});

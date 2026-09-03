import { readFileSync } from "node:fs";
import { Children, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

/*
 * `next/font/local` braucht Nexts SWC-Plugin; unter Vitest wirft der Loader. Dieselbe Abhilfe
 * wie in `src/app/layout.test.tsx` und `feedback/f/[slugSecret]/page.test.tsx`: den Loader
 * mocken und sein Argument ECHOEN. Der echte Rueckgabewert von `variable` ist ein generierter
 * Klassenname (`__variable_1a2b3c`); der Mock gibt stattdessen den Variablennamen zurueck, damit
 * die Zusicherung unten lesbar ist und zugleich die Paarung Option ↔ verwendeter Wert prueft.
 */
vi.mock("next/font/local", () => ({
  default: (optionen: { variable: string }) => ({
    variable: optionen.variable,
    className: optionen.variable,
    style: { fontFamily: "Arimo" },
  }),
}));

import ZeichenLayout from "./layout";

/*
 * `children?: ReactNode` UND NICHT `unknown`: `Children.toArray` (unten) verlangt
 * `ReactNode | ReactNode[]` als Argument — mit `unknown` weist `tsc` die Zeile zurueck
 * (gemessen, keine Vermutung: `pnpm typecheck` markierte genau diese Stelle).
 */
type Wurzel = ReactElement<{ className?: string; children?: ReactNode }>;
type LinkKnoten = ReactElement<{ rel?: string; href?: string; crossOrigin?: string }>;

function wurzelMitKindern() {
  const wurzel = ZeichenLayout({ children: null }) as Wurzel;
  const kinder = Children.toArray(wurzel.props.children) as LinkKnoten[];
  return { wurzel, kinder };
}

describe("Modul-Layout zeichen", () => {
  /*
   * SPEC §3.5: DIE `.variable`-KLASSE HAENGT AN DIESEM `<div>` UND NIRGENDWO SONST.
   *
   * Gemessen tragen 160 von 242 Rezepten `<text font-family="Arimo">`, und die Textgeometrie
   * des Katalogs ist gegen Arimo vermessen — ohne die Schrift laufen „KatSL", „ÜMANV-S" und
   * „MLW IV Lbw" aus ihren Boxen.
   *
   * ⛔ NICHT AM `(shell)`-LAYOUT: dort haenge sie nicht ueber `/offline`, das Aufgabe 9 unter
   * der zweiten Routengruppe `(rahmenlos)` anlegt — und ausgerechnet die Offline-Flaeche zeigt
   * denselben Katalog. Diese Datei ist der EINZIGE gemeinsame Vorfahre beider Gruppen.
   * ⛔ NICHT AM `<html>`: das waere das Wurzel-Layout der Suite und damit eine core-Aenderung
   * ohne zweiten Nutzniesser (`CLAUDE.md`: „nur was ein zweites Modul braucht").
   */
  it("haengt die Arimo-Klasse an den gemeinsamen Vorfahren beider Routengruppen", () => {
    const { wurzel } = wurzelMitKindern();
    expect(wurzel.type).toBe("div");
    expect(wurzel.props.className).toBe("--tz-zeichenschrift");
  });

  /*
   * SPEC §7.3: OHNE `crossOrigin="use-credentials"` HOLT DER BROWSER DAS MANIFEST OHNE COOKIES
   * UND BEKOMMT LOGIN-HTML. `zeichen` traegt `requiresAuth: true`; eine Anfrage ohne Sitzung
   * beantwortet die Middleware mit `307 → /login`. Das Attribut kam im ganzen Repo bisher nicht
   * vor (`grep -rn crossOrigin src/` → leer).
   */
  it("verweist mit Zugangsdaten auf das Manifest", () => {
    const { kinder } = wurzelMitKindern();
    const link = kinder.find((k) => k?.props?.rel === "manifest");
    expect(link, "kein <link rel=\"manifest\"> im Layout").toBeDefined();
    expect(link!.props.href).toBe("/manifest.webmanifest");
    expect(link!.props.crossOrigin).toBe("use-credentials");
  });

  /*
   * ⛔ DER LINK DARF NICHT NACH `metadata.manifest` „AUFGERAEUMT" WERDEN. Nexts Metadata-API
   * kennt fuer das Feld nur `null | string | URL`
   * (`node_modules/next/dist/lib/metadata/types/metadata-interface.d.ts:253`) — sie kann das
   * Attribut GAR NICHT ausdruecken. Wer `<link>` durch `export const metadata` ersetzt, entfernt
   * damit still die Zugangsdaten, und das Manifest ist ab dann Login-HTML. `uav/layout.tsx` und
   * `lagerbuch/layout.tsx` benutzen `metadata.manifest` — sie sind hier ausdruecklich KEIN
   * Vorbild, weil ihre Manifeste ohne Sitzung erreichbar sind.
   */
  it("schreibt den Verweis von Hand und nicht ueber die Metadata-API", () => {
    const quelle = readFileSync("src/app/m/zeichen/layout.tsx", "utf8");
    expect(quelle).toContain('crossOrigin="use-credentials"');
    expect(quelle).not.toContain("export const metadata");
  });

  /*
   * FALLE 6: diese Datei ist eine Server Component. Ein `"use client"` machte sie zur
   * Client-Insel — `next/font/local` laeuft dort nicht, und das Layout zoege den ganzen
   * Modulbaum ins Client-Bundle.
   */
  it("ist kein Client-Modul", () => {
    const quelle = readFileSync("src/app/m/zeichen/layout.tsx", "utf8");
    expect(quelle).not.toMatch(/["']use client["']/);
  });
});

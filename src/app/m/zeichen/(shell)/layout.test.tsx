import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SuiteNavItem } from "@/core/shell/types";

/*
 * `@/core/auth` MUSS GEMOCKT SEIN, auch wenn dieser Test nichts rendert: `canAdminModule`
 * ruft `auth()`, und next-auths eigener `next/server`-Import bricht im `node`-Environment
 * (Begruendung ausgeschrieben in `portal/layout.test.tsx`). Dieselbe Form wie
 * `aufgaben/layout.test.tsx`.
 */
let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));

import { ZEICHEN_NAV } from "../_lib/nav";
import { MerklisteSpiegel } from "../_ui/MerklisteSpiegel";
import ZeichenShellLayout from "./layout";

beforeEach(() => {
  sitzung = null;
  delete process.env.ZEICHEN_SW;
});

/*
 * DIE VERDRAHTUNG OHNE RENDERN: `ZeichenShellLayout` ist eine Server Component, ihr
 * Rueckgabewert ist ein React-ELEMENT. `element.props` zu lesen prueft, was bei `<Shell>`
 * ankommt, ohne die Shell auszufuehren — Vorbild `aufgaben/layout.test.tsx`,
 * `portal/layout.test.tsx`.
 */
async function shellProps() {
  const element = (await ZeichenShellLayout({ children: null })) as ReactElement<{
    variant: string;
    moduleKey: string;
    nav: SuiteNavItem[];
    children: React.ReactNode;
  }>;
  return element.props;
}

/** Steht der Merklisten-Spiegel unter den Kindern der Huelle? */
function spiegeltAufsGeraet(kinder: React.ReactNode): boolean {
  const liste = Array.isArray(kinder) ? kinder : [kinder];
  return liste.some(
    (k) => k !== null && typeof k === "object" && "type" in k && k.type === MerklisteSpiegel,
  );
}

describe("(shell)-Layout zeichen", () => {
  /*
   * `variant="full"` ALS LITERAL UND NICHT AUS `getModule("zeichen").shell`, obwohl das Registry
   * denselben Wert traegt: dieses Layout beschreibt EINE der zwei Routengruppen des Moduls. Die
   * zweite — `(rahmenlos)/offline`, Aufgabe 9 — laeuft ausdruecklich OHNE Shell. Ein aus dem
   * Registry gelesener Wert behauptete, er gaelte fuer das ganze Modul. Vorbild:
   * `uav/(admin)/layout.tsx`, das aus demselben Grund den Literalwert setzt.
   *
   * `full` heisst zugleich: `FullShell` legt `ARBEITSDICHTE` (44/48) um den INHALT
   * (`FullShell.tsx`, `theme.ts`). Deshalb steht an keinem antd-Bedienelement dieses Moduls ein
   * `size` (Falle 4: `size="large"` waere 72px), und eigenes Markup traegt `minHeight: 44` als
   * Literal.
   */
  it("setzt die volle Huelle mit dem Modulschluessel", async () => {
    const props = await shellProps();
    expect(props.variant).toBe("full");
    expect(props.moduleKey).toBe("zeichen");
  });

  it("gibt ohne Verwaltungsrecht fuenf Eintraege und keinen Verwaltungsabschnitt", async () => {
    sitzung = { user: { groups: [] } };
    const props = await shellProps();
    expect(props.nav.map((e) => e.key)).toEqual([
      "katalog", "merkliste", "baukasten", "meine", "lernen",
    ]);
  });

  /*
   * `iuk-zeichen-admin` IST DER REGISTRY-VORGABEWERT (Aufgabe 1); `SUITE_ADMIN_GROUP_ZEICHEN`
   * ist in der Testumgebung nicht gesetzt. Geprueft wird die Kette Sitzung → `canAdminModule`
   * → `zeichenNav` → `nav`-Prop, nicht `zeichenNav` allein (das tut `_lib/nav.test.ts`).
   */
  it("gibt mit der Modul-Admin-Gruppe alle sechs Eintraege", async () => {
    sitzung = { user: { groups: ["iuk-zeichen-admin"] } };
    const props = await shellProps();
    expect(props.nav).toEqual(ZEICHEN_NAV);
  });
});

/**
 * ABSCHLUSSREVIEW, W2 — DIE MERKLISTE LAG AUCH DANN AUF DEM GERAET, WENN DIE PWA
 * AUS IST.
 *
 * Spec §7.5 gibt die Zusage „auf dem Geraet liegt nichts Personenbezogenes" auf
 * und setzt drei Dinge an ihre Stelle: den Logout-Haken im Service Worker, den
 * Hinweistext und den Loeschknopf auf `/offline`. Alle drei haengen an
 * `ZEICHEN_SW=1`. Der Spiegel hing an nichts — im Vorgabezustand blieben die
 * Titel damit ueber den Logout hinaus auf einem geteilten Tablet liegen, ohne
 * Offenlegung, ohne erreichbaren Loeschweg und ohne dass sie je jemand wieder
 * gelesen haette.
 *
 * ⛔ GEPRUEFT WIRD DER BAUM, NICHT DER SCHALTER. Ein Test, der bloss
 * `zeichenSwAn()` aufriefe, waere gruen geblieben, waehrend das Layout den
 * Spiegel unbedingt rendert — genau die Lage, die die Review gefunden hat.
 */
describe("(shell)-Layout zeichen — der Merklisten-Spiegel", () => {
  it("spiegelt ohne eingeschaltete PWA NICHT aufs Geraet", async () => {
    sitzung = { user: { groups: [] } };
    const props = await shellProps();
    expect(spiegeltAufsGeraet(props.children)).toBe(false);
  });

  it("spiegelt mit ZEICHEN_SW=1 aufs Geraet", async () => {
    sitzung = { user: { groups: [] } };
    process.env.ZEICHEN_SW = "1";
    const props = await shellProps();
    expect(spiegeltAufsGeraet(props.children)).toBe(true);
  });

  /* Dieselbe Strenge wie `zeichenSwAn` selbst: die sichere Seite ist AUS, und
     ein Tippfehler darf den Schalter nicht umlegen (`_lib/boot.ts`). */
  it("laesst sich von einem anderen Wert als \"1\" nicht umlegen", async () => {
    sitzung = { user: { groups: [] } };
    process.env.ZEICHEN_SW = "true";
    const props = await shellProps();
    expect(spiegeltAufsGeraet(props.children)).toBe(false);
  });
});

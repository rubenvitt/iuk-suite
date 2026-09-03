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
import ZeichenShellLayout from "./layout";

beforeEach(() => {
  sitzung = null;
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
  }>;
  return element.props;
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

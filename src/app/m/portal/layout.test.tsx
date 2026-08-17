import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

/*
 * `layout.tsx` importiert `Shell`, und `Shell` fuehrt ueber `FullShell` zu
 * `SuiteHeader`, das `@/core/auth` laedt. Ungemockt bricht das im
 * `node`-Environment an next-auths eigenem `next/server`-Import (ein
 * repoweiter, vorbestehender Befund — siehe Bericht). Jeder andere Test in
 * dieser Suite, der denselben Pfad beruehrt ((admin)/layout.test.tsx,
 * (print)/layout.test.tsx, SuiteHeader.test.tsx), mockt deshalb `@/core/auth`;
 * hier dieselbe Bauform, unten zusaetzlich mit einer steuerbaren Sitzung, weil
 * der zweite Testblock `canAdminModule` (und damit `darfVerwalten`) ueber die
 * Gruppen der Sitzung lenken muss.
 */
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/core/auth";
import { suiteAdminGroup } from "@/core/groups";
import PortalLayout, { navFuerPortal } from "./layout";

const authMock = vi.mocked(auth);

function sessionFor(groups: string[]) {
  return {
    user: { id: "user-1", groups, fachgruppen: [], name: null, email: null, isAdmin: false },
  } as never;
}

/**
 * DER WEG ZUR VERWALTUNG.
 *
 * `portal/layout.tsx` rief `<Shell>` ohne `nav` — es gab damit weder in der
 * Kopfzeile noch im Drawer einen Weg nach `/admin`, die Seite war nur ueber die
 * Adresszeile erreichbar. Das ist bei 1280px derselbe Mangel wie bei 390px, aber
 * auf einem Telefon ist die Adresszeile das schlechteste Eingabegeraet, das es
 * gibt: was am Laptop laestig ist, ist dort eine Sperre. Es ist genau die
 * Pruefrage „Hat jede Action einen Weg in der Oberflaeche?" aus
 * docs/design/README.md.
 *
 * WARUM DER NICHT-ADMIN INZWISCHEN DOCH EINE NAVIGATION BEKOMMT: hier stand
 * bis zu den Release Notes das Gegenteil, und die Begruendung war „sie haette
 * genau einen Eintrag (Uebersicht), der auf die Seite zeigt, auf der man
 * steht". Mit `/neuigkeiten` gibt es eine zweite Seite fuer JEDE angemeldete
 * Person; ohne Leiste bliebe sie nur ueber die Adresszeile erreichbar. Die
 * Verwaltung haengt weiter am Recht — der Grund dafuer („ein Eintrag, der auf
 * 404 fuehrt") ist unveraendert.
 *
 * Der Slot bleibt optional; Module ohne Navigation (`gamma`) bekommen weiter
 * gar keine Leiste, und `e2e/modulnavigation.spec.ts` weist genau das dort
 * nach — bis zu dieser Aenderung tat es das am Portal.
 *
 * `navFuerPortal` selbst ist reine Ableitungslogik, deshalb hier ein Unit-Test
 * und kein DOM-Test. Das prueft aber nur die Ableitung, nicht die Verdrahtung:
 * ob das Ergebnis auch tatsaechlich an `<Shell nav={...}>` uebergeben wird,
 * steht im zweiten Testblock unten — eine Prop-Verdrahtung enthaelt keine
 * Media Query, jsdom kann sie ehrlich pruefen.
 */
describe("Portal — Navigationseintraege", () => {
  it("gibt Modul-Admins Uebersicht, Neuigkeiten und Verwaltung", () => {
    expect(navFuerPortal(true)).toEqual([
      { key: "start", title: "Übersicht", href: "/" },
      { key: "neuigkeiten", title: "Neuigkeiten", href: "/neuigkeiten" },
      { key: "admin", title: "Verwaltung", href: "/admin" },
    ]);
  });

  it("gibt allen anderen Uebersicht und Neuigkeiten, aber nicht die Verwaltung", () => {
    expect(navFuerPortal(false)).toEqual([
      { key: "start", title: "Übersicht", href: "/" },
      { key: "neuigkeiten", title: "Neuigkeiten", href: "/neuigkeiten" },
    ]);
  });
});

/**
 * DIE VERDRAHTUNG: `navFuerPortal(darfVerwalten)` muss auch tatsaechlich als
 * `nav`-Prop bei `<Shell>` ankommen. `Shell.tsx` deklariert `nav` optional —
 * ein geloeschtes `nav={...}` in `layout.tsx` waere fuer Typecheck, Lint und
 * jeden Test oben unsichtbar, obwohl genau das den Befund von oben
 * („DER WEG ZUR VERWALTUNG") lautlos zurückbraechte.
 *
 * `PortalLayout` ist eine Server Component: ihr Rueckgabewert ist ein
 * React-Element, kein DOM. Dessen `props.nav` zu lesen prueft die Verdrahtung
 * ohne Rendern — dieselbe Bauform wie in `src/app/layout.test.tsx`.
 */
describe("Portal-Layout: Verdrahtung von nav an <Shell>", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  it("Modul-Admin: <Shell> bekommt navFuerPortal(true) als nav-Prop", async () => {
    authMock.mockResolvedValue(sessionFor([suiteAdminGroup()]));

    const element = (await PortalLayout({ children: null })) as ReactElement<{
      nav?: unknown;
    }>;

    expect(element.props.nav).toEqual(navFuerPortal(true));
  });

  it("ohne Verwaltungsrecht: <Shell> bekommt ein leeres nav-Prop", async () => {
    authMock.mockResolvedValue(sessionFor([]));

    const element = (await PortalLayout({ children: null })) as ReactElement<{
      nav?: unknown;
    }>;

    expect(element.props.nav).toEqual(navFuerPortal(false));
  });
});

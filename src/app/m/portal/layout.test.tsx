import { describe, it, expect, vi } from "vitest";

/*
 * `layout.tsx` importiert `Shell`, und `Shell` fuehrt ueber `FullShell` zu
 * `SuiteHeader`, das `@/core/auth` laedt. Ungemockt bricht das im
 * `node`-Environment an next-auths eigenem `next/server`-Import (ein
 * repoweiter, vorbestehender Befund — siehe Bericht). Jeder andere Test in
 * dieser Suite, der denselben Pfad beruehrt ((admin)/layout.test.tsx,
 * (print)/layout.test.tsx, SuiteHeader.test.tsx), mockt deshalb `@/core/auth`;
 * hier dieselbe Bauform, weil `navFuerPortal` reine Ableitungslogik ist und
 * `auth()` fuer diesen Test nie aufgerufen wird.
 */
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));

import { navFuerPortal } from "./layout";

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
 * WARUM DER NICHT-ADMIN GAR KEINE NAVIGATION BEKOMMT: sie haette genau einen
 * Eintrag („Uebersicht"), der auf die Seite zeigt, auf der man steht. Das ist
 * keine Navigation, das ist eine Beschriftung — und seit dem Kopfzeilen-Befund
 * (Spec §5.4) kostet jeder Eintrag zusaetzlich Breite in einem Band, in dem
 * sie ohnehin nicht reicht. Der Slot ist optional, wer nichts
 * uebergibt, bekommt exakt das bisherige Bild.
 *
 * Reine Ableitungslogik, deshalb ein Unit-Test und kein DOM-Test: es gibt hier
 * nichts zu rendern, was jsdom ehrlich pruefen koennte.
 */
describe("Portal — Navigationseintraege", () => {
  it("gibt Modul-Admins Uebersicht und Verwaltung", () => {
    expect(navFuerPortal(true)).toEqual([
      { key: "start", title: "Übersicht", href: "/" },
      { key: "admin", title: "Verwaltung", href: "/admin" },
    ]);
  });

  it("gibt allen anderen gar keine Navigation statt einer Ein-Punkt-Zeile", () => {
    expect(navFuerPortal(false)).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";

import { ortSeite } from "@/core/shell/ortTitel";
import type { SuiteNavItem } from "@/core/shell/types";

const NAV: SuiteNavItem[] = [
  { key: "start", title: "Übersicht", href: "/" },
  { key: "artikel", title: "Artikel", href: "/artikel" },
  { key: "suche", title: "Suche", href: "/suche" },
];

describe("ortSeite — was der Ort-Knopf am Telefon nennt (IDA-391)", () => {
  it("nennt den genauen Treffer, die Wurzel nur auf der Wurzel", () => {
    expect(ortSeite("/artikel", NAV, false)).toBe("Artikel");
    expect(ortSeite("/", NAV, false)).toBe("Übersicht");
  });

  it("nennt unter einem Eintrag diesen Eintrag", () => {
    expect(ortSeite("/artikel/7", NAV, false)).toBe("Artikel");
  });

  it("fällt nicht auf „Übersicht“ zurück, wenn die Seite nicht in der Navigation steht", () => {
    expect(ortSeite("/profil", NAV, false)).toBeNull();
    expect(ortSeite("/irgendwo/tief", NAV, false)).toBeNull();
  });

  it("kennt im Portal das Profil, das die Hülle selbst verlinkt", () => {
    expect(ortSeite("/profil", NAV, true)).toBe("Profil");
    expect(ortSeite("/profilneu", NAV, true)).toBeNull();
  });
});

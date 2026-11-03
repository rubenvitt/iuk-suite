import { describe, expect, it } from "vitest";
import {
  VIELE_EINTRAEGE_AB,
  ZULETZT_ZEIGEN,
  istViel,
  mitVerwaltungAmModul,
  nachSchluesseln,
  ordneAlle,
  persoenlich,
} from "@/core/shell/launcherAuswahl";
import { APP_BEREICHE, MODULES, bereichFuer } from "@/core/registry";
import type { LauncherEintrag } from "@/core/shell/types";

const modul = (key: string, bereich: string): LauncherEintrag => ({
  key, title: key, href: `https://${key}`, abschnitt: "Apps", bereich, extern: false,
});
const dienst = (id: string, abschnitt: string): LauncherEintrag => ({
  key: `dienst:${id}`, title: id, href: `https://${id}`, abschnitt, extern: true,
});

describe("persönliche Ordnung des Launchers (IDA-338)", () => {
  it("greift erst ab der Schwelle", () => {
    const viele = Array.from({ length: VIELE_EINTRAEGE_AB }, (_, i) => dienst(String(i), "Tools"));
    expect(istViel(viele)).toBe(true);
    expect(istViel(viele.slice(1))).toBe(false);
  });

  it("hängt die Verwaltung als Zweitlink an ihr Modul", () => {
    const radio = modul("radio", "Einsatz & Lage");
    const liste = mitVerwaltungAmModul([
      radio,
      { ...radio, key: "radio:verwaltung", title: "Funkgeräte-Verwaltung", href: "https://radio/admin" },
      dienst("a", "Tools"),
    ]);
    expect(liste.map((e) => e.key)).toEqual(["radio", "dienst:a"]);
    expect(liste[0].verwaltung).toEqual({ titel: "Funkgeräte-Verwaltung", href: "https://radio/admin" });
  });

  it("lässt eine Verwaltung ohne sichtbares Modul für sich stehen", () => {
    const allein = { ...modul("radio", "Einsatz & Lage"), key: "radio:verwaltung" };
    expect(mitVerwaltungAmModul([allein]).map((e) => e.key)).toEqual(["radio:verwaltung"]);
  });

  it("filtert Unsichtbares still heraus und hält die gespeicherte Reihenfolge", () => {
    const liste = [modul("a", "X"), modul("b", "X"), modul("c", "X")];
    expect(nachSchluesseln(liste, ["c", "weg", "a", "c"]).map((e) => e.key)).toEqual(["c", "a"]);
  });

  it("zeigt unter „Zuletzt“ nichts Angeheftetes und höchstens ZULETZT_ZEIGEN", () => {
    const liste = ["a", "b", "c", "d", "e", "f"].map((k) => modul(k, "X"));
    const p = persoenlich(liste, { angeheftet: ["b"], zuletzt: ["b", "a", "c", "d", "e", "f"] });
    expect(p.angeheftet.map((e) => e.key)).toEqual(["b"]);
    expect(p.zuletzt.map((e) => e.key)).toEqual(["a", "c", "d", "e"].slice(0, ZULETZT_ZEIGEN));
  });

  it("ordnet Module nach Bereich in vorgegebener Reihenfolge, Dienste nach Kategorie", () => {
    const { apps, dienste } = ordneAlle(
      [modul("files", "Austausch"), modul("lagerbuch", "Material & Technik"), modul("einsatzbuch", "Einsatz & Lage"), dienst("w", "Doku")],
      ["Einsatz & Lage", "Material & Technik", "Austausch"],
    );
    expect(apps.map(([t]) => t)).toEqual(["Einsatz & Lage", "Material & Technik", "Austausch"]);
    expect(dienste.map(([t, l]) => [t, l.length])).toEqual([["Doku", 1]]);
  });

  it("jedes sichtbare Suite-Modul hat einen Bereich, und jeder Bereichseintrag ist ein Modul", () => {
    const keys = new Set(MODULES.map((m) => m.key));
    for (const b of APP_BEREICHE) for (const m of b.module) expect(keys.has(m), m).toBe(true);
    const ohne = MODULES.filter((m) => m.showInSwitcher && m.requiresAuth !== undefined)
      .filter((m) => !["alpha", "gamma", "beta", "kioskdemo"].includes(m.key))
      .filter((m) => bereichFuer(m.key) === "Weitere Apps");
    expect(ohne.map((m) => m.key)).toEqual([]);
  });
});

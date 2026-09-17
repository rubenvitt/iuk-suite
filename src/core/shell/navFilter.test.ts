import { describe, expect, it } from "vitest";

import { NAV_LANG_AB_EINTRAEGEN, filtereNav, istLangeNav, trifft } from "@/core/shell/navFilter";
import type { SuiteNavItem } from "@/core/shell/types";

import { FILES_NAV } from "@/app/m/files/_lib/nav";
import { LAGERBUCH_NAV } from "@/app/m/lagerbuch/_lib/nav";
import { UAV_NAV } from "@/app/m/uav/_lib/nav";
import { ZEICHEN_NAV } from "@/app/m/zeichen/_lib/nav";
import { radioNav } from "@/app/m/radio/_lib/nav";

const NAV: SuiteNavItem[] = [
  { key: "uebersicht", title: "Übersicht", href: "/verwaltung" },
  { key: "verfall", title: "Verfall", href: "/verwaltung/verfall", abschnitt: "Bestand" },
  { key: "bz", title: "BZ-Kontrolle", href: "/verwaltung/bz", abschnitt: "Prüfungen" },
  { key: "etiketten", title: "Artikeletiketten", href: "/verwaltung/etiketten", abschnitt: "Einrichtung" },
  { key: "ortsetiketten", title: "Ortsetiketten", href: "/verwaltung/ortsetiketten", abschnitt: "Einrichtung" },
];

const titel = (liste: SuiteNavItem[]) => liste.map((e) => e.title);

describe("trifft — beide Umlautschreibweisen", () => {
  /*
   * DIE ZWEI FAELLE, DIE EINE EINZELNE NORMALISIERUNG JEWEILS VERLIERT, und
   * deshalb stehen sie hier nebeneinander: mit Umlauten NUR ausgeschrieben
   * faende „ub" kein „Übersicht"; mit Umlauten NUR gestrichen faende „pruef"
   * kein „Prüfungen". In dieser Suite tippen beide Sorten Leute.
   */
  it("findet Prüfungen sowohl über `pruef` als auch über `prü` und `pru`", () => {
    for (const eingabe of ["pruef", "prü", "pru", "PRÜF"]) {
      expect(trifft("Prüfungen", eingabe), eingabe).toBe(true);
    }
  });

  it("findet Übersicht sowohl über `ueber` als auch über `üb` und `ub`", () => {
    for (const eingabe of ["ueber", "üb", "ub", "übersicht"]) {
      expect(trifft("Übersicht", eingabe), eingabe).toBe(true);
    }
  });

  it("findet mitten im Wort, nicht nur am Anfang", () => {
    // „etiketten" soll BEIDE Etikettenseiten finden — wer den Anfang des
    // Namens kennt, sucht ohnehin nicht.
    expect(trifft("Artikeletiketten", "etiketten")).toBe(true);
    expect(trifft("Ortsetiketten", "etiketten")).toBe(true);
  });

  it("trennt, was nicht passt", () => {
    expect(trifft("Journal", "verfall")).toBe(false);
  });
});

describe("filtereNav", () => {
  it("gibt bei leerer Eingabe die ganze Liste zurück", () => {
    expect(filtereNav(NAV, "")).toBe(NAV);
    expect(filtereNav(NAV, "   ")).toBe(NAV);
  });

  it("filtert auf die passenden Einträge, in unveränderter Reihenfolge", () => {
    expect(titel(filtereNav(NAV, "etiketten"))).toEqual(["Artikeletiketten", "Ortsetiketten"]);
  });

  /*
   * DIE HAELFTE, DIE MAN BEIM BAUEN VERGISST — und ohne die sich der Filter wie
   * ein Defekt liest: „Prüfungen" steht gut sichtbar als Ueberschrift in der
   * Leiste, es gibt aber keinen EINTRAG dieses Namens. Wer danach tippt, saehe
   * ohne diese Zeile „Kein Eintrag passt" ueber einer Ueberschrift, die er
   * gerade abgelesen hat.
   */
  it("findet einen Eintrag auch über seine Abschnittsüberschrift", () => {
    expect(titel(filtereNav(NAV, "prüfungen"))).toEqual(["BZ-Kontrolle"]);
  });

  it("liefert eine leere Liste, wenn nichts passt", () => {
    expect(filtereNav(NAV, "zzz")).toEqual([]);
  });
});

/*
 * DIE SCHWELLE GEGEN DIE ECHTEN NAVIGATIONEN — und das ist der Test, der die
 * Zusage dieser Aenderung traegt: „kein anderes Modul aendert sich".
 *
 * ⚠️ ER IST ZUGLEICH DIE NICHT-VAKUAERE HAELFTE. Stiege die Schwelle ueber 21,
 * waeren Filter und Aufklappen ueberall aus und jeder DOM-Test darauf bliebe
 * trotzdem gruen — er rendert ja seine eigene Vorlage. Nur hier faellt auf,
 * dass die Bedienung im echten Modul gar nicht mehr erscheint.
 *
 * `aufgaben` fehlt bewusst: seine Navigation entsteht je Person aus Rechten und
 * Datum (`aufgabenNav(akteur, heute)`), eine Zahl dafuer waere die Zahl EINER
 * erfundenen Person. Sie liegt bei hoechstens acht Eintraegen und damit
 * zweifelsfrei unter der Schwelle; wer sie ueber 12 waechst, merkt es an der
 * Oberflaeche, nicht an diesem Test.
 */
describe("die Schwelle gegen die Navigationen, die es heute gibt", () => {
  it("lagerbuch ist lang — sonst gäbe es diese Änderung nicht", () => {
    expect(LAGERBUCH_NAV.length).toBeGreaterThanOrEqual(NAV_LANG_AB_EINTRAEGEN);
    expect(istLangeNav(LAGERBUCH_NAV)).toBe(true);
  });

  it.each([
    ["files", FILES_NAV],
    ["uav", UAV_NAV],
    ["zeichen", ZEICHEN_NAV],
    ["radio (admin, also die längste Stufe)", radioNav("admin")],
  ])("%s bleibt kurz und rendert damit exakt das Markup von vorher", (_name, nav) => {
    expect(istLangeNav(nav)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import {
  ERSTBESUCH_TAGE, NEUIGKEITEN_SEITE, appsAus, gesehenNach, heuteIso, neuigkeitenFuer, seiteAus, seiteBis,
  tageZurueck, vergleichsStand, type Neuigkeit,
} from "@/app/m/portal/_lib/neuigkeiten/auswahl";
import { ALLE_APPS, istNeu } from "@/app/m/portal/_lib/neuigkeiten/neu";
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

/**
 * Eigene Notizen statt der echten: der Test prüft die AUSWAHL, nicht den
 * Inhalt des Verzeichnisses. Mit den echten Notizen würde er rot, sobald jemand
 * eine neue schreibt — und das ist keine Aussage über die Rechteprüfung.
 *
 * `env: {}` bei jedem Aufruf: `visibleSwitcherModules` liest sonst
 * `process.env`, und ein gesetztes `SUITE_ACCESS_GROUP_AUFGABEN` auf der
 * Maschine des Ausführenden verschöbe das Ergebnis. Die Registry-Vorgaben
 * sind das, was hier gemeint ist.
 */
function notiz(modul: string, slug: string, datum = "2026-08-16"): Releasenotiz {
  return { modul, slug, datum, titel: `Notiz ${slug}`, inhalt: [absatz("Text.")] };
}

const NOTIZEN = [
  notiz("portal", "portal-eins"),
  notiz("aufgaben", "aufgaben-eins"),
  notiz("lagerbuch", "lagerbuch-eins"),
  // `beta` steht mit `showInSwitcher: false` in der Registry.
  notiz("beta", "beta-eins"),
];

describe("neuigkeitenFuer", () => {
  it("zeigt ohne passende Gruppe nur die Apps, die jeder Angemeldete sieht", () => {
    const sichtbar = neuigkeitenFuer([], NOTIZEN, {});
    expect(sichtbar.map((n) => n.slug)).toEqual(["portal-eins"]);
  });

  it("zeigt die Notiz zu einer App, sobald die Gruppe passt", () => {
    const sichtbar = neuigkeitenFuer(["aufgaben-nutzer"], NOTIZEN, {});
    expect(sichtbar.map((n) => n.slug)).toEqual(["portal-eins", "aufgaben-eins"]);
  });

  it("gatet auch Module, die ihren Zugang über `switcherGroupSources` regeln", () => {
    // `lagerbuch` steht mit `requiresAuth: false` in der Registry (anonyme
    // Helferpfade). `canAccess` allein liesse die Notiz damit durch — die
    // Kachel im Portal tut das nicht, und diese Auswahl folgt der Kachel.
    expect(neuigkeitenFuer([], NOTIZEN, {}).map((n) => n.slug)).not.toContain("lagerbuch-eins");
    expect(neuigkeitenFuer(["lagerbuch-admin"], NOTIZEN, {}).map((n) => n.slug)).toContain(
      "lagerbuch-eins",
    );
  });

  it("zeigt einer nicht angemeldeten Person keine Notiz zu einer Anmelde-App", () => {
    expect(neuigkeitenFuer(null, NOTIZEN, {}).map((n) => n.slug)).not.toContain("portal-eins");
  });

  it("lässt Module aus, die nicht im Umschalter stehen", () => {
    const alleGruppen = ["aufgaben-nutzer", "lagerbuch-admin"];
    expect(neuigkeitenFuer(alleGruppen, NOTIZEN, {}).map((n) => n.modul)).not.toContain("beta");
  });

  it("holt Modultitel und Zeichen aus der Registry, nicht aus der Notiz", () => {
    const [erste] = neuigkeitenFuer([], NOTIZEN, {});
    expect(erste.modulTitel).toBe("Portal");
    expect(erste.icon).toBe("apps");
  });

  it("behält die Reihenfolge der Eingabe — sortiert wird im Register", () => {
    const eingabe = [notiz("portal", "b", "2026-08-14"), notiz("portal", "a", "2026-08-16")];
    expect(neuigkeitenFuer([], eingabe, {}).map((n) => n.slug)).toEqual(["b", "a"]);
  });
});

/** Eine angereicherte Notiz, wie `neuigkeitenFuer` sie liefert — für die reinen Seitenfunktionen. */
function neuigkeit(modul: string, slug: string, datum: string): Neuigkeit {
  return { ...notiz(modul, slug, datum), modulTitel: modul.toUpperCase(), icon: "apps" };
}

/** 45 Notizen, neueste zuerst, abwechselnd zwei Apps (jede dritte `b`). */
const VIELE: Neuigkeit[] = Array.from({ length: 45 }, (_, i) =>
  neuigkeit(i % 3 === 2 ? "b" : "a", `n${i}`, tageZurueck("2026-11-10", i)),
);

describe("seitenweise (IDA-391)", () => {
  it("liefert die erste Seite und sagt, dass es weitere gibt", () => {
    const seite = seiteAus(VIELE, ALLE_APPS, 0);
    expect(seite.eintraege.map((n) => n.slug)).toEqual(VIELE.slice(0, NEUIGKEITEN_SEITE).map((n) => n.slug));
    expect(seite.weitere).toBe(true);
    expect(seiteAus(VIELE, ALLE_APPS, 40).eintraege).toHaveLength(5);
    expect(seiteAus(VIELE, ALLE_APPS, 40).weitere).toBe(false);
  });

  it("blättert innerhalb eines Filters", () => {
    const nurB = VIELE.filter((n) => n.modul === "b");
    expect(seiteAus(VIELE, "b", 0).eintraege).toEqual(nurB.slice(0, NEUIGKEITEN_SEITE));
    expect(seiteAus(VIELE, "b", 0).weitere).toBe(false);
    expect(seiteAus(VIELE, "unbekannt", 0)).toEqual({ eintraege: [], weitere: false });
  });

  it("zählt die Apps in der Reihenfolge ihres ersten Auftretens", () => {
    expect(appsAus(VIELE)).toEqual([
      { key: "a", titel: "A", anzahl: 30 },
      { key: "b", titel: "B", anzahl: 15 },
    ]);
  });

  it("lädt für eine Sprungmarke auf ganze Seiten aufgerundet", () => {
    expect(seiteBis(VIELE, "n25")!.eintraege).toHaveLength(2 * NEUIGKEITEN_SEITE);
    expect(seiteBis(VIELE, "n3")!.eintraege).toHaveLength(NEUIGKEITEN_SEITE);
    expect(seiteBis(VIELE, "gibt-es-nicht")).toBeNull();
  });
});

describe("neu seit dem letzten Besuch (IDA-391)", () => {
  it("merkt das jüngste Datum und alle Notizen dieses Tages", () => {
    const liste = [neuigkeit("a", "x", "2026-11-09"), neuigkeit("b", "y", "2026-11-10"), neuigkeit("a", "z", "2026-11-10")];
    expect(gesehenNach(liste)).toEqual({ bis: "2026-11-10", schluessel: ["b/y", "a/z"] });
    expect(gesehenNach([])).toBeNull();
  });

  it("ist neu, was danach liegt oder am gemerkten Tag noch fehlte", () => {
    const stand = { bis: "2026-11-10", schluessel: ["b/y"] };
    expect(istNeu(neuigkeit("b", "y", "2026-11-10"), stand)).toBe(false);
    expect(istNeu(neuigkeit("a", "nachgereicht", "2026-11-10"), stand)).toBe(true);
    expect(istNeu(neuigkeit("a", "morgen", "2026-11-11"), stand)).toBe(true);
    expect(istNeu(neuigkeit("a", "alt", "2026-11-09"), stand)).toBe(false);
    expect(istNeu(neuigkeit("a", "egal", "2026-11-11"), null)).toBe(false);
  });

  it(`zeigt beim ersten Besuch die letzten ${ERSTBESUCH_TAGE} Tage als neu`, () => {
    const stand = vergleichsStand(null, "2026-11-10");
    expect(stand).toEqual({ bis: "2026-10-27", schluessel: [] });
    // Der Stichtag selbst zählt mit: `schluessel` ist leer, also fehlt dort jede Notiz.
    expect(istNeu(neuigkeit("a", "x", "2026-10-27"), stand)).toBe(true);
    expect(istNeu(neuigkeit("a", "x", "2026-10-26"), stand)).toBe(false);
    const gemerkt = { bis: "2026-11-01", schluessel: [] };
    expect(vergleichsStand(gemerkt, "2026-11-10")).toBe(gemerkt);
  });

  it("rechnet Tage kalendarisch und heute in der Suite-Zone", () => {
    expect(tageZurueck("2026-03-01", 1)).toBe("2026-02-28");
    expect(tageZurueck("2026-01-05", 14)).toBe("2025-12-22");
    // 23:30 UTC am 10. ist in Berlin schon der 11.
    expect(heuteIso(new Date("2026-11-10T23:30:00Z"))).toBe("2026-11-11");
  });
});

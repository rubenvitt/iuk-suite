import { describe, expect, it } from "vitest";

import { neuigkeitenFuer } from "@/app/m/portal/_lib/neuigkeiten/auswahl";
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
    const sichtbar = neuigkeitenFuer(["iuk-aufgaben-nutzer"], NOTIZEN, {});
    expect(sichtbar.map((n) => n.slug)).toEqual(["portal-eins", "aufgaben-eins"]);
  });

  it("gatet auch Module, die ihren Zugang über `switcherGroupSources` regeln", () => {
    // `lagerbuch` steht mit `requiresAuth: false` in der Registry (anonyme
    // Helferpfade). `canAccess` allein liesse die Notiz damit durch — die
    // Kachel im Portal tut das nicht, und diese Auswahl folgt der Kachel.
    expect(neuigkeitenFuer([], NOTIZEN, {}).map((n) => n.slug)).not.toContain("lagerbuch-eins");
    expect(neuigkeitenFuer(["lagerbuch_nutzer"], NOTIZEN, {}).map((n) => n.slug)).toContain(
      "lagerbuch-eins",
    );
  });

  it("zeigt einer nicht angemeldeten Person keine Notiz zu einer Anmelde-App", () => {
    expect(neuigkeitenFuer(null, NOTIZEN, {}).map((n) => n.slug)).not.toContain("portal-eins");
  });

  it("lässt Module aus, die nicht im Umschalter stehen", () => {
    const alleGruppen = ["iuk-aufgaben-nutzer", "lagerbuch_nutzer"];
    expect(neuigkeitenFuer(alleGruppen, NOTIZEN, {}).map((n) => n.modul)).not.toContain("beta");
  });

  it("holt Modultitel und Zeichen aus der Registry, nicht aus der Notiz", () => {
    const [erste] = neuigkeitenFuer([], NOTIZEN, {});
    expect(erste.modulTitel).toBe("Portal");
    expect(erste.icon).toBe("AppstoreOutlined");
  });

  it("behält die Reihenfolge der Eingabe — sortiert wird im Register", () => {
    const eingabe = [notiz("portal", "b", "2026-08-14"), notiz("portal", "a", "2026-08-16")];
    expect(neuigkeitenFuer([], eingabe, {}).map((n) => n.slug)).toEqual(["b", "a"]);
  });
});

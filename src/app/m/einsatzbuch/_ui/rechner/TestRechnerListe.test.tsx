// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mount, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { TestRechnerZeile } from "../../_lib/anbindung/status";
import { TestRechnerListe } from "./TestRechnerListe";
import styles from "./rechner.module.css";

afterEach(unmount);

const ZEILE: TestRechnerZeile = {
  id: "t1",
  name: "Übungsrechner",
  eingerichtetAm: "25.09.2026, 10:00",
  eingerichtetVon: "Jana Albers",
  letzterKontakt: null,
  ankerBis: null,
  abweichungen: 2,
};

/** Läuft von `start` aus zur Wurzel und meldet, ob ein Vorfahre `klasse` trägt. */
function traegtVorfahreKlasse(start: HTMLElement, klasse: string): boolean {
  for (let el: HTMLElement | null = start; el; el = el.parentElement) {
    if (el.classList.contains(klasse)) return true;
  }
  return false;
}

describe("TestRechnerListe — Abweichungszahl in Rot (Fixrunde 1, DRK-471)", () => {
  /*
   * REGRESSION: `--eb-verw-rot-text` steht nur unter `.modul` (`rechner.module.css`), nicht
   * global (Falle 2 in Modulform). Die erste Fassung dieser Insel gab `styles.modul` an
   * KEINEM Vorfahren der Tabelle aus — die Variable löste still ins Leere auf, die Zahl blieb
   * in der normalen Textfarbe. Dieser Test prüft die STRUKTURELLE Voraussetzung dafür, dass die
   * Variable überhaupt greifen kann: die Zelle mit der Abweichungszahl braucht einen Vorfahren
   * mit `styles.modul`. Die tatsächliche Farbwirkung ist damit nicht bewiesen — CSS-Module-Regeln
   * laufen unter Vitest nicht durch eine echte Kaskade (Falle 20 gilt sinngemäß) —, wohl aber die
   * Quelle, aus der die Variable kommen MUSS.
   */
  it("die Zelle mit der Abweichungszahl liegt unter einem Element mit `styles.modul`", async () => {
    await mount(<TestRechnerListe liste={[ZEILE]} />);
    // `Kartentabelle` rendert Karten- UND Tabellendarstellung ins DOM (CSS blendet eine aus),
    // die Zahl steht also potenziell zweimal — beide müssen unter `.modul` liegen.
    const zellen = queryAll<HTMLElement>("span").filter((el) => el.classList.contains(styles.abweichungenZahl));
    expect(zellen.length).toBeGreaterThan(0);
    for (const zelle of zellen) {
      expect(
        traegtVorfahreKlasse(zelle, styles.modul),
        "kein Vorfahre trägt `styles.modul` — `--eb-verw-rot-text` wäre nicht deklariert",
      ).toBe(true);
    }
  });

  it("eine Zeile ohne Abweichungen zeigt die bloße Null ohne Rot-Klasse", async () => {
    await mount(<TestRechnerListe liste={[{ ...ZEILE, abweichungen: 0 }]} />);
    const zellen = queryAll<HTMLElement>("span").filter((el) => el.classList.contains(styles.abweichungenZahl));
    expect(zellen).toEqual([]);
  });
});

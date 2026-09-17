import { describe, expect, it } from "vitest";
import { migrierteTestDb } from "../_db/testdb";
import { lagerorte } from "../_db/schema";
import { etikettOrte } from "./lesepfade/ortEtiketten";
import { ENTNAHMEBOX_ID, HANDLAGER_ID } from "./konstanten";
import {
  BEREICHE, VOLLE_REICHWEITE, darf, reichweiteAus, startPfad,
} from "./helferBereich";

/**
 * DIE REICHWEITE ALS REINE RECHNUNG — DRK-417.
 *
 * ⚠️ `bereichsAbweisung` STEHT HIER NICHT. Sie schreibt eine Protokollzeile und
 * braucht dafür einen `HelferZugang`; gemessen wird sie deshalb dort, wo ein
 * echter Zugang entsteht (`helferZugang.test.ts`) und in den vier Actions. Was
 * HIER geprüft wird, ist die Ableitung darunter — die ist rein und braucht
 * weder Datenbank noch Attrappe.
 */
describe("reichweiteAus — der Ort entscheidet, was geht", () => {
  it("Handlager: nur die Entnahme", () => {
    expect(reichweiteAus(HANDLAGER_ID)).toEqual(["entnahme"]);
  });

  it("Entnahmebox: nur die Box", () => {
    expect(reichweiteAus(ENTNAHMEBOX_ID)).toEqual(["box"]);
  });

  /**
   * ⚠️ BOX UND CHECK, NICHT NUR CHECK — Betreiberentscheidung vom 17.09.2026.
   * Der Überschuss fällt AM FAHRZEUG auf; ihn erst in der Halle buchen zu
   * lassen hieße, ihn zu vergessen.
   */
  it("eine Einheit: Check und Box, nie die Entnahme", () => {
    expect(reichweiteAus("rtw-1")).toEqual(["box", "check"]);
    expect(darf(reichweiteAus("rtw-1"), "entnahme")).toBe(false);
  });

  /**
   * ⚠️ DER ALTBESTAND BEHÄLT ALLES. Die Betreiberentscheidung lautet
   * „Altbestand bleibt gültig" — ein Kärtchen ohne Ortsbezug ist eines aus dem
   * Umlauf, und ihm über Nacht zwei Drittel wegzunehmen wäre eine Änderung, die
   * niemand angekündigt hat.
   */
  it("ohne Ortsbezug: alles — und zwar für null wie für undefined", () => {
    expect(reichweiteAus(null)).toEqual(VOLLE_REICHWEITE);
    expect(reichweiteAus(undefined)).toEqual(VOLLE_REICHWEITE);
    expect(reichweiteAus("")).toEqual(VOLLE_REICHWEITE);
  });

  /**
   * ⚠️ DIE ANNAHME „ALLES ANDERE IST EINE EINHEIT" IST KEINE ANNAHME, SONDERN
   * DIE MENGE AUS `etikettOrte` — und DIESE Zusicherung ist der Grund, warum
   * man sie so schreiben darf.
   *
   * `stelleOrtCodesSicher` läuft über genau diese Zeilen; ein `ort_id`, das
   * `reichweiteAus` je zu sehen bekommt, stammt also von dort. Käme ein
   * fünfter Ort hinzu — ein zweites Lager, ein Schrank —, bekäme er hier still
   * `["box", "check"]`: eine Karte am Regalfach, die einen Fahrzeug-Check
   * öffnet. Dieser Test fällt dann, und zwar in der Datei, in der die
   * Entscheidung steht.
   *
   * ⚠️ ER LIEST DIE MENGE AUS DER DATENBANK, statt sie hinzuschreiben. Eine
   * Liste hier wäre eine zweite Wahrheit über dieselbe Frage — genau die Naht,
   * gegen die `ortEtiketten.ts` in seinem Kopf geschrieben ist.
   */
  it("kennt jeden Ort, für den es überhaupt eine Karte gibt", () => {
    const t = migrierteTestDb();
    try {
      t.db.insert(lagerorte).values([
        { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: "HN-1",
          aktiv: true, einheitenart: "fahrzeug" },
        { id: "ta-1", name: "Ärztetasche", typ: "fahrzeug", kennung: null,
          aktiv: true, einheitenart: "tasche" },
      ]).run();

      const erwartet: Record<string, readonly string[]> = {
        [HANDLAGER_ID]: ["entnahme"],
        [ENTNAHMEBOX_ID]: ["box"],
        "rtw-1": ["box", "check"],
        "ta-1": ["box", "check"],
      };
      const orte = etikettOrte(t.db);
      // Erst dass die Menge überhaupt gefüllt ist — sonst wäre eine leere
      // Schleife die ganze Zusage.
      expect(orte.map((o) => o.id).sort()).toEqual(Object.keys(erwartet).sort());
      for (const o of orte) {
        expect(reichweiteAus(o.id), o.id).toEqual(erwartet[o.id]);
      }
    } finally {
      t.schliessen();
    }
  });

  /**
   * ⚠️ JEDE REICHWEITE IST IN DER REIHENFOLGE VON `BEREICHE` GESCHRIEBEN. Zwei
   * Schreibweisen derselben Menge (`["check", "box"]` neben `["box", "check"]`)
   * wären in jedem `toEqual` und in jedem Reihenfolge-Vergleich eine
   * Fehlerquelle ohne Gewinn — und die Reiterleiste liest sie in dieser
   * Reihenfolge.
   */
  it("schreibt jede Reichweite in der Reihenfolge der Reiterleiste", () => {
    for (const ortId of [HANDLAGER_ID, ENTNAHMEBOX_ID, "rtw-1", null]) {
      const r = reichweiteAus(ortId);
      expect([...r], String(ortId)).toEqual(BEREICHE.filter((b) => r.includes(b)));
    }
  });
});

/**
 * WOHIN EIN ZUGANG GEHÖRT, WENN ER IRGENDWO LANDET, WO ER NICHTS ZU SUCHEN HAT.
 *
 * ⚠️ DIESELBE FUNKTION TRÄGT DIE LANDUNG NACH DEM SCAN
 * (`ortZiel.ts#ortcodeZielPfad`). Das ist der Punkt: zwei Rechnungen dafür
 * liefen auseinander, sobald eine Reichweite dazukommt — und zwar still, weil
 * der Redirect weiter funktionierte und nur woandershin führte.
 */
describe("startPfad — der Startschirm einer Reichweite", () => {
  it("wer entnehmen darf, fängt auf der Artikelliste an", () => {
    expect(startPfad(["entnahme"], null)).toBe("/helfer");
  });

  /**
   * ⚠️ DIE VOLLE REICHWEITE ENTHÄLT `check` UND GEHÖRT TROTZDEM AUF `/helfer`.
   * Deshalb steht `entnahme` in der Funktion VOR `check`: wer angemeldet ist,
   * fängt nicht in einem Fahrzeug-Check an. Eine Abfrage in der Reihenfolge von
   * `BEREICHE` wäre hier schon falsch.
   */
  it("der volle Zugang ebenso — nicht im Check, obwohl er ihn darf", () => {
    expect(startPfad(VOLLE_REICHWEITE, null)).toBe("/helfer");
    expect(startPfad(VOLLE_REICHWEITE, "rtw-1")).toBe("/helfer");
  });

  it("die Karte an der Einheit landet im Check IHRER Einheit", () => {
    expect(startPfad(["box", "check"], "rtw-1")).toBe("/helfer/check?fz=rtw-1");
  });

  /**
   * ⚠️ OHNE BINDUNG FÜHRT DER WEG AUF DIE WAHL, nicht in einen Check ohne
   * Einheit. Der Fall ist real: ein Ortscode einer Einheit trägt seine
   * `ziel_id`, ein von Hand angelegter Code mit `ort_id` einer Einheit
   * womöglich nicht.
   */
  it("ohne Bindung führt sie auf die Fahrzeugwahl", () => {
    expect(startPfad(["box", "check"], null)).toBe("/helfer/check");
  });

  it("die Karte an der Entnahmebox landet an der Box", () => {
    expect(startPfad(["box"], null)).toBe("/helfer/box");
  });
});

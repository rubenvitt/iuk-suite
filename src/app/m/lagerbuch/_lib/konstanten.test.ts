import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getTableColumns } from "drizzle-orm";
import {
  HANDLAGER_ID, PSEUDO_VERFALL, istOhneVerfall,
  CHARGE_KORREKTUR, CHARGE_INVENTUR, CHARGE_OHNE_VERFALL,
  ZUSTAENDE, ZUSTAND_DEFEKT,
  MONAT_REGEX, TAG_REGEX, istEchterKalendertag,
  BUCHUNGSTYPEN, QUELLE_TYPEN, LAGERORT_TYPEN, GERAETE_TYPEN, TOKEN_ZIEL_TYPEN,
  EINHEITENARTEN, EINHEITENART_LABEL, EINHEITENART_OFFEN_LABEL, einheitenartLabel,
  einheitNomen, einheitMeta, einheitLabels, standortMeta, standortZeile, dieseEinheit,
  ausDieserEinheit,
  anDieserEinheit,
  inDieEinheit, inDerEinheit,
  checklisteTitel, grossAmAnfang,
} from "./konstanten";
import { buchungen, checks, lagerorte, geraete, tokens } from "../_db/schema";

describe("feste Werte, die auf Papier bzw. in Produktionsdaten stehen", () => {
  it("HANDLAGER_ID ist woertlich 'handlager'", () => {
    // 75 Fundstellen im Alt-Repo. Mit foreign_keys = ON ist eine andere ID kein
    // Schoenheitsfehler, sondern ein FK-Fehler bei der ersten Entnahme.
    expect(HANDLAGER_ID).toBe("handlager");
  });

  it("PSEUDO_VERFALL ist '2099-12' und wird als 'kein Verfall' erkannt", () => {
    expect(PSEUDO_VERFALL).toBe("2099-12");
    expect(istOhneVerfall("2099-12")).toBe(true);
    expect(istOhneVerfall("2026-08")).toBe(false);
  });

  it("die drei Chargennummern-Literale stehen in den Produktionsdaten", () => {
    expect([CHARGE_KORREKTUR, CHARGE_INVENTUR, CHARGE_OHNE_VERFALL])
      .toEqual(["Korrektur", "Inventur", "ohne Verfall"]);
  });

  it("ZUSTAENDE traegt die drei Literale in der Reihenfolge des Bestands", () => {
    // Historische ergebnis-JSONs tragen sie bereits; "Defekt" ist der Vertrag
    // der serverseitigen Auswertung an drei Stellen.
    expect(ZUSTAENDE).toEqual(["In Ordnung", "Gebrauchsspuren", "Defekt"]);
    expect(ZUSTAND_DEFEKT).toBe("Defekt");
  });
});

describe("MONAT_REGEX — der EINZIGE Monatsvalidator des Moduls", () => {
  it("nimmt gueltige Monate an", () => {
    for (const gut of ["2026-01", "2026-08", "2026-12", "2099-12"]) {
      expect(MONAT_REGEX.test(gut)).toBe(true);
    }
  });

  it("weist genau die Werte ab, die der laxe Ausdruck durchliess", () => {
    // "2026-00" landete ueber new Date(2026, 0, 0, …) auf dem 31.12.2025,
    // "2026-13" auf dem 31.01.2027 (Analyse, §4.6).
    for (const schlecht of ["2026-00", "2026-13", "2026-8", "26-08", "2026-08-01", ""]) {
      expect(MONAT_REGEX.test(schlecht)).toBe(false);
    }
  });
});

describe("Tagesfelder — Form UND echter Kalendertag", () => {
  it("TAG_REGEX prueft die Form", () => {
    expect(TAG_REGEX.test("2026-02-31")).toBe(true);   // Form ok
    expect(TAG_REGEX.test("2026-2-3")).toBe(false);
  });

  it("istEchterKalendertag faengt ueberrollende Tage", () => {
    expect(istEchterKalendertag("2026-08-03")).toBe(true);
    expect(istEchterKalendertag("2026-02-31")).toBe(false);
    expect(istEchterKalendertag("2024-02-29")).toBe(true);   // Schaltjahr
    expect(istEchterKalendertag("2026-02-29")).toBe(false);
    expect(istEchterKalendertag("2026-13-01")).toBe(false);
  });
});

describe("Enum-Listen", () => {
  it("BUCHUNGSTYPEN traegt 'umlagerung' — der Typ fehlt im Implementierungsplan", () => {
    // Beide Legs einer Verschiebung tragen ihn, damit Bestellvorschlag und
    // Reporting eine interne Verschiebung nicht als Wareneingang oder Verbrauch
    // missdeuten (1:1-Pflicht 15).
    expect(BUCHUNGSTYPEN).toEqual(["zugang", "entnahme", "korrektur", "umlagerung"]);
  });

  it("die uebrigen vier Listen", () => {
    expect([...QUELLE_TYPEN].sort()).toEqual(["oidc", "system", "token"]);
    expect([...LAGERORT_TYPEN].sort()).toEqual(["fahrzeug", "lager"]);
    expect([...GERAETE_TYPEN].sort()).toEqual(["medizin", "objekt"]);
    expect([...TOKEN_ZIEL_TYPEN].sort()).toEqual(["artikel", "fahrzeug"]);
  });

  /**
   * DRK-309. ⚠️ ZWEI WERTE, UND KEIN DRITTER FUER DEN ZWISCHENSTAND. Der ist
   * die ABWESENHEIT eines Wertes (`null` in der Spalte); ein Literal
   * „unbekannt" waere ueber den Eingangsvalidator anlegbar, und damit liesse
   * sich eine Einheit anlegen, die sich absichtlich nicht zuordnet.
   */
  it("EINHEITENARTEN traegt genau Fahrzeug und Tasche", () => {
    expect([...EINHEITENARTEN].sort()).toEqual(["fahrzeug", "tasche"]);
    expect(EINHEITENARTEN).not.toContain("unbekannt");
  });

  it("jede Art hat eine Beschriftung, und der Zwischenstand hat seine eigene", () => {
    // EINE Quelle fuer Liste, Filter, Anlegen-Dialog und Einheitenblatt: zwei
    // Schreibweisen fuer denselben Zustand lassen den Leser einen dritten
    // vermuten.
    for (const art of EINHEITENARTEN) {
      expect(EINHEITENART_LABEL[art], art).toBeTruthy();
      expect(einheitenartLabel(art)).toBe(EINHEITENART_LABEL[art]);
    }
    // „nicht zugeordnet" und NICHT „unbekannt": unbekannt klaenge nach einem
    // Datenfehler, zugeordnet wird es aber schlicht noch.
    expect(EINHEITENART_OFFEN_LABEL).toBe("nicht zugeordnet");
    expect(einheitenartLabel(null)).toBe(EINHEITENART_OFFEN_LABEL);
  });

  /**
   * ⚠️ DIE SATZBAUSTEINE FALLEN AUF DAS OBERWORT ZURUECK, NIE AUF „Fahrzeug"
   * UND NIE AUF DEN CHIPTEXT (DRK-309).
   *
   * Auf „Fahrzeug" zu raten machte aus einer offenen Frage still eine Antwort.
   * Den Chiptext einzusetzen ergaebe „nicht zugeordnet löschen" — der
   * Unterschied zwischen `einheitenartLabel` (Zustandsanzeige) und
   * `einheitNomen` (Wort in einem Satz) ist genau dieser Fall.
   */
  it("die Satzbausteine tragen jede Art — und den Zwischenstand neutral", () => {
    expect(einheitNomen("fahrzeug")).toBe("Fahrzeug");
    expect(einheitNomen("tasche")).toBe("Tasche");
    expect(einheitNomen(null)).toBe("Einheit");

    expect(dieseEinheit("tasche")).toBe("diese Tasche");
    expect(dieseEinheit(null)).toBe("diese Einheit");

    // ⚠️ VERSCHIEDENE PRAEPOSITIONEN — der Grund fuer eigene Bausteine statt
    // eines eingesetzten Nomens: „auf die Tasche" waere falsch.
    expect(inDieEinheit("fahrzeug")).toBe("aufs Fahrzeug");
    expect(inDieEinheit("tasche")).toBe("in die Tasche");
    expect(inDieEinheit(null)).toBe("in die Einheit");

    expect(inDerEinheit("fahrzeug")).toBe("im Fahrzeug");
    expect(inDerEinheit("tasche")).toBe("in der Tasche");
    expect(inDerEinheit(null)).toBe("in der Einheit");

    // ⚠️ DATIV, NICHT NOMINATIV — und genau deshalb ein eigener Baustein:
    // `aus ${dieseEinheit(art)}` ergaebe „aus dieses Fahrzeug", und eine
    // Zeichenkette hat keinen Fall, an dem ein Tor das merken koennte.
    expect(ausDieserEinheit("fahrzeug")).toBe("aus diesem Fahrzeug");
    expect(ausDieserEinheit("tasche")).toBe("aus dieser Tasche");
    expect(ausDieserEinheit(null)).toBe("aus dieser Einheit");
    for (const art of [...EINHEITENARTEN, null] as const) {
      expect(ausDieserEinheit(art), String(art))
        .not.toContain(dieseEinheit(art));
    }

    // ⚠️ DERSELBE FALL, ANDERE PRAEPOSITION — und deshalb ein DRITTER
    // Baustein statt einer Wiederverwendung: `an ${ausDieserEinheit(art)}`
    // ergaebe „an aus diesem Fahrzeug", was beim Lesen durchginge.
    expect(anDieserEinheit("fahrzeug")).toBe("an diesem Fahrzeug");
    expect(anDieserEinheit("tasche")).toBe("an dieser Tasche");
    expect(anDieserEinheit(null)).toBe("an dieser Einheit");
    for (const art of [...EINHEITENARTEN, null] as const) {
      expect(anDieserEinheit(art), String(art)).not.toContain("aus");
    }

    // ⚠️ FUGEN-N: ein zusammengeklebtes `${label}-Checkliste` ergaebe
    // „Tasche-Checkliste" — fuer „Fahrzeug" richtig und hier still falsch.
    expect(checklisteTitel("fahrzeug")).toBe("Fahrzeug-Checkliste");
    expect(checklisteTitel("tasche")).toBe("Taschen-Checkliste");
    expect(checklisteTitel(null)).toBe("Checkliste");

    /*
     * ⚠️ DIE BEIZEILE TRAEGT IMMER ETWAS. Genau das war frueher nicht so: ohne
     * die Art blieb sie fuer eine Tasche LEER, weil eine Tasche kein
     * Kennzeichen traegt — und der Name allein musste die Art mittragen.
     */
    expect(einheitMeta({ kennung: "MS-1", einheitenart: "fahrzeug" }))
      .toBe("Fahrzeug · MS-1");
    expect(einheitMeta({ kennung: null, einheitenart: "tasche" })).toBe("Tasche");
    expect(einheitMeta({ kennung: null, einheitenart: null })).toBe("nicht zugeordnet");

    /*
     * ⚠️ EIN LAGER SAGT „Lager", NICHT „nicht zugeordnet". Die Standortlisten
     * der Geräte, BZ-Geräte und Flaschen mischen das Handlager mit den
     * Einheiten; für eine Lagerzeile ist die Art gegenstandslos und nicht
     * offen. Mit dem Zwischenstandstext stünde das Handlager auf jeder dieser
     * Listen auf der To-do-Liste, die der Artfilter aufmacht.
     */
    expect(standortMeta({ typ: "lager", kennung: null, einheitenart: null }))
      .toBe("Lager");
    expect(standortMeta({ typ: "fahrzeug", kennung: "MS-1", einheitenart: "fahrzeug" }))
      .toBe("Fahrzeug · MS-1");
    expect(standortMeta({ typ: "fahrzeug", kennung: null, einheitenart: null }))
      .toBe("nicht zugeordnet");

    /*
     * ⚠️ DER FALL, UM DEN ES GEHT (DRK-309, Reviewrunde 14): ein Fahrzeug und
     * eine Tasche DESSELBEN Namens. Vor `standortZeile` stand in den drei
     * Uebersichten nur der Name — zwei Zeilen, nicht auseinanderzuhalten, und
     * ein Spaltenfilter, der beide in EINEN Wert zog. Die Zusicherung ist
     * deshalb `not.toBe` und nicht zwei Gleichheiten: sie prueft die
     * EIGENSCHAFT (unterscheidbar), nicht die heutige Schreibweise.
     */
    const alsFahrzeug = { name: "Betreuung", typ: "fahrzeug" as const,
      kennung: null, einheitenart: "fahrzeug" as const };
    const alsTasche = { ...alsFahrzeug, einheitenart: "tasche" as const };
    expect(standortZeile(alsFahrzeug)).not.toBe(standortZeile(alsTasche));
    expect(standortZeile(alsTasche)).toBe("Betreuung · Tasche");

    // Und die Kennung steht mit drin, wo es eine gibt — sie ist bei zwei
    // gleichnamigen Fahrzeugen das einzige, was sie trennt.
    expect(standortZeile({ ...alsFahrzeug, kennung: "MS-1" }))
      .toBe("Betreuung · Fahrzeug · MS-1");

    // Ein Lager bleibt ein Lager, auch in der vollen Zeile.
    expect(standortZeile({ name: "Schrank 1", typ: "lager",
      kennung: null, einheitenart: null })).toBe("Schrank 1 · Lager");

    expect(grossAmAnfang(inDieEinheit("tasche"))).toBe("In die Tasche");
    for (const art of [...EINHEITENARTEN, null] as const) {
      expect(dieseEinheit(art), String(art)).not.toBe("");
      if (art !== "fahrzeug") {
        expect(inDieEinheit(art), String(art)).not.toContain("Fahrzeug");
        expect(checklisteTitel(art), String(art)).not.toContain("Fahrzeug");
        expect(ausDieserEinheit(art), String(art)).not.toContain("Fahrzeug");
        expect(anDieserEinheit(art), String(art)).not.toContain("Fahrzeug");
      }
    }
  });
});

describe("einheitLabels — wo auch die Art nicht trennt, trennt die ID", () => {
  /**
   * DRK-309, Reviewrunde 16. Der ganze PR argumentiert, die Art mache zwei
   * gleichnamige Einheiten unterscheidbar — das stimmt fuer ein Fahrzeug
   * neben einer Tasche und NICHT fuer zwei Taschen. `createFahrzeug` verlangt
   * weder einen eindeutigen Namen noch eine Kennung, und der Index aus
   * DRK-367 deckt nur Schraenke.
   */
  const t = (id: string, name: string, art: "fahrzeug" | "tasche" | null,
    kennung: string | null = null) => ({ id, name, kennung, einheitenart: art });

  it("laesst eindeutige Beschriftungen in Ruhe — die ID ist kein Schmuck", () => {
    const m = einheitLabels([t("a", "RTW 1", "fahrzeug", "MS-1"), t("b", "Betreuung", "tasche")]);
    expect(m.get("a")!.label).toBe("RTW 1 · Fahrzeug · MS-1");
    expect(m.get("b")!.label).toBe("Betreuung · Tasche");
  });

  it("haengt die ID an, wenn Name, Art UND Kennung gleich sind", () => {
    const m = einheitLabels([t("ta-1", "Betreuung", "tasche"), t("ta-2", "Betreuung", "tasche")]);
    expect(m.get("ta-1")!.label).toBe("Betreuung · Tasche · ta-1");
    expect(m.get("ta-2")!.label).toBe("Betreuung · Tasche · ta-2");
    expect(m.get("ta-1")!.label).not.toBe(m.get("ta-2")!.label);
  });

  it("traegt die ID auch in der META-Haelfte — der Helferschirm rendert zwei Elemente", () => {
    const m = einheitLabels([t("ta-1", "Betreuung", "tasche"), t("ta-2", "Betreuung", "tasche")]);
    expect(m.get("ta-1")!.meta).toBe("Tasche · ta-1");
  });

  it("trennt auch, wenn eine dritte Einheit die Ausweichform SCHON traegt", () => {
    /*
     * ⚠️ DER ZWEITE DURCHGANG IST EIN BEWEIS, KEINE NACHBESSERUNG. Nach einem
     * Durchgang hiesse die erste „Betreuung · Tasche · ta-1" — und die dritte
     * heisst woertlich so, wurde aber nicht angefasst, weil IHR Ausgangsname
     * nur einmal vorkam. Kollidiert danach noch etwas, bekommt JEDE Zeile
     * ihre ID, und weil IDs eindeutig sind, kann nichts mehr gleich sein.
     */
    const m = einheitLabels([
      t("ta-1", "Betreuung", "tasche"),
      t("ta-2", "Betreuung", "tasche"),
      t("ta-3", "Betreuung · Tasche · ta-1", null),
    ]);
    const alle = [...m.values()].map((w) => w.label);
    expect(new Set(alle).size).toBe(3);
  });

  it("nimmt je Id nur den ERSTEN Eintrag — eine Liste darf eine Einheit doppelt fuehren", () => {
    const m = einheitLabels([t("a", "RTW 1", "fahrzeug"), t("a", "RTW 1", "fahrzeug")]);
    expect(m.size).toBe(1);
    expect(m.get("a")!.label).toBe("RTW 1 · Fahrzeug");
  });
});

describe("_lib und _db tragen weder 'use client' noch einen Icon-Import", () => {
  const wurzel = "src/app/m/lagerbuch";

  function dateien(ordner: string): string[] {
    const p = join(wurzel, ordner);
    if (!existsSync(p)) return [];
    return readdirSync(p, { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .map((f) => join(p, f));
  }

  it.each(["_lib", "_db"])("%s ist frei von 'use client'", (ordner) => {
    // Falle 6: eine Server Component bekaeme eine Client-Referenz statt des Wertes,
    // HTTP 500 fuer die ganze Seite. TypeScript ist zufrieden, `build` findet nichts,
    // und Vitest kann es strukturell nicht sehen — dort ist "use client" ein
    // wirkungsloser String. Deshalb dieser Scan.
    const treffer = dateien(ordner).filter((f) => /^\s*["']use client["']/m.test(readFileSync(f, "utf8")));
    expect(treffer).toEqual([]);
  });

  it.each(["_lib", "_db"])("%s importiert kein Icon", (ordner) => {
    // Falle 7: der nackte Spezifizierer loest auf CJS auf, das createContext auf
    // Modulebene ruft — der Fehler entsteht BEIM IMPORT und reisst jede Datei mit,
    // die die Konstanten liest.
    const treffer = dateien(ordner).filter((f) =>
      /from\s+["'](@ant-design\/icons|lucide-react)/.test(readFileSync(f, "utf8")));
    expect(treffer).toEqual([]);
  });
});

/**
 * §4.15 fuehrt die Enum-Listen bewusst an ZWEI Orten: Drizzle-Enum in _db/schema.ts
 * (1:1-Port des Bestands) und Zod-Liste hier (Eingangsvalidator). Dieser Block haelt
 * sie zusammen. Die REIHENFOLGE darf abweichen — SQLite-`text({enum})` erzeugt keinen
 * CHECK, sie ist im erzeugten SQL unsichtbar (nachpruefbar an
 * lagerbuch/drizzle/0000_brief_zodiak.sql:20, wo buchungen.quelle_typ MIT Enum als
 * nacktes `text NOT NULL` steht).
 */
const enumWerte = (spalte: unknown): string[] =>
  [...((spalte as { enumValues?: string[] }).enumValues ?? [])].sort();

describe("Enum-Listen: Zod-Seite und Drizzle-Seite sind mengengleich", () => {
  it("BUCHUNGSTYPEN", () => {
    expect(enumWerte(getTableColumns(buchungen).typ)).toEqual([...BUCHUNGSTYPEN].sort());
  });
  it("QUELLE_TYPEN — buchungen und checks (checks ist die Abweichung S1)", () => {
    expect(enumWerte(getTableColumns(buchungen).quelleTyp)).toEqual([...QUELLE_TYPEN].sort());
    expect(enumWerte(getTableColumns(checks).quelleTyp)).toEqual([...QUELLE_TYPEN].sort());
  });
  it("LAGERORT_TYPEN", () => {
    expect(enumWerte(getTableColumns(lagerorte).typ)).toEqual([...LAGERORT_TYPEN].sort());
  });
  it("GERAETE_TYPEN", () => {
    expect(enumWerte(getTableColumns(geraete).typ)).toEqual([...GERAETE_TYPEN].sort());
  });
  it("TOKEN_ZIEL_TYPEN", () => {
    expect(enumWerte(getTableColumns(tokens).zielTyp)).toEqual([...TOKEN_ZIEL_TYPEN].sort());
  });
  it("EINHEITENARTEN — DRK-309", () => {
    expect(enumWerte(getTableColumns(lagerorte).einheitenart))
      .toEqual([...EINHEITENARTEN].sort());
  });
});

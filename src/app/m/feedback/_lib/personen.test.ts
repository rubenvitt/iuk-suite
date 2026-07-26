import { describe, it, expect } from "vitest";
import {
  leitungAus,
  passtAufSuche,
  vereinigePersonen,
  vorschlagOptionen,
  SUCHE_MAX_TREFFER,
} from "./personen";
import type { DirectoryPerson } from "@/core/directory";

/**
 * DIE VEREINIGUNG ZWEIER VERZEICHNISSE.
 *
 * Links das Personenverzeichnis aus Pocket ID (kennt JEDEN, auch wer sich nie
 * angemeldet hat), rechts `known_users` (kennt nur, wer das Modul betreten hat,
 * dafuer auch dann noch, wenn die API gerade ausfaellt). Drei Zusagen:
 *
 * 1. KEINE DUPLIKATE. Dieselbe Person steht in beiden Quellen — als zwei Zeilen
 *    waere die Auswahl unbenutzbar und die Tabelle falsch.
 * 2. „NOCH NIE ANGEMELDET" IST KEIN FEHLER, SONDERN DER NORMALFALL, den dieses
 *    Feature erst moeglich macht. Es wird gekennzeichnet, nicht ausgeschlossen.
 * 3. BESTEHENDE ZUORDNUNGEN BLEIBEN LESBAR. Faellt die API aus, ist die
 *    Verzeichnisliste leer — die Leitung MUSS trotzdem vollstaendig erscheinen,
 *    notfalls nur mit Kennung.
 */

const anna: DirectoryPerson = {
  userId: "sub-anna",
  name: "Anna Beispiel",
  email: "anna@drk.example",
};
const neu: DirectoryPerson = { userId: "sub-neu", name: "Nie Da", email: "nie@drk.example" };

describe("vereinigePersonen", () => {
  it("fuehrt dieselbe Person aus beiden Quellen zu EINEM Eintrag zusammen", () => {
    const r = vereinigePersonen(
      [anna],
      [{ userId: "sub-anna", name: "Anna B.", email: "alt@drk.example" }],
      10,
    );

    expect(r).toHaveLength(1);
    expect(r[0].userId).toBe("sub-anna");
  });

  it("das Verzeichnis gewinnt bei Name und E-Mail — es ist die aktuelle Quelle", () => {
    const r = vereinigePersonen(
      [anna],
      [{ userId: "sub-anna", name: "Anna B. (alt)", email: "alt@drk.example" }],
      10,
    );

    expect(r[0]).toMatchObject({ name: "Anna Beispiel", email: "anna@drk.example" });
  });

  it("`known_users` fuellt Luecken, die das Verzeichnis laesst", () => {
    const r = vereinigePersonen(
      [{ userId: "sub-anna", name: null, email: null }],
      [{ userId: "sub-anna", name: "Anna Beispiel", email: "anna@drk.example" }],
      10,
    );

    expect(r[0]).toMatchObject({ name: "Anna Beispiel", email: "anna@drk.example" });
  });

  it("kennzeichnet, wer sich noch nie angemeldet hat — als Zustand, nicht als Fehler", () => {
    const r = vereinigePersonen(
      [anna, neu],
      [{ userId: "sub-anna", name: "Anna Beispiel", email: "anna@drk.example" }],
      10,
    );

    expect(r.find((p) => p.userId === "sub-anna")!.angemeldet).toBe(true);
    expect(r.find((p) => p.userId === "sub-neu")!.angemeldet).toBe(false);
  });

  it("nimmt lokal Bekannte mit, die das Verzeichnis nicht kennt (Ausfall oder geloeschtes Konto)", () => {
    const r = vereinigePersonen([], [{ userId: "sub-alt", name: "Alt", email: null }], 10);

    expect(r.map((p) => p.userId)).toEqual(["sub-alt"]);
    expect(r[0].angemeldet).toBe(true);
  });

  it("begrenzt die Menge — die Nutzlast ist kein Verzeichnisabzug", () => {
    const viele: DirectoryPerson[] = Array.from({ length: 40 }, (_, i) => ({
      userId: `sub-${i}`,
      name: `Person ${i}`,
      email: null,
    }));

    expect(vereinigePersonen(viele, [], 5)).toHaveLength(5);
  });

  it("sortiert nach Namen; wer keinen hat, steht hinten", () => {
    const r = vereinigePersonen(
      [
        { userId: "s3", name: null, email: null },
        { userId: "s2", name: "Berta", email: null },
        { userId: "s1", name: "Anton", email: null },
      ],
      [],
      10,
    );

    expect(r.map((p) => p.userId)).toEqual(["s1", "s2", "s3"]);
  });
});

describe("leitungAus", () => {
  it("zeigt zu jeder Zuordnung den Namen aus dem Verzeichnis", () => {
    const r = leitungAus(["sub-neu"], [neu], []);

    expect(r).toEqual([
      { userId: "sub-neu", name: "Nie Da", email: "nie@drk.example", angemeldet: false },
    ]);
  });

  it("AUSFALL: ohne Verzeichnis bleibt die Zuordnung vollstaendig lesbar", () => {
    const r = leitungAus(
      ["sub-anna", "sub-neu"],
      [],
      [{ userId: "sub-anna", name: "Anna Beispiel", email: "anna@drk.example" }],
    );

    expect(r.map((p) => p.userId)).toEqual(["sub-anna", "sub-neu"]);
    expect(r[0].name).toBe("Anna Beispiel");
    // Unbekannt heisst „ohne Namen", nicht „faellt aus der Liste".
    expect(r[1].name).toBeNull();
  });

  it("haelt die Reihenfolge der Zuordnung ein und erfindet niemanden dazu", () => {
    const r = leitungAus(["sub-neu", "sub-anna"], [anna, neu], []);

    expect(r.map((p) => p.userId)).toEqual(["sub-neu", "sub-anna"]);
  });

  it("entdoppelt eine doppelte Kennung", () => {
    expect(leitungAus(["sub-anna", "sub-anna"], [anna], [])).toHaveLength(1);
  });
});

describe("passtAufSuche", () => {
  const p = { userId: "sub-anna", name: "Anna Beispiel", email: "anna@drk.example" };

  it("trifft ueber den Namen, ohne Ruecksicht auf Gross-/Kleinschreibung", () => {
    expect(passtAufSuche(p, "BEIS")).toBe(true);
  });

  it("trifft ueber die E-Mail", () => {
    expect(passtAufSuche(p, "anna@drk")).toBe(true);
  });

  it("trifft ueber die eingefuegte Kennung", () => {
    expect(passtAufSuche(p, "sub-anna")).toBe(true);
  });

  it("trifft nicht, was nicht passt", () => {
    expect(passtAufSuche(p, "bodo")).toBe(false);
  });

  it("ein leerer Begriff trifft NICHTS — sonst waere die Antwort das Verzeichnis", () => {
    expect(passtAufSuche(p, "  ")).toBe(false);
  });
});

describe("vorschlagOptionen", () => {
  it("der Wert ist lesbar, nicht die rohe Kennung", () => {
    const [o] = vorschlagOptionen([
      { userId: "sub-anna", name: "Anna Beispiel", email: "anna@drk.example", angemeldet: true },
    ]);

    expect(o.wert).toBe("Anna Beispiel · anna@drk.example");
    expect(o.userId).toBe("sub-anna");
  });

  it("gleiche Anzeige, verschiedene Personen: BEIDE Werte werden eindeutig gemacht", () => {
    const optionen = vorschlagOptionen([
      { userId: "sub-1", name: "Max Muster", email: null, angemeldet: false },
      { userId: "sub-2", name: "Max Muster", email: null, angemeldet: false },
    ]);

    expect(new Set(optionen.map((o) => o.wert)).size).toBe(2);
    // Nicht nur der zweite: sonst zeigt die Liste einen Eintrag „Max Muster" und
    // einen „Max Muster · sub-2", und der erste sieht aus wie der richtige.
    expect(optionen.every((o) => o.wert.includes(o.userId))).toBe(true);
  });

  it("ohne Namen und ohne E-Mail bleibt die Kennung — sie ist immer da", () => {
    expect(
      vorschlagOptionen([{ userId: "sub-x", name: null, email: null, angemeldet: false }])[0].wert,
    ).toBe("sub-x");
  });

  it("die Obergrenze der Suche ist klein genug fuer eine Auswahlliste", () => {
    expect(SUCHE_MAX_TREFFER).toBeLessThanOrEqual(25);
  });
});

/**
 * DIE RELEVANZ UEBERLEBT DIE VEREINIGUNG.
 *
 * `core/directory` sortiert seine Treffer nach Relevanz und schneidet auf 20.
 * Sortiert die Vereinigung danach rein alphabetisch und schneidet erneut auf 20,
 * fallen genau die vordersten Treffer heraus — und zwar unsichtbar: die Liste
 * sieht vollstaendig aus und enthaelt die gesuchte Person nicht.
 */
describe("vereinigePersonen — Reihenfolge mit Suchbegriff", () => {
  it("wer vorne passt, steht vorne", () => {
    const r = vereinigePersonen(
      [
        { userId: "s1", name: "Ahrens Bertram", email: null },
        { userId: "s2", name: "Hermann Zann", email: null },
        { userId: "s3", name: "Anna Beispiel", email: null },
      ],
      [],
      10,
      "ann",
    );

    expect(r[0].userId).toBe("s3");
  });

  it("ohne Suchbegriff bleibt es alphabetisch", () => {
    const r = vereinigePersonen(
      [
        { userId: "s2", name: "Berta", email: null },
        { userId: "s1", name: "Anton", email: null },
      ],
      [],
      10,
    );

    expect(r.map((p) => p.userId)).toEqual(["s1", "s2"]);
  });

  it("ein Treffer aus dem Verzeichnis faellt nicht wegen lokaler Namen aus der Liste", () => {
    // Zwanzig lokal Bekannte, alle alphabetisch VOR der gesuchten Person.
    const lokal = Array.from({ length: 20 }, (_, i) => ({
      userId: `lokal-${i}`,
      name: `Aaa Person ${i}`,
      email: null,
    }));

    const r = vereinigePersonen(
      [{ userId: "sub-ziel", name: "Zoe Ziel", email: null }],
      lokal,
      20,
      "zoe",
    );

    expect(r.map((p) => p.userId)).toContain("sub-ziel");
    expect(r[0].userId).toBe("sub-ziel");
  });
});

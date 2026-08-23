// src/app/m/radio/_lib/auswahl.test.ts
import { describe, it, expect } from "vitest";
import { AUSWAHL_MAX, AUSWAHL_PARAMETER, auswahlLesen, auswahlSchreiben } from "./auswahl";

/**
 * DIE AUSWAHL STEHT IN DER URL — MIT EINEM VERTRAG (Spec 1 §4.3.3,
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:3466-3488`).
 *
 * ⛔ WAS DIESE DATEI NICHT PRUEFT: ob eine ID zu einem Geraet gehoert, das es gibt und das
 * frei ist. Das ist eine Frage an die Datenbank und wird SERVERSEITIG in A19 beantwortet
 * (Plan `docs/superpowers/plans/2026-08-22-radio-modul-plan3-zugang-ausleihe.md:5067`).
 * Diese zwei Funktionen kennen nur die Gestalt des Parameters.
 */

/** 25 Kennungen — mehr als der Deckel, damit er sichtbar greift. */
const VIELE: string[] = Array.from({ length: 25 }, (_, i) => `g${String(i).padStart(2, "0")}`);

describe("radio-auswahl: lesen", () => {
  it("dedupliziert, haelt die Reihenfolge und deckelt bei 20", () => {
    /*
     * Drei Zusagen in einem Fall, weil sie an derselben Normalisierung haengen (Spec:3478-3484).
     * Der Deckel ist NEU gegenueber dem Bestand und hat einen gemessenen Anlass: 200 IDs in
     * der URL waeren heute 200 POSTs
     * (`radio-inventar/apps/frontend/src/components/features/ConfirmLoanButton.tsx:55`).
     */
    expect(AUSWAHL_MAX, "der Deckel steht auf einer anderen Zahl als 20").toBe(20);

    expect(auswahlLesen("c,a,b,a,c"), "dedupliziert oder Reihenfolge verdreht").toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(auswahlLesen(" a , ,b ,, c "), "Rand und Leereintraege nicht abgeraeumt").toEqual([
      "a",
      "b",
      "c",
    ]);

    const gedeckelt = auswahlLesen(VIELE.join(","));
    expect(gedeckelt, "der Deckel greift nicht").toHaveLength(AUSWAHL_MAX);
    expect(gedeckelt.at(0), "der Deckel schneidet am falschen Ende").toBe("g00");
    expect(gedeckelt.at(-1)).toBe("g19");
  });

  it("liest ein Array aus searchParams ohne zu werfen", () => {
    /*
     * `searchParams` in Next liefert `string | string[] | undefined` — dieselbe
     * Zweideutigkeit, die der Alt-Kiosk im Client aufloest
     * (`radio-inventar/apps/frontend/src/routes/loan.tsx:12-31`, dort ueber
     * `z.union([z.string(), z.array(z.string())])`). Der WIEDERHOLTE Parameter ist nicht der
     * Vertrag (Spec:3472-3473) — aber ein Aufruf mit einem Array darf trotzdem nicht werfen,
     * sonst ist eine handgeschriebene URL ein HTTP 500 auf der Ausleihseite.
     */
    expect(auswahlLesen(undefined), "undefined ist keine leere Auswahl").toEqual([]);
    expect(auswahlLesen("")).toEqual([]);
    expect(auswahlLesen([])).toEqual([]);
    expect(auswahlLesen(["a", "b"]), "das Array wird nicht gelesen").toEqual(["a", "b"]);
    expect(auswahlLesen(["a,b", "b,c"]), "Array und Komma zusammen").toEqual(["a", "b", "c"]);
  });

  it("nennt den Parameter geraete und nicht deviceIds", () => {
    /*
     * Spec:3472 — EIN Parameter `geraete`, kommagetrennt. Der Alt-Name ist `deviceIds`
     * (`routes/loan.tsx:13`); der Name steht hier als Wert, damit A18 und A19 ihn von hier
     * lesen und die URL an beiden Enden dieselbe ist.
     */
    expect(AUSWAHL_PARAMETER).toBe("geraete");
  });
});

describe("radio-auswahl: schreiben", () => {
  it("auswahlSchreiben und auswahlLesen sind zueinander invers", () => {
    /*
     * ⛔ DIE EINGABE IST ABSICHTLICH UNSORTIERT. Mit einer sortierten Liste waere „haelt die
     * Reihenfolge" von „sortiert" nicht zu unterscheiden, und ein spaeterer Umbau auf
     * `sort()` bliebe gruen — die Insel und die Seite liefen dann auseinander, weil
     * `router.replace` bei jeder Auswahl eine andere Zeichenkette saehe (Spec:3474-3475).
     */
    const auswahl = ["c", "a", "b"];
    expect(auswahlSchreiben(auswahl)).toBe("c,a,b");
    expect(auswahlLesen(auswahlSchreiben(auswahl))).toEqual(auswahl);

    // Beide Richtungen normalisieren gleich — sonst haengt das Ergebnis vom Weg ab.
    const roh = ["c", " a ", "c", "", "b"];
    expect(auswahlLesen(auswahlSchreiben(roh))).toEqual(auswahlLesen(roh.join(",")));
    expect(auswahlSchreiben(roh)).toBe("c,a,b");

    expect(auswahlSchreiben([]), "eine leere Auswahl ist eine leere Zeichenkette").toBe("");
    expect(auswahlSchreiben(VIELE).split(",")).toHaveLength(AUSWAHL_MAX);
  });
});

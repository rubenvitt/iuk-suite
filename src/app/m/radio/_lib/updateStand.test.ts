// src/app/m/radio/_lib/updateStand.test.ts
import { describe, it, expect } from "vitest";
import { berechneUpdateStand } from "./updateStand";

/**
 * DIE EINE RECHNUNG DES UPDATE-STANDS (Entscheidung E-V8,
 * `.superpowers/sdd/planteil4/briefs/KOPF.md:673-704`).
 *
 * ⛔ DIE FAELLE SIND NICHT NUR DIE DES PLANS. Die Aufgabentafel
 * (`.superpowers/sdd/planteil4/briefs/V5.md:68-71`) fuehrt vier Zweigfaelle; der Alt-Bestand
 * fuehrt fuer dieselbe Funktion SECHS
 * (`radio-admin/shared/src/update-status.test.ts:5-31`), darunter zwei, die keine Zweigwahl
 * pruefen, sondern die GENAUIGKEIT des Vergleichs. Sie wandern mit — 1:1-Pflicht: wo eine
 * Suite-Funktion eine Alt-Funktion ersetzt, bildet sie DEREN Regeln ab, und der
 * Praezedenzfall dieses Wegs ist ein weggelassener Filter (`KONTEXT.md`, Nachtrag
 * 2026-08-24: „`geraeteMitLeihstand` filtert `loanable`").
 *
 * ⚠️ DER FALL „aktuell WIRD NIE AUS DEM ANLEGEDATUM ABGELEITET" LIEGT NICHT HIER, und das
 * ist keine Auslassung: diese Funktion kennt kein Datum — ihre beiden Parameter sind zwei
 * Zeichenketten. Ein Anlegedatum gibt es erst dort, wo die Ziel-Marke HERKOMMT. Der Fall
 * liegt deshalb in `_lib/lesepfade/versionen.test.ts` (Block „die Ziel-Marke und das
 * Anlegedatum"), wo `zielVersion(db)` sein Pruefobjekt ist. Sonde S-V5b haengt dort.
 *
 * ⚠️ UND DER KOPPLUNGSFALL LIEGT IN AUFGABE V6. `berechneUpdateStand` und der SQL-Ausdruck
 * von `geraeteListe` muessen dasselbe antworten (E-V8: „`_lib/updateStand.test.ts` haelt
 * beide Ergebnisse gegeneinander") — aber der SQL-Ausdruck entsteht erst in V6, und
 * `.superpowers/sdd/planteil4/briefs/V5.md:73` legt den Fall ausdruecklich nach
 * `_lib/lesepfade/geraete.test.ts`. Hier haette er heute kein Pruefobjekt.
 */
describe("berechneUpdateStand — die drei Zweige", () => {
  it("ohne Softwareversion ist der Stand unbekannt", () => {
    // Erster Zweig, `radio-admin/server/src/repos/deviceRepo.ts:154`.
    expect(berechneUpdateStand(null, "FW 12.3")).toBe("unbekannt");
  });

  it("ohne Softwareversion bleibt der Stand unbekannt, auch ohne gesetzte Zielversion", () => {
    /*
     * Die Zweigreihenfolge ist tragend: die fehlende Version gewinnt gegen die fehlende
     * Marke. Alt-Fall `radio-admin/shared/src/update-status.test.ts:9-11`.
     */
    expect(berechneUpdateStand(null, null)).toBe("unbekannt");
  });

  it("gleich der Zielversion ist aktuell", () => {
    // Zweiter Zweig, `deviceRepo.ts:155`.
    expect(berechneUpdateStand("FW 12.3", "FW 12.3")).toBe("aktuell");
  });

  it("ungleich der Zielversion ist veraltet", () => {
    // Dritter Zweig, `deviceRepo.ts:156`.
    expect(berechneUpdateStand("FW 11.0", "FW 12.3")).toBe("veraltet");
  });

  it("ohne gesetzte Zielversion ist jede nicht leere Version veraltet, nicht unbekannt", () => {
    /*
     * ⛔ DER FALL, DEN DER ALT-KOMMENTAR AUSDRUECKLICH BEGRUENDET
     * (`radio-admin/server/src/repos/deviceRepo.ts:151-152`, woertlich): „When target is
     * null the 'aktuell' branch can never match, so non-null versions fall through to
     * 'veraltet' — matching the shared fn exactly."
     *
     * Ein Nachbau, der hier „unbekannt" antwortet, ist typkorrekt, lint-sauber und faellt
     * in keinem Gate auf — sichtbar wird er erst als falsch gefuellte Kennzahl auf der
     * Uebersicht. Sonde S-V5a haengt an dieser Zeile.
     */
    expect(berechneUpdateStand("FW 12.3", null)).toBe("veraltet");
  });
});

describe("berechneUpdateStand — der Vergleich", () => {
  it("vergleicht zeichengleich und normalisiert nicht", () => {
    /*
     * Alt-Fall `radio-admin/shared/src/update-status.test.ts:27-30`. Weder Gross- und
     * Kleinschreibung noch Leerraum am Rand werden eingeebnet: die Versionswerte sind
     * erfasste Zeichenketten, und zwei, die verschieden aussehen, SIND verschieden.
     */
    expect(berechneUpdateStand("fw 12.3", "FW 12.3")).toBe("veraltet");
    expect(berechneUpdateStand("FW 12.3 ", "FW 12.3")).toBe("veraltet");
  });

  it("die leere Zeichenkette ist eine gesetzte Version und kein fehlender Wert", () => {
    /*
     * ⛔ DER WAECHTER GEGEN DEN NAHELIEGENDSTEN NACHBAU-FEHLER. Der Alt-Bestand prueft
     * `=== null` (`radio-admin/shared/src/update-status.ts:7`), nicht auf Falschheit; ein
     * `if (!softwareVersion)` faltete die leere Zeichenkette still in den ersten Zweig und
     * machte aus „veraltet" ein „unbekannt". Beide Richtungen stehen hier: leere Version
     * gegen gesetzte Marke, und leere Version gegen leere Marke — letztere ist nach der
     * Alt-Regel „gleich" und damit aktuell.
     */
    expect(berechneUpdateStand("", "FW 12.3")).toBe("veraltet");
    expect(berechneUpdateStand("", "")).toBe("aktuell");
  });
});

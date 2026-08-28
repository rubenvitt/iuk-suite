// src/app/m/radio/_lib/status.test.ts
import { describe, it, expect } from "vitest";
import { FARBEN } from "@/core/theme/tokens";
import {
  GERAETE_STATUS,
  STATUS_HEX,
  STATUS_TOENE,
  geraeteZustandAus,
  statusEtikett,
  statusTon,
  type GeraeteStatus,
} from "./status";

/**
 * DER EIGENE STATUS-CHIP (Entscheidung E3, Spec 1 §4.6.2,
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:3671-3697`).
 *
 * ⛔ `FARBEN` WIRD NUR HIER IMPORTIERT, NIE IN `status.ts`. Ein Import dort laese sich als
 * „die vier Chipfarben sind aus antd-Tokens abgeleitet" — genau das, was A-L10 und
 * Entscheidung E3 verbieten (Spec:3691-3694). Der Import ist `@/core/theme/tokens` und
 * nicht `@/core/theme`: `FARBEN` liegt in `src/core/theme/tokens.ts:13`, und ein
 * `src/core/theme/index.ts` existiert nicht (gemessen: `ls src/core/theme/`).
 *
 * ⚠️ EIN FALL AUS DEM PLAN STEHT HIER ABSICHTLICH NICHT: „der Statuspunkt ist nicht der
 * einzige Traeger" scannt `_ui/StatusChip.tsx`, und die Datei entsteht erst in A16. Ein
 * Scan ueber eine Datei, die es nicht gibt, waere leer-gruen und bewachte nichts (NT11).
 * Der Fall gehoert zu A16 und wird dort bereits gefuehrt
 * (`.superpowers/sdd/planteil3/VORABSCAN-A.md:295-304`, Fund F15).
 */

/** Die vier Etiketten, woertlich aus dem Alt-Kiosk — der Anker steht am Fall unten. */
const ETIKETTEN: Record<GeraeteStatus, string> = {
  AVAILABLE: "Verfügbar",
  ON_LOAN: "Ausgeliehen",
  DEFECT: "Defekt",
  MAINTENANCE: "Wartung",
};

describe("radio-status: die Union und ihre Vollzaehligkeit", () => {
  it("jeder der vier Zustaende hat Etikett UND Ton", () => {
    /*
     * ⛔ DIE ZAHL 4 STEHT ALS EIGENE ZUSICHERUNG AUSSERHALB DER SCHLEIFE (Testauftrag der
     * Spec, `:4027`, und Brief A12). Ohne sie schrumpft die geprueften Menge lautlos: faellt
     * ein Wert aus `GERAETE_STATUS`, laeuft die Schleife ueber drei und bleibt gruen.
     */
    expect(GERAETE_STATUS.length, "die Union hat vier Zweige (A-L13, kein fuenfter)").toBe(4);

    for (const status of GERAETE_STATUS) {
      expect(statusEtikett(status), `${status}: leeres Etikett`).not.toBe("");
      expect(STATUS_TOENE, `${status}: unbekannter Ton`).toContain(statusTon(status));
    }
  });

  it("die vier Zustaende tragen vier VERSCHIEDENE Toene und vier verschiedene Etiketten", () => {
    /*
     * Ohne diesen Fall waere eine Zuordnung, die DEFECT auf den Ton „frei" legt, vollzaehlig
     * und gruen — ein defektes Geraet saehe aus wie ein freies. Die Abbildung ist umkehrbar
     * eindeutig, und das ist eine Aussage ueber die Flaeche, nicht ueber den Typ.
     */
    expect(new Set(GERAETE_STATUS.map(statusTon)).size).toBe(4);
    expect(new Set(GERAETE_STATUS.map(statusEtikett)).size).toBe(4);
  });

  it("die Etiketten stehen woertlich so, wie der Alt-Kiosk sie schreibt", () => {
    /*
     * Abgelesen aus
     * `/Users/rubeen/dev/personal/drk/radio-inventar/apps/frontend/src/components/features/StatusBadge.tsx`,
     * Zeilen 25 (`'Verfügbar'`), 32 (`'Ausgeliehen'`), 39 (`'Defekt'`), 46 (`'Wartung'`).
     *
     * ⚠️ HIER STEHEN UMLAUTE IN EINEM ZITIERTEN WERT, und das ist die EINE benannte
     * Ausnahme der Hausregel (`briefs/KOPF.md`, Global Constraints): Bildschirmtexte tragen
     * ihre Umlaute. Ein „Verfuegbar" auf dem Chip waere schlicht falsches Deutsch. Der
     * TESTNAME daneben bleibt umlautfrei, wie die Regel es verlangt.
     */
    for (const status of GERAETE_STATUS) {
      expect(statusEtikett(status), `${status}: anderes Etikett als der Alt-Kiosk`)
        .toBe(ETIKETTEN[status]);
    }
  });
});

describe("radio-status: die Farben (A-L10)", () => {
  it("kein Statuston benutzt colorError oder colorPrimary", () => {
    /*
     * ⛔ FALLE 3 (`CLAUDE.md`, Punkt 3): `colorError === colorPrimary === FARBEN.rot`
     * (`src/core/theme/theme.ts:32-33`). Rot ist in dieser Suite die PRIMAERAKTION; ein
     * Chip „Defekt" in derselben Farbe saehe aus wie der Knopf, den man druecken soll.
     *
     * Geprueft werden ALLE ACHT Werte — hell und dunkel —, nicht nur die vier hellen: die
     * Dunkelvariante rendert auf derselben Flaeche und traegt dieselbe Verwechslung.
     */
    for (const ton of STATUS_TOENE) {
      const paar = STATUS_HEX[ton];
      expect(paar.hell.toLowerCase(), `${ton}/hell ist colorPrimary (theme.ts:32-33)`)
        .not.toBe(FARBEN.rot.toLowerCase());
      expect(paar.dunkel.toLowerCase(), `${ton}/dunkel ist colorPrimary (theme.ts:32-33)`)
        .not.toBe(FARBEN.rot.toLowerCase());
    }
  });

  it("STATUS_HEX fuehrt genau die vier Toene, jeden mit Hell- und Dunkelwert", () => {
    expect(Object.keys(STATUS_HEX).sort()).toEqual([...STATUS_TOENE].sort());
    for (const ton of STATUS_TOENE) {
      // Sechsstelliges Hex mit Raute — die Form, die A16 als CSS-Variable weiterschreibt.
      expect(STATUS_HEX[ton].hell, `${ton}/hell ist kein Hexwert`).toMatch(/^#[0-9a-f]{6}$/);
      expect(STATUS_HEX[ton].dunkel, `${ton}/dunkel ist kein Hexwert`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("die acht Hexwerte stehen woertlich so wie im Alt-Kiosk", () => {
    /*
     * ⬜ A-L10, abgelesen aus `StatusBadge.tsx`, und zwar aus `badgeClassName` — den Zeilen
     * 27, 34, 41 und 49. ⚠️ NICHT aus `indicatorClassName` (Zeilen 28-29, 35-36, 42-43,
     * 50-51): das sind dieselben Farben MIT Deckkraft-Zusaetzen und teils ganz andere Werte
     * (`slate-*` statt `#6b7280` bei Wartung). Wer die falsche der beiden Zeilen liest,
     * bekommt ein plausibles Ergebnis, das nicht der Chip ist.
     *
     * Die Lesart von `bg-[#22c55e] dark:bg-[#16a34a]`: der erste Wert ist die HELLE
     * Darstellung, der zweite die DUNKLE.
     */
    expect(STATUS_HEX).toEqual({
      frei: { hell: "#22c55e", dunkel: "#16a34a" },       // StatusBadge.tsx:27
      vergeben: { hell: "#f59e0b", dunkel: "#d97706" },   // StatusBadge.tsx:34
      defekt: { hell: "#ef4444", dunkel: "#dc2626" },     // StatusBadge.tsx:41
      wartung: { hell: "#6b7280", dunkel: "#9ca3af" },    // StatusBadge.tsx:49
    });
  });
});

describe("radio-status: die Faltung eines Geraets ohne erfassten Zustand (A-L13)", () => {
  it("ein Geraet ohne erfassten Zustand faellt auf frei zurueck", () => {
    /*
     * ⛔ BETREIBERENTSCHEIDUNG, `.superpowers/sdd/planteil3/progress.md:22-32`, woertlich:
     * „`status = NULL` faellt auf ‚frei' zurueck … Kein fuenfter Chip-Zustand, kein eigener
     * Ton ‚unbekannt', keine Sperre der Ausleihe."
     *
     * ⚠️ SIE UEBERHOLT DEN PLAN, der an dieser Stelle das GEGENTEIL schreibt („kein stiller
     * Rueckfall auf ‚frei'", `briefs/A12.md:77-78`) — der Vorabscan fuehrt das als Fund F2
     * (`VORABSCAN-A.md:189-190`).
     *
     * Und sie ist zugleich das gemessene Verhalten des Alt-Bestands, an ZWEI Stellen:
     * `radio-admin/shared/src/loan.ts:19-28` und
     * `radio-inventar/packages/shared/src/schemas/radio-admin-device.schema.ts:48-58` —
     * dort woertlich „anything else — including null, 'Einsatzbereit' and a stale
     * 'Ausgeliehen' — is AVAILABLE".
     */
    expect(geraeteZustandAus(null)).toBe("AVAILABLE");
    expect(geraeteZustandAus(undefined)).toBe("AVAILABLE");
    expect(geraeteZustandAus("")).toBe("AVAILABLE");
    expect(geraeteZustandAus("   ")).toBe("AVAILABLE");
    expect(geraeteZustandAus("Einsatzbereit")).toBe("AVAILABLE");
  });

  it("erkennt defekt und wartung unabhaengig von Schreibweise und Rand", () => {
    /*
     * 1:1 aus `radio-admin/shared/src/loan.ts:20` (`status?.trim().toLowerCase()`). Die
     * Spalte ist FREITEXT aus radio-admin (`_db/schema.ts:30`, `text("status")` ohne
     * `enum`); ohne Trimmen und Kleinschreibung liefe ein „ Defekt" als frei durch, und ein
     * defektes Geraet waere ausleihbar.
     */
    expect(geraeteZustandAus("defekt")).toBe("DEFECT");
    expect(geraeteZustandAus("Defekt")).toBe("DEFECT");
    expect(geraeteZustandAus("  DEFEKT  ")).toBe("DEFECT");
    expect(geraeteZustandAus("wartung")).toBe("MAINTENANCE");
    expect(geraeteZustandAus("Wartung")).toBe("MAINTENANCE");
    expect(geraeteZustandAus(" WARTUNG ")).toBe("MAINTENANCE");
  });

  it("liest ein stehengebliebenes Ausgeliehen NICHT als vergeben", () => {
    /*
     * ⛔ DER LEIHSTAND KOMMT AUS DER TABELLE `loans`, NIE AUS DIESER SPALTE — dieselbe
     * Trennung wie im Bestand (`radio-admin/shared/src/loan.ts:12-14`: „minus the ON_LOAN
     * overlay (loan state is now derived from the loans table, not the status field)").
     * Ein altes „Ausgeliehen" im Freitext ist ein Datenrest, kein Leihstand; wer ihn hier
     * mitliest, sperrt ein freies Geraet auf Dauer.
     *
     * ⬜ DIE UEBERLAGERUNG MIT `ON_LOAN` GEHOERT A15 (`_db/leihen.ts`) — dort steht der
     * Leihstand zur Verfuegung. Diese zwei Zusicherungen tasten nur ZWEI Eingaben ab; dass
     * die Funktion `ON_LOAN` GAR NICHT liefern KANN, haelt ihr Rueckgabetyp
     * (`Exclude<GeraeteStatus, "ON_LOAN">` in `_lib/status.ts`), nicht dieser Fall.
     */
    expect(geraeteZustandAus("Ausgeliehen")).toBe("AVAILABLE");
    expect(geraeteZustandAus("ON_LOAN")).toBe("AVAILABLE");
  });

  it("ein Geraet ohne erfassten Zustand traegt Ton und Etikett des freien Geraets", () => {
    /*
     * Die zweite Haelfte der Entscheidung, an der Flaeche gemessen statt am Typ: der
     * angenommene Preis ist, dass ein Geraet ohne erfassten Zustand „auf der Flaeche aus
     * wie ein geprueft freies" aussieht (`progress.md:27-29`). Dieser Fall SICHERT genau
     * das zu — er ist der Ort, an dem eine spaetere Umkehrung der Entscheidung rot wird.
     */
    expect(statusTon(geraeteZustandAus(null))).toBe("frei");
    expect(statusEtikett(geraeteZustandAus(null))).toBe("Verfügbar");
  });
});

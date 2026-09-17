import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { lagerorte, tokens } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { TOKEN_ALPHABET, TOKEN_ZIEHUNGEN, TOKEN_ZIFFERN } from "../tokenForm";

/**
 * DIE ORTSCODES — DRK-406.
 *
 * ⚠️ DIE HÄLFTE DIESER DATEI IST AUS `_actions/tokens.test.ts` HERGEZOGEN, nicht
 * neu erfunden: Alphabet, Länge, Ziehungszahl und die Kollisionsprüfung gegen
 * ALLE Zeilen (Entscheidung 8-F) waren dort an `createToken` geprüft. Jene
 * Action ist mit dem Anlegen von Hand entfallen — die Zusicherungen gelten
 * unverändert weiter, nur eben an der Stelle, an der heute gezogen wird. Wer
 * sie beim Aufräumen mit der Action verlieren lässt, verliert §8.3.
 */

const { generatorKonfiguration, ziffernGenerator } = vi.hoisted(() => ({
  generatorKonfiguration: [] as { alphabet: string; laenge: number | undefined }[],
  ziffernGenerator: vi.fn<() => string>(),
}));

vi.mock("nanoid", async () => {
  const echt = await vi.importActual<typeof import("nanoid")>("nanoid");
  return {
    ...echt,
    customAlphabet: (alphabet: string, laenge?: number) => {
      generatorKonfiguration.push({ alphabet, laenge });
      return ziffernGenerator;
    },
  };
});

import {
  aktiverOrtCode, setzeOrtCodeNeu, stelleOrtCodeSicher, stelleOrtCodesSicher,
} from "./ortCodes";
import { etikettOrt } from "../lesepfade/ortEtiketten";

const QUELLE = "src/app/m/lagerbuch/_lib/schreibpfade/ortCodes.ts";

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (K-4), wie sie auch
 * `TokenTable.test.tsx` fuehrt. Der Scan auf `Math.random` waere sonst rot an
 * seiner eigenen Begruendung: `ortCodes.ts` schreibt im Kommentar woertlich
 * aus, warum dort NICHT `Math.random()` steht. Der Kommentar wird nicht
 * umformuliert, um einen Test gruen zu machen.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

const AUSSTELLER = "u-admin";

let t: TestDb;

beforeEach(() => {
  ziffernGenerator.mockReset();
  let naechster = 1;
  ziffernGenerator.mockImplementation(() => String(naechster++).padStart(6, "0"));
  t = migrierteTestDb("lagerbuch-ortcodes-");
});

afterEach(() => {
  t.schliessen();
});

function einheit(args: {
  id: string;
  name: string;
  aktiv?: boolean;
  einheitenart?: "fahrzeug" | "tasche" | null;
}): void {
  t.db.insert(lagerorte).values({
    id: args.id,
    name: args.name,
    typ: "fahrzeug",
    kennung: null,
    aktiv: args.aktiv ?? true,
    einheitenart: args.einheitenart ?? "fahrzeug",
  }).run();
}

function zeilenVon(ortId: string) {
  return t.db.select().from(tokens).where(eq(tokens.ortId, ortId)).all();
}

function ortVon(id: string) {
  const ort = etikettOrt(t.db, id);
  if (!ort) throw new Error(`kein Etikettort: ${id}`);
  return ort;
}

describe("die Codeform (§8.3) — unverändert, nur an der neuen Stelle", () => {
  it("konfiguriert den Generator aus den Konstanten, nicht aus Literalen", () => {
    const quelle = readFileSync(QUELLE, "utf8");

    expect(quelle).toContain('from "../tokenForm"');
    expect(quelle).toMatch(/customAlphabet\(\s*TOKEN_ALPHABET\s*,\s*TOKEN_ZIFFERN\s*\)/);
    expect(quelle, "das Alphabet steht nur noch in _lib/tokenForm.ts")
      .not.toMatch(/customAlphabet\(\s*["']/);
    expect(generatorKonfiguration).toContainEqual({
      alphabet: TOKEN_ALPHABET,
      laenge: TOKEN_ZIFFERN,
    });
  });

  /**
   * ⚠️ DIE ZIEHUNG IST KRYPTOGRAFISCH, UND KEIN TOR SIEHT DAS GEGENTEIL. Der
   * Coderaum ist 10^6; die Sicherheit gegen Raten liegt ausdrücklich nicht in
   * der Länge, sondern in der Drosselung davor (§3.5.3). Ein
   * `Math.random()`-Nachbau wäre typkorrekt, lint-sauber, und jede andere
   * Zusicherung dieser Datei bliebe grün — er nähme der Drosselung nur ihre
   * Grundlage. Deshalb steht die Abwesenheit hier als eigene Zusicherung.
   */
  it("zieht über nanoid und nie über Math.random", () => {
    expect(ohneKommentare(readFileSync(QUELLE, "utf8"))).not.toContain("Math.random");
  });

  it("speichert den Code in der Form NNN-NNN", () => {
    const code = stelleOrtCodeSicher(t.db, ortVon(HANDLAGER_ID), AUSSTELLER);

    expect(code).toMatch(/^\d{3}-\d{3}$/);
    expect(
      t.db.select().from(tokens).where(eq(tokens.code, code!)).get(),
      "der Bindestrich muss in der Spalte stehen",
    ).toBeDefined();
  });

  it("zieht höchstens TOKEN_ZIEHUNGEN mal", () => {
    ziffernGenerator.mockReturnValue("111111");
    expect(stelleOrtCodeSicher(t.db, ortVon(HANDLAGER_ID), AUSSTELLER)).toBe("111-111");

    einheit({ id: "rtw-1", name: "RTW 1" });
    ziffernGenerator.mockClear();
    expect(stelleOrtCodeSicher(t.db, ortVon("rtw-1"), AUSSTELLER)).toBeNull();
    expect(ziffernGenerator).toHaveBeenCalledTimes(TOKEN_ZIEHUNGEN);
    expect(readFileSync(QUELLE, "utf8")).toMatch(/versuch\s*<\s*TOKEN_ZIEHUNGEN/);
  });

  /**
   * ENTSCHEIDUNG 8-F, UND SEIT DRK-406 IST SIE DIE HALBE WIRKUNG DES
   * ZURÜCKSETZENS: die Kollisionsprüfung läuft gegen ALLE vorhandenen Zeilen,
   * nicht nur gegen die aktiven. Ein gesperrter Code bleibt für immer belegt —
   * ein missbrauchter kann also nie wieder gezogen werden und nie wieder eine
   * Karte treffen, von der jemand ein Foto hat. Liefe die Prüfung nur gegen die
   * aktiven Zeilen, wäre das Zurücksetzen auf Dauer wirkungslos.
   */
  it("vergibt einen gesperrten Code nicht neu", () => {
    const alt = stelleOrtCodeSicher(t.db, ortVon(HANDLAGER_ID), AUSSTELLER)!;
    const neu = setzeOrtCodeNeu(t.db, ortVon(HANDLAGER_ID), AUSSTELLER);

    expect(neu).not.toBe(alt);
    // Die alte Zeile steht noch da, gesperrt — DAS ist, was den Wert belegt.
    expect(t.db.select().from(tokens).where(eq(tokens.code, alt)).get()?.aktiv).toBe(false);

    const block = /function ziehFreienCode[\s\S]*?\n}/.exec(readFileSync(QUELLE, "utf8"))![0];
    expect(block).toContain("tokens.code");
    expect(block, "Kollisionspruefung darf nicht auf aktiv filtern")
      .not.toContain("tokens.aktiv");
  });
});

describe("stelleOrtCodesSicher — idempotent und rein additiv", () => {
  it("versorgt den Handlager und jede aktive Einheit mit genau einem Code", () => {
    einheit({ id: "rtw-1", name: "RTW 1" });
    einheit({ id: "ta-1", name: "Rucksack", einheitenart: "tasche" });

    expect(stelleOrtCodesSicher(t.db, AUSSTELLER, "A. Verwaltung")).toBe(3);

    for (const id of [HANDLAGER_ID, "rtw-1", "ta-1"]) {
      expect(zeilenVon(id), id).toHaveLength(1);
      expect(aktiverOrtCode(t.db, id), id).toMatch(/^\d{3}-\d{3}$/);
    }
  });

  /**
   * ⚠️ DER ZWEITE AUFRUF DARF NICHTS TUN. Sie läuft bei JEDEM Öffnen der
   * Ortsetiketten — also in einem GET, den ein Reload beliebig oft wiederholt.
   * Wäre sie nicht idempotent, wechselte der Code am Fahrzeug bei jedem Blick
   * auf die Druckvorschau, und jede gedruckte Karte wäre beim Ankleben schon
   * tot.
   */
  it("legt beim zweiten Aufruf nichts nach", () => {
    einheit({ id: "rtw-1", name: "RTW 1" });
    stelleOrtCodesSicher(t.db, AUSSTELLER, null);
    const vorher = t.db.select().from(tokens).all();

    expect(stelleOrtCodesSicher(t.db, AUSSTELLER, null)).toBe(0);
    expect(t.db.select().from(tokens).all()).toEqual(vorher);
  });

  /**
   * ⚠️ EINE STILLGELEGTE EINHEIT BEKOMMT KEINEN. Sie ist kein Buchungsziel
   * mehr und hat deshalb keine Ortskarte (`_lib/lesepfade/ortEtiketten.ts`) —
   * ein Code für sie wäre einer, den niemand je zu sehen bekäme.
   */
  it("überspringt stillgelegte Einheiten und Schränke", () => {
    einheit({ id: "alt", name: "Ausgemustert", aktiv: false });
    t.db.insert(lagerorte).values({
      id: "schrank", name: "Schrank 1", typ: "lager",
      kennung: null, aktiv: true, parentId: HANDLAGER_ID, einheitenart: null,
    }).run();

    stelleOrtCodesSicher(t.db, AUSSTELLER, null);

    expect(zeilenVon("alt")).toEqual([]);
    expect(zeilenVon("schrank")).toEqual([]);
    expect(zeilenVon(HANDLAGER_ID)).toHaveLength(1);
  });

  /**
   * ⚠️ DER HANDLAGER-CODE HAT KEIN ZIEL, DER EINHEITEN-CODE SCHON — und das
   * ist der Unterschied, an dem `ort_id` und `ziel_id` auseinandergehen.
   * Landete der Handlager-Code auf `ziel_typ: "fahrzeug"`, führte ein Scan am
   * Regal in den Fahrzeug-Check.
   */
  it("gibt dem Handlager kein Ziel und der Einheit ihres", () => {
    einheit({ id: "rtw-1", name: "RTW 1" });
    stelleOrtCodesSicher(t.db, AUSSTELLER, null);

    const lager = zeilenVon(HANDLAGER_ID)[0];
    expect(lager.zielTyp).toBeNull();
    expect(lager.zielId).toBeNull();
    expect(lager.label).toBe("Handlager");

    const rtw = zeilenVon("rtw-1")[0];
    expect(rtw.zielTyp).toBe("fahrzeug");
    expect(rtw.zielId).toBe("rtw-1");
  });

  /**
   * ⚠️ ZWEI AKTIVE CODES AN EINEM ORT SIND IN DER DATENBANK UNMÖGLICH, nicht
   * nur im Schreibpfad vermieden. Diese Zusicherung misst den Teilindex, nicht
   * die Funktion darüber: sie schreibt von Hand an ihm vorbei.
   */
  it("lässt keinen zweiten aktiven Code am selben Ort zu", () => {
    stelleOrtCodesSicher(t.db, AUSSTELLER, null);

    expect(() => t.db.insert(tokens).values({
      id: "zweiter", code: "000-000", label: "Schmuggel",
      ortId: HANDLAGER_ID, zielTyp: null, zielId: null,
      aktiv: true, createdAt: new Date(), createdBy: AUSSTELLER,
    }).run()).toThrow(/UNIQUE/i);
  });

  /** Der Altbestand hat keine `ort_id` und fällt damit gar nicht unter den Index. */
  it("lässt beliebig viele Codes ohne Ort zu", () => {
    for (const [i, code] of ["100-100", "200-200", "300-300"].entries()) {
      t.db.insert(tokens).values({
        id: `alt-${i}`, code, label: "von Hand",
        ortId: null, zielTyp: null, zielId: null,
        aktiv: true, createdAt: new Date(), createdBy: AUSSTELLER,
      }).run();
    }

    expect(t.db.select().from(tokens).all()).toHaveLength(3);
  });
});

describe("setzeOrtCodeNeu — sperren und ersetzen", () => {
  it("sperrt den alten Code, legt einen neuen an und behält die Zugehörigkeit", () => {
    einheit({ id: "rtw-1", name: "RTW 1" });
    const alt = stelleOrtCodeSicher(t.db, ortVon("rtw-1"), AUSSTELLER)!;

    const neu = setzeOrtCodeNeu(t.db, ortVon("rtw-1"), AUSSTELLER)!;

    const zeilen = zeilenVon("rtw-1");
    expect(zeilen).toHaveLength(2);
    expect(zeilen.find((z) => z.code === alt)!.aktiv).toBe(false);
    expect(zeilen.find((z) => z.code === neu)!.aktiv).toBe(true);
    expect(aktiverOrtCode(t.db, "rtw-1")).toBe(neu);
    // ⚠️ DIE ALTE `ort_id` BLEIBT STEHEN: sie ist die einzige Auskunft
    // darüber, an welcher Karte ein gesperrter Code einmal hing.
    expect(zeilen.every((z) => z.ortId === "rtw-1")).toBe(true);
  });

  it("lässt sich mehrfach hintereinander anwenden", () => {
    stelleOrtCodeSicher(t.db, ortVon(HANDLAGER_ID), AUSSTELLER);
    const erste = setzeOrtCodeNeu(t.db, ortVon(HANDLAGER_ID), AUSSTELLER);
    const zweite = setzeOrtCodeNeu(t.db, ortVon(HANDLAGER_ID), AUSSTELLER);

    expect(erste).not.toBe(zweite);
    expect(zeilenVon(HANDLAGER_ID)).toHaveLength(3);
    expect(zeilenVon(HANDLAGER_ID).filter((z) => z.aktiv)).toHaveLength(1);
  });

  /**
   * ⚠️ DER TEUERSTE AUSGANG DIESER FUNKTION, UND ER IST STILL: die Ziehung ist
   * erschöpft, das `UPDATE` hat aber schon gesperrt. Der Ort stünde ohne
   * aktiven Code da — die Karte am Fahrzeug führte ab dann aufs Anmeldefeld,
   * und niemand wüsste, warum. better-sqlite3 rollt nur bei einem WURF zurück;
   * ein zurückgegebenes `null` committete mit.
   */
  it("rollt vollständig zurück, wenn kein freier Code mehr zu ziehen ist", () => {
    const alt = stelleOrtCodeSicher(t.db, ortVon(HANDLAGER_ID), AUSSTELLER)!;
    ziffernGenerator.mockReturnValue(alt.replace("-", ""));

    expect(setzeOrtCodeNeu(t.db, ortVon(HANDLAGER_ID), AUSSTELLER)).toBeNull();

    expect(zeilenVon(HANDLAGER_ID)).toHaveLength(1);
    expect(aktiverOrtCode(t.db, HANDLAGER_ID)).toBe(alt);
  });
});

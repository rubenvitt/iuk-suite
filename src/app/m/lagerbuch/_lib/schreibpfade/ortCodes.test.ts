import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import type { DB } from "../../_db/client";
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
  aktiverOrtCode, setzeOrtCodeNeu, StandVeraltet, stelleOrtCodeSicher, stelleOrtCodesSicher,
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
    const neu = setzeOrtCodeNeu(t.db, ortVon(HANDLAGER_ID), AUSSTELLER, alt);

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

/**
 * ⚠️ „WIRFT NIE" IST EINE ZUSAGE AN `createFahrzeug`, UND SIE HAT GEFEHLT
 * (Durchsicht zu DRK-406). Jene Action ruft `stelleOrtCodeSicher` AUSSERHALB
 * ihres eigenen `try` — absichtlich, damit ein fehlgeschlagener Code die
 * bereits angelegte Einheit nicht zurücknimmt. Genau dort schlüge ein Wurf
 * durch und bräche die Aktion ab, NACHDEM die Einheit in der Datenbank steht:
 * die Verwaltende sähe „Einheit konnte nicht angelegt werden" und fände sie
 * nach dem Neuladen trotzdem in der Liste.
 */
describe("stelleOrtCodeSicher — wirft nie, auch nicht am INSERT", () => {
  it("gibt `null` zurück, wenn die Eindeutigkeit schon belegt ist", () => {
    einheit({ id: "rtw-1", name: "RTW 1" });
    // Der Ort hat bereits einen aktiven Code, aber die Zeile davor sieht ihn
    // nicht — so verhält sich der verlorene Wettlauf zweier Anfragen.
    t.db.insert(tokens).values({
      id: "fremd", code: "123-123", label: "zuerst da",
      ortId: "rtw-1", zielTyp: "fahrzeug", zielId: "rtw-1",
      aktiv: true, createdAt: new Date(), createdBy: AUSSTELLER,
    }).run();

    /*
     * ⚠️ UND ER GIBT DEN VORHANDENEN CODE HERAUS, nicht `null`: die Karte IST
     * versorgt — der andere Aufruf hat sie versorgt. `null` wäre hier die
     * Auskunft „es gibt keinen Code", und die wäre falsch.
     */
    expect(() => stelleOrtCodeSicher(t.db, ortVon("rtw-1"), AUSSTELLER)).not.toThrow();
    expect(stelleOrtCodeSicher(t.db, ortVon("rtw-1"), AUSSTELLER)).toBe("123-123");
    expect(zeilenVon("rtw-1")).toHaveLength(1);
  });

  it("gibt `null` zurück, wenn die Ziehung erschöpft ist", () => {
    ziffernGenerator.mockReturnValue("111111");
    expect(stelleOrtCodeSicher(t.db, ortVon(HANDLAGER_ID), AUSSTELLER)).toBe("111-111");

    einheit({ id: "rtw-2", name: "RTW 2" });
    expect(() => stelleOrtCodeSicher(t.db, ortVon("rtw-2"), AUSSTELLER)).not.toThrow();
    expect(stelleOrtCodeSicher(t.db, ortVon("rtw-2"), AUSSTELLER)).toBeNull();
  });
});

/**
 * ⚠️ „WIRFT NIE" HEISST AUCH: KEIN LESENDER ZUGRIFF WIRFT — gefunden in der
 * Durchsicht, nachdem ein erster Anlauf nur das `INSERT` abgesichert hatte.
 * Auch ein `SELECT` wirft, wenn die Datenbank gerade gesperrt ist, und der
 * erste stand ausserhalb des `try`. Er ist damit der wahrscheinlichste Wurf
 * von allen: er laeuft unmittelbar nach dem `INSERT` der Einheit.
 *
 * Was daran haengt: `createFahrzeug` ruft die Funktion AUSSERHALB seines
 * eigenen `try`, damit ein fehlgeschlagener Code die Einheit nicht zuruecknimmt
 * — ein durchgeschlagener Wurf meldete der Bedienenden einen Fehlschlag,
 * NACHDEM die Einheit schon stand, und der zweite Versuch legte sie doppelt an.
 */
describe("stelleOrtCodeSicher — auch ein werfender Lesepfad kommt nicht durch", () => {
  function werfendeDb(wieOft: number): DB {
    let uebrig = wieOft;
    return new Proxy(t.db as object, {
      get(ziel, name, empfaenger) {
        if (name === "select" && uebrig > 0) {
          uebrig--;
          return () => { throw new Error("SQLITE_BUSY: database is locked"); };
        }
        return Reflect.get(ziel, name, empfaenger);
      },
    }) as DB;
  }

  it("gibt `null` zurueck, wenn schon die erste Abfrage wirft", () => {
    einheit({ id: "rtw-1", name: "RTW 1" });
    // Zweimal: die Abfrage davor UND der Rueckfall im `catch`.
    expect(stelleOrtCodeSicher(werfendeDb(2), ortVon("rtw-1"), AUSSTELLER)).toBeNull();
  });
});

describe("setzeOrtCodeNeu — sperren und ersetzen", () => {
  it("sperrt den alten Code, legt einen neuen an und behält die Zugehörigkeit", () => {
    einheit({ id: "rtw-1", name: "RTW 1" });
    const alt = stelleOrtCodeSicher(t.db, ortVon("rtw-1"), AUSSTELLER)!;

    const neu = setzeOrtCodeNeu(t.db, ortVon("rtw-1"), AUSSTELLER, alt)!;

    const zeilen = zeilenVon("rtw-1");
    expect(zeilen).toHaveLength(2);
    expect(zeilen.find((z) => z.code === alt)!.aktiv).toBe(false);
    expect(zeilen.find((z) => z.code === neu)!.aktiv).toBe(true);
    expect(aktiverOrtCode(t.db, "rtw-1")).toBe(neu);
    // ⚠️ DIE ALTE `ort_id` BLEIBT STEHEN: sie ist die einzige Auskunft
    // darüber, an welcher Karte ein gesperrter Code einmal hing.
    expect(zeilen.every((z) => z.ortId === "rtw-1")).toBe(true);
  });

  /**
   * ⚠️ „GESPERRT" IST NICHT „VERBRANNT", und der Unterschied ist genau das,
   * was die Anwender-Notiz zusagt: „der bisherige ist dann dauerhaft
   * gesperrt". `aktiv = false` allein ist rücknehmbar — und soll es am
   * Altbestand bleiben. `ersetztAm` ist die Spur, die das Zurücknehmen für
   * DIESEN Code ausschließt; gelesen wird sie in `_actions/tokens.ts`.
   *
   * ⚠️ UND SIE STEHT NUR AM ALTEN. Trüge der neue Code sie auch, wäre er vom
   * ersten Tag an nicht mehr reaktivierbar — die Sperre gälte dem Falschen.
   */
  it("markiert den alten Code als ersetzt und den neuen nicht", () => {
    einheit({ id: "rtw-1", name: "RTW 1" });
    const alt = stelleOrtCodeSicher(t.db, ortVon("rtw-1"), AUSSTELLER)!;

    const neu = setzeOrtCodeNeu(t.db, ortVon("rtw-1"), AUSSTELLER, alt)!;

    const zeilen = zeilenVon("rtw-1");
    expect(zeilen.find((z) => z.code === alt)!.ersetztAm).toBeInstanceOf(Date);
    expect(zeilen.find((z) => z.code === neu)!.ersetztAm).toBeNull();
  });

  /**
   * ⚠️ EIN CODE, DER NIE ERSETZT WURDE, TRAEGT NICHTS — auch nicht, nachdem
   * jemand ihn von Hand gesperrt hat. Sonst verlöre der Altbestand sein
   * Reaktivieren, sobald ihn jemand einmal versehentlich sperrt.
   */
  /**
   * DER WETTLAUF ZWEIER VERWALTENDER — gefunden in der Durchsicht.
   *
   * ⚠️ SQLite SERIALISIERT SAUBER, UND GENAU DAS WAR DAS PROBLEM: beide
   * Transaktionen liefen durch, nur sperrte die zweite den Code, den die erste
   * gerade erzeugt hatte. Die erste Oberflaeche zeigte danach eine Zahl, die
   * schon wieder verbrannt war — und die naechste gedruckte Karte fuehrte ins
   * Leere. Kein Tor sieht das: es gibt keinen Fehler, nur ein falsches
   * Ergebnis auf einem von zwei Schirmen.
   *
   * Nachgestellt wird der zweite Klick: er nennt den Code, den SEIN Schirm
   * zeigte — den inzwischen gesperrten.
   */
  it("lehnt ab, wenn der genannte Code nicht mehr der aktive ist", () => {
    einheit({ id: "rtw-1", name: "RTW 1" });
    const alt = stelleOrtCodeSicher(t.db, ortVon("rtw-1"), AUSSTELLER)!;
    const neu = setzeOrtCodeNeu(t.db, ortVon("rtw-1"), AUSSTELLER, alt)!;

    expect(() => setzeOrtCodeNeu(t.db, ortVon("rtw-1"), AUSSTELLER, alt))
      .toThrow(StandVeraltet);

    // ⚠️ UND NICHTS IST PASSIERT. Der Wurf steht INNERHALB der Transaktion,
    // sonst bliebe der neue Code gesperrt und der Ort ohne gueltigen Code.
    expect(aktiverOrtCode(t.db, "rtw-1")).toBe(neu);
    expect(zeilenVon("rtw-1")).toHaveLength(2);
  });

  it("markiert beim blossen Anlegen niemanden als ersetzt", () => {
    einheit({ id: "rtw-1", name: "RTW 1" });
    stelleOrtCodeSicher(t.db, ortVon("rtw-1"), AUSSTELLER);

    expect(zeilenVon("rtw-1").every((z) => z.ersetztAm === null)).toBe(true);
  });

  it("lässt sich mehrfach hintereinander anwenden", () => {
    const start = stelleOrtCodeSicher(t.db, ortVon(HANDLAGER_ID), AUSSTELLER)!;
    const erste = setzeOrtCodeNeu(t.db, ortVon(HANDLAGER_ID), AUSSTELLER, start)!;
    const zweite = setzeOrtCodeNeu(t.db, ortVon(HANDLAGER_ID), AUSSTELLER, erste);

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

    expect(setzeOrtCodeNeu(t.db, ortVon(HANDLAGER_ID), AUSSTELLER, alt)).toBeNull();

    expect(zeilenVon(HANDLAGER_ID)).toHaveLength(1);
    expect(aktiverOrtCode(t.db, HANDLAGER_ID)).toBe(alt);
    // Auch die Markierung ist zurückgerollt — sonst stünde ein gültiger,
    // aktiver Code als „ersetzt" da und wäre nie wieder zu reaktivieren.
    expect(zeilenVon(HANDLAGER_ID)[0]!.ersetztAm).toBeNull();
  });
});

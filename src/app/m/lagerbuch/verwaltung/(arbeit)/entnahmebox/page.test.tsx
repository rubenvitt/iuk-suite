import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { artikel, buchungen, chargen, lagerorte } from "../../../_db/schema";
import { migrierteTestDb, type TestDb } from "../../../_db/testdb";
import { ENTNAHMEBOX_ID } from "../../../_lib/konstanten";
import { ENTNAHMEBOX_PRAEFIX } from "../../../_lib/vorgang";
import { Kachel } from "../../../_ui/Kachel";
import { BoxAnsicht } from "./BoxAnsicht";
import { entnahmeboxInhalt } from "./page";

/**
 * DIE VERWALTUNGSSEITE DER ENTNAHMEBOX — DRK-314.
 *
 * Geprueft wird der RSC-BAUM, nicht gerendertes HTML: die Seite ist eine Server
 * Component, ihre Tabellen liegen in einer Client-Insel, und das Einzige, was
 * die Grenze ueberquert, sind die Props. Genau die sind hier der Pruefgegenstand
 * — ein `Date` oder eine Funktion darin waere HTTP 500 bzw. eine falsch
 * formatierte Zeit, und beides sieht weder `build` noch ein DOM-Test.
 */

/** Muster „Seite als RSC" (`inventur/verlauf/page.test.tsx`). */
function elementeVomTyp(wert: ReactNode, typ: unknown): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  return [
    ...(wert.type === typ ? [wert] : []),
    ...Object.values(wert.props as Record<string, ReactNode>)
      .flatMap((prop) => elementeVomTyp(prop, typ)),
  ];
}

function istRekursivJsonSicher(wert: unknown): boolean {
  if (wert === null || typeof wert === "string" || typeof wert === "boolean") return true;
  if (typeof wert === "number") return Number.isFinite(wert);
  if (Array.isArray(wert)) return wert.every(istRekursivJsonSicher);
  if (
    typeof wert !== "object"
    || wert instanceof Date
    || isValidElement(wert)
    || Object.getPrototypeOf(wert) !== Object.prototype
  ) return false;
  return Object.values(wert).every(istRekursivJsonSicher);
}

const QUELLE = readFileSync(
  "src/app/m/lagerbuch/verwaltung/(arbeit)/entnahmebox/page.tsx", "utf8",
);
const JETZT = new Date("2026-09-16T10:00:00Z");

let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-entnahmebox-seite-");
  t.db.insert(lagerorte).values({
    id: "fz-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-DRK-1",
    aktiv: true, einheitenart: "fahrzeug",
  }).run();
  t.db.insert(lagerorte).values({
    id: "fz-alt", name: "MTW alt", typ: "fahrzeug", aktiv: false, einheitenart: "fahrzeug",
  }).run();
  t.db.insert(artikel).values({
    id: "art-1", name: "Kühlkompresse", einheit: "Stk", fach: "A-01",
    mindestbestand: 1, aktiv: true, createdAt: JETZT, kategorie: null, bestelltAt: null,
  }).run();
  t.db.insert(chargen).values({
    id: "ch-1", artikelId: "art-1", chargenNr: "L-100", verfall: "2030-01", createdAt: JETZT,
  }).run();
});

afterEach(() => t.schliessen());

function buchen(id: string, ort: string, menge: number, referenz: string | null = null) {
  t.db.insert(buchungen).values({
    id, ts: JETZT, typ: "umlagerung", artikelId: "art-1", chargeId: "ch-1",
    lagerortId: ort, menge, quelleTyp: "system", quelleId: "seed",
    referenz, kommentar: null,
  }).run();
}

function ansicht(von?: string) {
  const baum = entnahmeboxInhalt(t.db, von, JETZT);
  const treffer = elementeVomTyp(baum, BoxAnsicht);
  expect(treffer, "genau eine BoxAnsicht").toHaveLength(1);
  return treffer[0]!.props as Parameters<typeof BoxAnsicht>[0];
}

describe("entnahmeboxInhalt — der Inhalt", () => {
  it("zaehlt POSTEN und TEILE getrennt", () => {
    /*
     * ⚠️ ZWEI ZAHLEN, WEIL SIE VERSCHIEDENE FRAGEN BEANTWORTEN: „Posten" sind
     * Artikel mit Bestand und damit die Zahl der Entscheidungen beim
     * Einraeumen; „Teile" ist die Summe der Mengen. Fuenf Artikel zu je einem
     * Stueck sind fuenf Handgriffe, ein Artikel zu fuenfzig Stueck ist einer.
     */
    t.db.insert(artikel).values({
      id: "art-2", name: "Mullbinde", einheit: "Pkg.", fach: "A-02",
      mindestbestand: 1, aktiv: true, createdAt: JETZT, kategorie: null, bestelltAt: null,
    }).run();
    t.db.insert(chargen).values({
      id: "ch-2", artikelId: "art-2", chargenNr: "L-200", verfall: "2030-01", createdAt: JETZT,
    }).run();
    buchen("b-1", ENTNAHMEBOX_ID, 4);
    t.db.insert(buchungen).values({
      id: "b-2", ts: JETZT, typ: "umlagerung", artikelId: "art-2", chargeId: "ch-2",
      lagerortId: ENTNAHMEBOX_ID, menge: 1, quelleTyp: "system", quelleId: "seed",
      referenz: null, kommentar: null,
    }).run();

    const kacheln = elementeVomTyp(entnahmeboxInhalt(t.db, undefined, JETZT), Kachel)
      .map((k) => k.props as { zahl: number; beschriftung: string });
    expect(kacheln).toEqual([
      { zahl: 2, beschriftung: "Artikel in der Box" },
      { zahl: 5, beschriftung: "Teile insgesamt" },
    ]);
  });

  it("reicht den Boxinhalt an die Insel weiter", () => {
    buchen("b-1", ENTNAHMEBOX_ID, 3);
    const props = ansicht();
    expect(props.inhalt.map((p) => [p.artikelName, p.menge])).toEqual([["Kühlkompresse", 3]]);
  });

  it("bietet die Abgabe an, solange die Box aufnimmt", () => {
    expect(ansicht().nimmtAuf).toBe(true);
  });
});

describe("entnahmeboxInhalt — erst waehlen, dann laden", () => {
  it("laedt OHNE `?von=` keinen Bestand einer Einheit in den Payload", () => {
    // Bei zehn Einheiten waere die Matrix aller Bestaende das Zehnfache dessen,
    // was die Seite zeigt.
    buchen("b-1", "fz-1", 9);
    expect(ansicht().quellPosten).toEqual([]);
  });

  it("laedt MIT `?von=` genau diese eine Einheit", () => {
    buchen("b-1", "fz-1", 9);
    const props = ansicht("fz-1");
    expect(props.gewaehltId).toBe("fz-1");
    expect(props.quellPosten.map((p) => [p.artikelId, p.menge])).toEqual([["art-1", 9]]);
  });

  it("faellt bei einer unbekannten Id still auf „nichts gewaehlt“ zurueck", () => {
    expect(ansicht("gibt-es-nicht").gewaehltId).toBe("");
    expect(ansicht("gibt-es-nicht").quellPosten).toEqual([]);
  });

  it("bietet AUCH stillgelegte Einheiten an — die raeumt man aus", () => {
    // ⚠️ DER UNTERSCHIED ZUM HELFERSCHIRM, und er ist gewollt: dort sucht
    // niemand eine ausserdienstliche Einheit, hier ist das Ausraeumen der
    // Anlass. Dieselbe Festlegung wie beim Aussondern.
    const props = ansicht();
    expect(props.einheiten.map((e) => [e.id, e.aktiv]))
      .toEqual([["fz-1", true], ["fz-alt", false]]);
  });
});

describe("entnahmeboxInhalt — die Zugaenge", () => {
  it("formatiert den Zeitpunkt SERVERSEITIG und reicht eine Zeichenkette weiter", () => {
    /*
     * ⚠️ EIN `Date` UEBERQUERT DIE RSC-GRENZE KLAGLOS und formatiert danach in
     * der Zone des GERAETS — ohne dass ein Tor etwas meldet. Dieselbe Zusage,
     * die `verwaltung/fahrzeuge` seit DRK-298 traegt.
     */
    buchen("ab", "fz-1", -2, `${ENTNAHMEBOX_PRAEFIX}fz-1`);
    buchen("zu", ENTNAHMEBOX_ID, 2, `${ENTNAHMEBOX_PRAEFIX}fz-1`);

    const props = ansicht();
    expect(props.zugaenge).toHaveLength(1);
    expect(typeof props.zugaenge[0]!.zeit).toBe("string");
    expect(props.zugaenge[0]!.herkunft).toBe("RTW 1 · Fahrzeug · MS-DRK-1");
  });

  it("gibt der Insel AUSSCHLIESSLICH JSON-sichere Werte", () => {
    buchen("zu", ENTNAHMEBOX_ID, 2, `${ENTNAHMEBOX_PRAEFIX}fz-1`);
    const props = ansicht("fz-1");
    for (const [name, wert] of Object.entries(props)) {
      expect(istRekursivJsonSicher(wert), `prop ${name}`).toBe(true);
    }
  });
});

describe("entnahmeboxInhalt — wenn die Box stillgelegt ist", () => {
  beforeEach(() => {
    t.sqlite.prepare("update lagerorte set aktiv = 0 where id = ?").run(ENTNAHMEBOX_ID);
  });

  it("nimmt der Insel die Abgabe weg, statt sie ins Leere laufen zu lassen", () => {
    /*
     * ⚠️ DER BEFUND AUS DER CODEX-REVIEW ZU PR #175: die Seite sagte, die Box
     * nehme nichts mehr auf, und zeigte das Formular trotzdem bedienbar
     * daneben. Der ganze Weg — Einheit wählen, Artikel wählen, Menge tippen,
     * klicken — endete dann in der serverseitigen Ablehnung.
     */
    expect(ansicht().nimmtAuf).toBe(false);
  });

  it("zeigt den INHALT weiter — ausräumen soll man die Kiste ja", () => {
    buchen("b-1", ENTNAHMEBOX_ID, 3);
    const props = ansicht();
    expect(props.inhalt.map((p) => p.menge)).toEqual([3]);
  });

  it("lädt den Bestand der gewählten Einheit erst gar nicht", () => {
    // Arbeit für eine Fläche, die nicht rendert — und der Payload trüge sie mit.
    buchen("b-1", "fz-1", 9);
    expect(ansicht("fz-1").quellPosten).toEqual([]);
  });
});

describe("entnahmeboxInhalt — wenn es die Box nicht gibt", () => {
  it("sagt es, statt eine leere Liste zu zeigen", () => {
    // „gibt es nicht" und „ist leer" sind zwei Aussagen, und nur die erste
    // verlangt, dass jemand etwas einrichtet.
    t.db.delete(lagerorte).where(eq(lagerorte.id, ENTNAHMEBOX_ID)).run();
    const baum = entnahmeboxInhalt(t.db, undefined, JETZT);
    expect(elementeVomTyp(baum, BoxAnsicht)).toHaveLength(0);
  });
});

describe("entnahmeboxInhalt — die Bauform der Server Component", () => {
  it("greift auf kein antd-Compound zu (Falle 1)", () => {
    // `Typography.Title`, `Form.Item`, `Descriptions.Item` … ergaeben HTTP 500
    // fuer die ganze Seite, und weder `build` noch Vitest sehen es.
    const ohneKommentare = QUELLE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(ohneKommentare)
      .not.toMatch(/\b(Typography|Form|Descriptions|List|Input|Space|Menu|Card)\.[A-Z]/);
  });

  it("importiert kein Icon-Paket (Falle 7)", () => {
    expect(QUELLE).not.toMatch(/from\s+"@ant-design\/icons/);
  });

  it("definiert keine Spalte und kein `render` (Falle 9)", () => {
    const ohneKommentare = QUELLE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(ohneKommentare).not.toMatch(/\brender\s*:/);
    expect(ohneKommentare).not.toMatch(/\bcolumns\s*[:=]/);
  });

  it("ist `force-dynamic` — der Bestand darf nicht aus einem Cache kommen", async () => {
    const modul = await import("./page");
    expect(modul.dynamic).toBe("force-dynamic");
  });
});

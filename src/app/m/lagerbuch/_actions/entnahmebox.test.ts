import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, buchungen, chargen, lagerorte } from "../_db/schema";
import { ENTNAHMEBOX_ID, ENTNAHMEBOX_KOMMENTAR } from "../_lib/konstanten";
import { ENTNAHMEBOX_PRAEFIX } from "../_lib/vorgang";

/**
 * DIE ABGABE IN DIE ENTNAHMEBOX — DRK-314.
 *
 * ⚠️ GEGEN EINE ECHTE, MIGRIERTE SQLITE. Das ist hier nicht Gruendlichkeit,
 * sondern die einzige Stelle, an der die tragende Zusage ueberhaupt PRUEFBAR
 * ist: „der Abgang in der Einheit und der Zugang in der Box bilden denselben
 * Vorgang ab" (Akzeptanzkriterium 3) ist eine Aussage ueber ZWEI Zeilen mit
 * DERSELBEN Referenz und DERSELBEN Charge — ein Mock der Schreibpfade
 * behauptete sie, statt sie zu messen.
 *
 * ⚠️ UND MIT DER MIGRATION, nicht mit einer von Hand angelegten Box-Zeile. Dass
 * `0011_entnahmebox.sql` ueberhaupt laeuft und die Zeile mit `typ = 'lager'` und
 * `parent_id IS NULL` anlegt, ist selbst Teil der Zusage: haengt sie eines Tages
 * unter dem Handlager, zaehlt ihr Inhalt still als Handlagerbestand.
 */

const { helferRiegel, revalidiert } = vi.hoisted(() => ({
  helferRiegel: vi.fn<() => Promise<unknown>>(),
  revalidiert: [] as string[],
}));

vi.mock("next/cache", () => ({
  revalidatePath: (pfad: string) => { revalidiert.push(pfad); },
}));

vi.mock("../_lib/helferZugang", () => ({
  requireHelferSchreibend: () => helferRiegel(),
}));

vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test — jeder Aufruf uebergibt t.db"); },
}));

import { bucheInEntnahmebox } from "./entnahmebox";

const JETZT = new Date("2026-09-16T10:00:00Z");

/** Der Kaertchen-Weg: `quelleTyp: "token"`, `quelleId` ist der CODE im Klartext. */
const KAERTCHEN = {
  ok: true as const,
  zugang: {
    herkunft: "token" as const,
    tokenId: "tk-1",
    code: "123-456",
    label: "RTW 1",
    laeuftAb: new Date("2026-09-16T22:00:00Z"),
    fahrzeugBindung: null,
  },
};

/** Der Konto-Weg: `quelleTyp: "oidc"`, `quelleId` ist der `sub`. */
const KONTO = {
  ok: true as const,
  zugang: {
    herkunft: "konto" as const,
    sub: "u-admin",
    name: "A. Verwaltung",
    laeuftAb: null,
    fahrzeugBindung: null,
  },
};

let t: TestDb;

beforeEach(() => {
  revalidiert.length = 0;
  helferRiegel.mockResolvedValue(KAERTCHEN);
  t = migrierteTestDb("lagerbuch-actions-entnahmebox-");

  t.db.insert(lagerorte).values({
    id: "fz-1", name: "RTW 1", typ: "fahrzeug", aktiv: true, einheitenart: "fahrzeug",
  }).run();
  t.db.insert(lagerorte).values({
    id: "ta-1", name: "Rucksack Betreuung", typ: "fahrzeug", aktiv: true, einheitenart: "tasche",
  }).run();
  t.db.insert(artikel).values({
    id: "art-1", name: "Kühlkompresse", einheit: "Stk", fach: "A-01",
    mindestbestand: 1, aktiv: true, createdAt: JETZT, kategorie: null, bestelltAt: null,
  }).run();
  t.db.insert(artikel).values({
    id: "art-2", name: "Mullbinde", einheit: "Pkg.", fach: "A-02",
    mindestbestand: 1, aktiv: true, createdAt: JETZT, kategorie: null, bestelltAt: null,
  }).run();
});

function charge(id: string, verfall: string, artikelId = "art-1") {
  t.db.insert(chargen).values({
    id, artikelId, chargenNr: id, verfall, createdAt: JETZT,
  }).run();
}

function buchen(id: string, chargeId: string, menge: number, ort = "fz-1", artikelId = "art-1") {
  t.db.insert(buchungen).values({
    id, ts: JETZT, typ: "zugang", artikelId, chargeId,
    lagerortId: ort, menge, quelleTyp: "system", quelleId: "seed",
    referenz: null, kommentar: null,
  }).run();
}

/** Bestand je (Ort, Charge) ueber ALLE Buchungen. */
function bestand(ort: string, chargeId: string): number {
  return t.db.select().from(buchungen).all()
    .filter((b) => b.lagerortId === ort && b.chargeId === chargeId)
    .reduce((s, b) => s + b.menge, 0);
}

function neueZeilen() {
  return t.db.select().from(buchungen).all().filter((b) => b.quelleId !== "seed");
}

describe("bucheInEntnahmebox — die Umbuchung", () => {
  it("bildet Abgang und Zugang als EIN Vorgang ab: zwei Legs, eine Referenz, eine Charge", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 10);

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 4 },
      t.db,
    );

    expect(erg).toEqual({ ok: true, wert: { gebucht: 4 } });

    const zeilen = neueZeilen();
    expect(zeilen).toHaveLength(2);

    // ⚠️ NETTO NULL — die Invariante jeder Umlagerung (I3). Waere sie verletzt,
    // entstuende oder verschwaende Bestand, und die Summe aller Buchungen des
    // Artikels waere nicht mehr gleich.
    expect(zeilen.reduce((s, b) => s + b.menge, 0)).toBe(0);

    const ab = zeilen.find((b) => b.lagerortId === "fz-1")!;
    const zu = zeilen.find((b) => b.lagerortId === ENTNAHMEBOX_ID)!;
    expect(ab.menge).toBe(-4);
    expect(zu.menge).toBe(4);

    // BEIDE Legs tragen `umlagerung` — nicht zugang/entnahme. Sonst laese der
    // Bestellvorschlag die Abgabe als Verbrauch und der Wareneingangsbericht
    // den Zugang als Lieferung.
    expect(ab.typ).toBe("umlagerung");
    expect(zu.typ).toBe("umlagerung");

    // DIE KLAMMER: dieselbe Referenz, und sie nennt die QUELLE.
    expect(ab.referenz).toBe(`${ENTNAHMEBOX_PRAEFIX}fz-1`);
    expect(zu.referenz).toBe(ab.referenz);

    // DIE VERFALL-PROVENIENZ WANDERT MIT: gleiche Charge auf beiden Seiten.
    expect(ab.chargeId).toBe("ch-1");
    expect(zu.chargeId).toBe("ch-1");

    // Der Kommentar ist festgenagelt und steht damit in der Journalspalte.
    expect(zu.kommentar).toBe(ENTNAHMEBOX_KOMMENTAR);

    expect(bestand("fz-1", "ch-1")).toBe(6);
    expect(bestand(ENTNAHMEBOX_ID, "ch-1")).toBe(4);
  });

  it("nimmt ohne Chargenangabe die zuerst ablaufende (FEFO)", async () => {
    charge("ch-alt", "2027-01");
    charge("ch-neu", "2030-01");
    buchen("seed-alt", "ch-alt", 2);
    buchen("seed-neu", "ch-neu", 8);

    await bucheInEntnahmebox({ fahrzeugId: "fz-1", artikelId: "art-1", menge: 3 }, t.db);

    // Zwei aus der alten, eine aus der jungen — und in der Box dieselbe
    // Verteilung, nicht drei Stueck auf einer geratenen Charge.
    expect(bestand(ENTNAHMEBOX_ID, "ch-alt")).toBe(2);
    expect(bestand(ENTNAHMEBOX_ID, "ch-neu")).toBe(1);
    expect(bestand("fz-1", "ch-alt")).toBe(0);
    expect(bestand("fz-1", "ch-neu")).toBe(7);
  });

  it("bucht MIT Chargenangabe genau diese — auch wenn eine aeltere daneben liegt", async () => {
    // ⚠️ DER FALL, DEN FEFO FALSCH MACHEN WUERDE. Wer die Packung in der Hand
    // haelt, traegt DIESE in die Kiste; FEFO ist eine ENTNAHME-Regel und gilt
    // beim Umraeumen nicht (`_lib/schreibpfade/umlagerung.ts`). Der Fehler waere
    // STILL: netto bleibt null, der Fahrzeugbestand stimmt, und trotzdem
    // stuende in der Box eine andere Charge als die, die physisch gewandert ist.
    charge("ch-alt", "2027-01");
    charge("ch-neu", "2030-01");
    buchen("seed-alt", "ch-alt", 5);
    buchen("seed-neu", "ch-neu", 5);

    await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 2, chargeId: "ch-neu" },
      t.db,
    );

    expect(bestand(ENTNAHMEBOX_ID, "ch-neu")).toBe(2);
    expect(bestand(ENTNAHMEBOX_ID, "ch-alt")).toBe(0);
    expect(bestand("fz-1", "ch-alt")).toBe(5);
  });

  it("nimmt auch aus einer Tasche", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 3, "ta-1");

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "ta-1", artikelId: "art-1", menge: 3 },
      t.db,
    );

    expect(erg.ok).toBe(true);
    expect(bestand("ta-1", "ch-1")).toBe(0);
    expect(bestand(ENTNAHMEBOX_ID, "ch-1")).toBe(3);
  });
});

describe("bucheInEntnahmebox — die Quelle der Buchung", () => {
  it("schreibt beim Kaertchen den CODE mit quelleTyp token", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    await bucheInEntnahmebox({ fahrzeugId: "fz-1", artikelId: "art-1", menge: 1 }, t.db);

    for (const b of neueZeilen()) {
      expect(b.quelleTyp).toBe("token");
      // ⚠️ DER CODE IM KLARTEXT, NICHT DIE TOKEN-ID. Ein umkodierter Code macht
      // das gesamte historische Journal namenlos (`_db/quelle.ts`).
      expect(b.quelleId).toBe("123-456");
    }
  });

  it("schreibt beim angemeldeten Konto den sub mit quelleTyp oidc", async () => {
    helferRiegel.mockResolvedValue(KONTO);
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    await bucheInEntnahmebox({ fahrzeugId: "fz-1", artikelId: "art-1", menge: 1 }, t.db);

    for (const b of neueZeilen()) {
      expect(b.quelleTyp).toBe("oidc");
      expect(b.quelleId).toBe("u-admin");
    }
  });
});

describe("bucheInEntnahmebox — was sie ablehnt", () => {
  it("weist den gesperrten Zugang ab, BEVOR sie etwas liest", async () => {
    helferRiegel.mockResolvedValue({ ok: false, grund: "gesperrt", nochAngemeldet: false });

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 1 },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(erg.ok === false && erg.grund).toBe("gesperrt");
    expect(neueZeilen()).toHaveLength(0);
  });

  it("bucht NICHTS, wenn die Menge nicht gedeckt ist — statt still zu kappen", async () => {
    /*
     * ⚠️ DER UNTERSCHIED ZUR ENTNAHME, UND ER IST FACHLICH. `fefoAbbuchung`
     * kappt still an der Verfuegbarkeit; fuer eine Entnahme ist das richtig
     * (was nicht da ist, kann man nicht nehmen). Hier behauptete es etwas ueber
     * die WIRKLICHKEIT: die Person hat fuenf Teile in die Kiste gelegt, gebucht
     * waeren drei, und die uebrigen zwei stuenden weiter auf dem Fahrzeug — der
     * Buchstand waere an BEIDEN Orten falsch, und niemand bekaeme es gesagt.
     */
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 3);

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 5 },
      t.db,
    );

    expect(erg.ok).toBe(false);
    // Die Meldung nennt die Zahl UND die Einheit des Artikels — kein erfundenes
    // „Stück", das Modul fuehrt die Einheit als freien Text.
    expect(erg.ok === false && erg.text).toContain("nur 3 Stk");
    expect(erg.ok === false && erg.text).toContain("aus diesem Fahrzeug");
    expect(neueZeilen()).toHaveLength(0);
    expect(bestand("fz-1", "ch-1")).toBe(3);
  });

  it("prueft die Deckung je CHARGE, nicht nur je Artikel", async () => {
    charge("ch-alt", "2027-01");
    charge("ch-neu", "2030-01");
    buchen("seed-alt", "ch-alt", 8);
    buchen("seed-neu", "ch-neu", 1);

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 3, chargeId: "ch-neu" },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(erg.ok === false && erg.text).toContain("Von dieser Charge");
    expect(neueZeilen()).toHaveLength(0);
  });

  it("lehnt eine Charge ab, die einem anderen Artikel gehoert (I5)", async () => {
    // Ohne diese Probe buchte eine manipulierte Anfrage gegen den Bestand eines
    // ANDEREN Artikels — die Deckungspruefung allein faengt das nicht: sie
    // fragte nach dem Rest dieser Charge unter `artikelId`, und der ist 0,
    // waere also nur zufaellig dieselbe Ablehnung.
    charge("ch-fremd", "2030-01", "art-2");
    buchen("seed-fremd", "ch-fremd", 9, "fz-1", "art-2");

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 1, chargeId: "ch-fremd" },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(erg.ok === false && erg.text).toContain("gehört nicht zu diesem Artikel");
    expect(neueZeilen()).toHaveLength(0);
  });

  it("nimmt NICHT aus dem Handlager — die Box ist kein Umweg um die Entnahme", async () => {
    /*
     * ⚠️ OHNE DIESE PROBE ENTSCHIEDE DER FREMDSCHLUESSEL, und der laesst JEDEN
     * Lagerort klaglos durch: 'handlager' ist eine gueltige `lagerorte.id`. Eine
     * selbst gebaute Anfrage koennte damit Handlagerbestand in die Kiste
     * schieben, ohne dass eine Entnahme im Journal stuende.
     */
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5, "handlager");

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "handlager", artikelId: "art-1", menge: 1 },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(erg.ok === false && erg.text).toContain("Fahrzeug oder einer Tasche");
    expect(neueZeilen()).toHaveLength(0);
  });

  it("nimmt NICHT aus der Box selbst — der Rueckweg ist DRK-313, nicht dieser", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5, ENTNAHMEBOX_ID);

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: ENTNAHMEBOX_ID, artikelId: "art-1", menge: 1 },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(neueZeilen()).toHaveLength(0);
  });

  it("bucht nichts in eine STILLGELEGTE Box", async () => {
    t.db.update(lagerorte).set({ aktiv: false })
      .where(eq(lagerorte.id, ENTNAHMEBOX_ID)).run();
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 1 },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(erg.ok === false && erg.text).toContain("stillgelegt");
    expect(neueZeilen()).toHaveLength(0);
  });

  it("nimmt MIT KONTO aus einer stillgelegten Einheit — genau die raeumt man aus", async () => {
    /*
     * ⚠️ DAS ZIEL MUSS AUFNAHMEBEREIT SEIN, DIE QUELLE NICHT — die
     * Gegenrichtung zur Zeile darueber. Eine ausserdienstliche Einheit ist
     * genau die, die man leerraeumt.
     */
    helferRiegel.mockResolvedValue(KONTO);
    t.db.update(lagerorte).set({ aktiv: false }).where(eq(lagerorte.id, "fz-1")).run();
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 5 },
      t.db,
    );

    expect(erg.ok).toBe(true);
    expect(bestand(ENTNAHMEBOX_ID, "ch-1")).toBe(5);
  });

  it("weist dieselbe Einheit beim KAERTCHEN ab — Ausraeumen ist Verwaltungssache", async () => {
    /*
     * ⚠️ DER UNTERSCHIED IST DIE HERKUNFT, NICHT DIE EINHEIT (Codex-Review zu
     * PR #175). Die Helferflaeche bietet stillgelegte Einheiten gar nicht an —
     * das stand bis hierher aber NUR in der Auswahlliste, und eine Server
     * Action ist ein eigener Einstiegspunkt. Der Test baut genau die Anfrage,
     * die keine Oberflaeche stellt.
     *
     * ⚠️ UND ES WIRD NICHTS GEBUCHT, nicht nur abgewiesen: eine halb
     * ausgefuehrte Ablehnung waere der teuerste Ausgang, weil das Journal
     * append-only ist.
     */
    t.db.update(lagerorte).set({ aktiv: false }).where(eq(lagerorte.id, "fz-1")).run();
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 5 },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect((erg as { ok: false; text: string }).text).toContain("außer Dienst");
    expect(bestand(ENTNAHMEBOX_ID, "ch-1"), "nichts gebucht").toBe(0);
    expect(bestand("fz-1", "ch-1"), "und die Einheit unveraendert").toBe(5);
  });

  it("laesst eine AKTIVE Einheit beim Kaertchen unveraendert durch", async () => {
    // Die Gegenprobe: der neue Riegel darf den gewoehnlichen Weg nicht treffen.
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    const erg = await bucheInEntnahmebox(
      { fahrzeugId: "fz-1", artikelId: "art-1", menge: 5 },
      t.db,
    );

    expect(erg.ok).toBe(true);
  });

  it("weist eine Menge von 0 oder weniger am Eingangsvalidator ab", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    for (const menge of [0, -3]) {
      const erg = await bucheInEntnahmebox(
        { fahrzeugId: "fz-1", artikelId: "art-1", menge },
        t.db,
      );
      expect(erg.ok, `Menge ${menge}`).toBe(false);
      expect(erg.ok === false && erg.grund).toBe("eingabe");
    }
    expect(neueZeilen()).toHaveLength(0);
  });
});

describe("bucheInEntnahmebox — die Box als Lagerort", () => {
  it("legt die Migration NEBEN dem Handlager an, nicht darunter", () => {
    /*
     * ⚠️ DIE TRAGENDE EIGENSCHAFT DES GANZEN TICKETS, und sie ist eine Zeile in
     * `lagerorte`. Haengt die Box unter dem Handlager, zaehlt ihr Inhalt ueber
     * `handlagerOrte()` sofort als Handlagerbestand — im Bestellvorschlag, in
     * der Verfallsliste, in der FEFO-Verteilung jeder Entnahme am Regal.
     * `typecheck`, `lint` und `build` saehen davon nichts.
     */
    const box = t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, ENTNAHMEBOX_ID)).get()!;
    expect(box.parentId).toBeNull();
    expect(box.typ).toBe("lager");
    // Und sie ist KEIN Traeger: keine Art, kein Soll, kein Check.
    expect(box.einheitenart).toBeNull();
    expect(box.aktiv).toBe(true);
  });

  it("frischt die beiden Flaechen und das Einheitenblatt auf", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    await bucheInEntnahmebox({ fahrzeugId: "fz-1", artikelId: "art-1", menge: 1 }, t.db);

    expect(revalidiert).toContain("/m/lagerbuch/verwaltung/entnahmebox");
    expect(revalidiert).toContain("/m/lagerbuch/helfer/box");
    // MIT der Id: der Pfad des Einheitenblatts traegt sie, ein Pfad ohne sie
    // traefe die Seite nicht.
    expect(revalidiert).toContain("/m/lagerbuch/verwaltung/fahrzeuge/fz-1");
  });
});

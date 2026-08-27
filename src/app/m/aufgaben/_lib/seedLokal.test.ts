import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestDb } from "../_db/testdb";
import { migrierteTestDb } from "../_db/testdb";
import { personen, aufgaben, routinen, verlauf, STATUS_WERTE } from "../_db/schema";
import { isoTag, montagDerWoche, wochenTage } from "./datum";
import { istUeberfaellig } from "./anzeige";
import { seedLokalAufgaben } from "./seedLokal";

let t: TestDb;
beforeEach(() => {
  t = migrierteTestDb();
});
afterEach(() => {
  t.schliessen();
  vi.useRealTimers();
});

function zaehlen() {
  return {
    personen: t.db.select().from(personen).all().length,
    aufgaben: t.db.select().from(aufgaben).all().length,
    routinen: t.db.select().from(routinen).all().length,
    verlauf: t.db.select().from(verlauf).all().length,
  };
}

describe("seedLokalAufgaben — idempotent", () => {
  it("zweimal laufen lassen ergibt dieselben Zaehlstaende wie einmal", async () => {
    await seedLokalAufgaben(t.db);
    const nachErstemLauf = zaehlen();
    await seedLokalAufgaben(t.db);
    const nachZweitemLauf = zaehlen();
    expect(nachZweitemLauf).toEqual(nachErstemLauf);
    // Nicht triviale Nullpruefung: es muss tatsaechlich etwas angelegt worden sein.
    expect(nachErstemLauf.aufgaben).toBeGreaterThan(0);
    expect(nachErstemLauf.routinen).toBeGreaterThan(0);
    expect(nachErstemLauf.verlauf).toBeGreaterThan(0);
  });
});

describe("seedLokalAufgaben — rein additiv", () => {
  it("eine vorher von Hand angelegte Person mit demselben sub wird nicht ueberschrieben", async () => {
    t.db
      .insert(personen)
      .values({
        sub: "dev:rike@localtest.me",
        name: "Handangelegt",
        initialen: "HA",
        rolle: "bufdi",
        aktivVon: "2020-01-01",
      })
      .run();
    await seedLokalAufgaben(t.db);
    const rike = t.db
      .select()
      .from(personen)
      .all()
      .find((p) => p.sub === "dev:rike@localtest.me");
    expect(rike?.name).toBe("Handangelegt");
    expect(rike?.rolle).toBe("bufdi");
  });

  /*
   * KOLLIDIERENDER TITEL, nicht ein beliebiger: eine handangelegte Aufgabe, die mit KEINEM
   * Demo-Titel uebereinstimmt, belegt nur, dass der Seed nichts LOESCHT — den
   * Ueberspringen-Zweig (Titel schon vorhanden → keine zweite Zeile, die vorhandene bleibt
   * unveraendert) trifft sie nie. Der Personen-Test darueber macht es mit `dev:rike@localtest.me`
   * schon richtig; hier derselbe Trick mit einem der neun Demo-Titel.
   */
  it("eine vorher von Hand angelegte Aufgabe mit demselben Titel wie eine Demo-Aufgabe bleibt unangetastet", async () => {
    const ersteller = t.db
      .insert(personen)
      .values({ sub: "x", name: "X", initialen: "XX", rolle: "auftrag", aktivVon: "2026-01-01" })
      .returning()
      .get();
    t.db
      .insert(aufgaben)
      .values({
        titel: "Verbandskästen im Fahrzeugpark prüfen",
        beschreibung: "Handangelegt.",
        prioritaet: "mittel",
        erstellerId: ersteller.id,
        status: "eingegangen",
        faelligAm: "2026-08-20",
        dauerMinuten: 30,
      })
      .run();
    await seedLokalAufgaben(t.db);
    const treffer = t.db
      .select()
      .from(aufgaben)
      .all()
      .filter((a) => a.titel === "Verbandskästen im Fahrzeugpark prüfen");
    expect(treffer).toHaveLength(1);
    expect(treffer[0].beschreibung).toBe("Handangelegt.");
  });
});

describe("seedLokalAufgaben — die Zusagen sind wirklich erfuellt", () => {
  it("jeder der sechs Zustaende kommt vor", async () => {
    await seedLokalAufgaben(t.db);
    const alle = t.db.select().from(aufgaben).all();
    for (const status of STATUS_WERTE) {
      expect(alle.some((a) => a.status === status), status).toBe(true);
    }
  });

  it("es gibt eine Aufgabe mit offenem Zeitvorschlag", async () => {
    await seedLokalAufgaben(t.db);
    const alle = t.db.select().from(aufgaben).all();
    expect(
      alle.some(
        (a) => a.status === "verteilt" && a.planDatum === null && a.vorschlagDatum !== null,
      ),
    ).toBe(true);
  });

  it("es gibt eine ueberfaellige Aufgabe", async () => {
    await seedLokalAufgaben(t.db);
    const heute = isoTag(new Date());
    const alle = t.db.select().from(aufgaben).all();
    expect(alle.some((a) => istUeberfaellig(a, heute))).toBe(true);
  });

  it("es gibt eine Selbstaufgabe (istSelbst, kein Pruefer, Ersteller = Zugewiesener)", async () => {
    await seedLokalAufgaben(t.db);
    const alle = t.db.select().from(aufgaben).all();
    expect(
      alle.some(
        (a) => a.istSelbst && a.prueferId === null && a.erstellerId === a.zugewiesenAn,
      ),
    ).toBe(true);
  });

  it("es gibt eine Aufgabe mit nachweisPflicht", async () => {
    await seedLokalAufgaben(t.db);
    const alle = t.db.select().from(aufgaben).all();
    expect(alle.some((a) => a.nachweisPflicht)).toBe(true);
  });

  it("es gibt eingeplante Aufgaben an mehreren Tagen bei mindestens zwei BuFDis, darunter ein ueberbuchter Tag", async () => {
    await seedLokalAufgaben(t.db);
    const alleAufgaben = t.db.select().from(aufgaben).all();
    const allePersonen = t.db.select().from(personen).all();
    const bufdiIds = new Set(allePersonen.filter((p) => p.rolle === "bufdi").map((p) => p.id));

    const geplante = alleAufgaben.filter(
      (a) => a.planDatum !== null && a.zugewiesenAn !== null && bufdiIds.has(a.zugewiesenAn),
    );

    /*
     * PRO PERSON GRUPPIEREN, nicht ueber alle hinweg: zwei Personen mit je genau EINEM,
     * aber verschiedenen Tag erfuellten eine ueber-alle-Personen-Zaehlung ebenfalls — das ist
     * genau der Zustand, den dieser Test nicht sehen darf. Die Zusage ist "mindestens zwei
     * BuFDis haben je Aufgaben an mindestens zwei verschiedenen Tagen".
     */
    const tageProPerson = new Map<string, Set<string>>();
    for (const a of geplante) {
      const menge = tageProPerson.get(a.zugewiesenAn as string) ?? new Set<string>();
      menge.add(a.planDatum as string);
      tageProPerson.set(a.zugewiesenAn as string, menge);
    }
    const personenMitMehrerenTagen = [...tageProPerson.values()].filter(
      (tage) => tage.size >= 2,
    );
    expect(personenMitMehrerenTagen.length).toBeGreaterThanOrEqual(2);

    const minutenProPersonUndTag = new Map<string, number>();
    for (const a of geplante) {
      const schluessel = `${a.zugewiesenAn}|${a.planDatum}`;
      minutenProPersonUndTag.set(
        schluessel,
        (minutenProPersonUndTag.get(schluessel) ?? 0) + a.dauerMinuten,
      );
    }
    const sollMinuten = new Map(allePersonen.map((p) => [p.id, p.sollMinutenTag]));
    const ueberbucht = [...minutenProPersonUndTag.entries()].some(([schluessel, minuten]) => {
      const [personId] = schluessel.split("|");
      return minuten > (sollMinuten.get(personId as string) ?? Infinity);
    });
    expect(ueberbucht).toBe(true);
  });

  it("es gibt Routinen bei mindestens zwei BuFDis mit unterschiedlichen Wochentagsmasken", async () => {
    await seedLokalAufgaben(t.db);
    const alleRoutinen = t.db.select().from(routinen).all();
    const personenMitRoutine = new Set(alleRoutinen.map((r) => r.personId));
    expect(personenMitRoutine.size).toBeGreaterThanOrEqual(2);
    const masken = new Set(alleRoutinen.map((r) => r.wochentage));
    expect(masken.size).toBeGreaterThanOrEqual(2);
  });

  it("jede Aufgabe hat mindestens eine Verlaufszeile", async () => {
    await seedLokalAufgaben(t.db);
    const alleAufgaben = t.db.select().from(aufgaben).all();
    const alleVerlauf = t.db.select().from(verlauf).all();
    const aufgabenMitVerlauf = new Set(alleVerlauf.map((v) => v.aufgabeId));
    for (const a of alleAufgaben) {
      expect(aufgabenMitVerlauf.has(a.id), a.titel).toBe(true);
    }
  });
});

describe("seedLokalAufgaben — relativ statt fest", () => {
  it("erzeugt bei zwei verschiedenen 'heute' verschiedene Plandaten", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T10:00:00Z"));
    await seedLokalAufgaben(t.db);
    const planDatenLauf1 = new Set(
      t.db
        .select()
        .from(aufgaben)
        .all()
        .map((a) => a.planDatum)
        .filter((d): d is string => d !== null),
    );

    const t2 = migrierteTestDb();
    try {
      vi.setSystemTime(new Date("2026-09-24T10:00:00Z")); // sechs Wochen spaeter
      await seedLokalAufgaben(t2.db);
      const planDatenLauf2 = new Set(
        t2.db
          .select()
          .from(aufgaben)
          .all()
          .map((a) => a.planDatum)
          .filter((d): d is string => d !== null),
      );
      const ueberschneidung = [...planDatenLauf1].filter((d) => planDatenLauf2.has(d));
      expect(ueberschneidung).toHaveLength(0);
    } finally {
      t2.schliessen();
    }
  });
});

/*
 * DER WOCHENTAG IST EINE EINGABE DES SEEDS, ALSO WIRD ER GESETZT UND NICHT ABGEWARTET.
 *
 * GEMESSEN (2026-08-27, Donnerstag): `e2e/aufgaben.spec.ts:1048` und `:1594` waren rot, weil die
 * Ueberfaellig-Fixtur ihr `planDatum` auf `tagePlus(heute, -3)` trug — OHNE expliziten `planRang`,
 * also auf dem Schema-Vorgabewert 0. `heute - 3` ist der Wochenmontag GENAU DANN, wenn heute
 * Donnerstag ist; dann trug Bendix' Montag DREI Eintraege statt zwei, zwei davon auf Rang 0, und
 * der Hoch-Knopf des zweiten Eintrags war `disabled`.
 *
 * ⛔ UND EIN ZWEITER, UNABHAENGIGER TAG: an einem FREITAG ist `heute - 3` der Wochendienstag, wo
 * Bendix' „Eigene Fortbildung" ebenfalls auf dem Vorgabewert 0 liegt. Dieselbe Fehlerklasse, ein
 * anderer Tag — die Reparatur der Aufgabe 20 hatte sie fuer das Montags-PAAR geschlossen und beide
 * Faelle der Ueberfaellig-Fixtur uebersehen.
 *
 * ⛔ DIESER BLOCK LAEUFT DESHALB ALLE SIEBEN WOCHENTAGE AB. Ein Fall, der nur donnerstags rot
 * werden kann, ist am Freitag kein Beweis mehr. Die sieben Daten sind literal und decken Mo–So.
 */
const SIEBEN_WOCHENTAGE = [
  "2026-08-24", // Montag
  "2026-08-25", // Dienstag
  "2026-08-26", // Mittwoch
  "2026-08-27", // Donnerstag
  "2026-08-28", // Freitag
  "2026-08-29", // Samstag
  "2026-08-30", // Sonntag
];

const BENDIX_SUB = "dev:bendix@localtest.me";

interface Planzeile {
  titel: string;
  planDatum: string;
  planRang: number;
  zugewiesenAn: string;
}

/** Seedet eine frische Datenbank mit gesetzter Systemzeit und liest ihre Planzeilen aus. */
async function planzeilenAm(tag: string): Promise<Planzeile[]> {
  vi.setSystemTime(new Date(`${tag}T10:00:00Z`));
  const eigene = migrierteTestDb();
  try {
    await seedLokalAufgaben(eigene.db);
    const allePersonen = eigene.db.select().from(personen).all();
    const subVonId = new Map(allePersonen.map((p) => [p.id, p.sub]));
    return eigene.db
      .select()
      .from(aufgaben)
      .all()
      .filter((a) => a.planDatum !== null && a.zugewiesenAn !== null)
      .map((a) => ({
        titel: a.titel,
        planDatum: a.planDatum as string,
        planRang: a.planRang,
        zugewiesenAn: subVonId.get(a.zugewiesenAn as string) ?? "?",
      }));
  } finally {
    eigene.schliessen();
  }
}

describe("seedLokalAufgaben — kein Rangzusammenstoss, an KEINEM Wochentag", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it.each(SIEBEN_WOCHENTAGE)(
    "am %s traegt keine Person zwei Aufgaben desselben Tages auf demselben planRang",
    async (tag) => {
      const zeilen = await planzeilenAm(tag);
      const raengeProPersonUndTag = new Map<string, Planzeile[]>();
      for (const z of zeilen) {
        const schluessel = `${z.zugewiesenAn}|${z.planDatum}`;
        raengeProPersonUndTag.set(schluessel, [
          ...(raengeProPersonUndTag.get(schluessel) ?? []),
          z,
        ]);
      }
      for (const [schluessel, gruppe] of raengeProPersonUndTag) {
        const raenge = gruppe.map((z) => z.planRang);
        const beschreibung = gruppe
          .map((z) => `${z.titel} (Rang ${z.planRang})`)
          .join(" + ");
        expect(
          new Set(raenge).size,
          `Rangzusammenstoss bei ${schluessel}: ${beschreibung}`,
        ).toBe(raenge.length);
      }
      // Nicht triviale Nullpruefung: es muss ueberhaupt eine Person mit zwei Eintraegen an einem
      // Tag geben, sonst prueft die Schleife oben nichts.
      const mehrfachTage = [...raengeProPersonUndTag.values()].filter((g) => g.length >= 2);
      expect(mehrfachTage.length).toBeGreaterThan(0);
    },
  );

  /*
   * DIE ZUSAGE, DIE DIE ZWEI PLAYWRIGHT-FAELLE VERBRAUCHEN (`e2e/aufgaben.spec.ts:1048`, `:1594`):
   * Bendix' Montag traegt GENAU ZWEI Eintraege, in dieser Reihenfolge. Die Klausel oben allein
   * liesse einen dritten Eintrag mit Rang 2 durch — der waere zusammenstossfrei und braeche
   * `:1048` trotzdem, weil dort die ersten zwei Zeilen namentlich abgelesen werden.
   */
  it.each(SIEBEN_WOCHENTAGE)(
    "am %s traegt Bendix' Wochenmontag genau die zwei gestaffelten Materialtransport-Eintraege",
    async (tag) => {
      const zeilen = await planzeilenAm(tag);
      const montag = montagDerWoche(isoTag(new Date(`${tag}T10:00:00Z`)));
      const bendixMontag = zeilen
        .filter((z) => z.zugewiesenAn === BENDIX_SUB && z.planDatum === montag)
        .sort((a, b) => a.planRang - b.planRang);
      expect(
        bendixMontag.map((z) => `${z.planRang} ${z.titel}`),
        "Bendix' Wochenmontag",
      ).toEqual(["0 Materialtransport Kreisverband", "1 Nachbereitung Materialtransport"]);
    },
  );

  /*
   * DIE URSACHE DIREKT: die Ueberfaellig-Fixtur liegt VOR dem Wochenmontag, an jedem Wochentag.
   * `seedLokal.ts` sagt das im Kommentar zu, und die Spec baut darauf ihre Fusszeile „N Aufgaben
   * liegen ausserhalb dieser Woche" auf. Solange ihr Datum an `heute` haengt, ist beides an zwei
   * von sieben Tagen still falsch — auch dann, wenn sie zufaellig keinen Rang mehr trifft.
   */
  it.each(SIEBEN_WOCHENTAGE)(
    "am %s liegt jedes Plandatum von Bendix entweder im Wochengitter oder VOR dem Wochenmontag",
    async (tag) => {
      const zeilen = await planzeilenAm(tag);
      const heute = isoTag(new Date(`${tag}T10:00:00Z`));
      const montag = montagDerWoche(heute);
      const gitter = wochenTage(montag);
      const bendix = zeilen.filter((z) => z.zugewiesenAn === BENDIX_SUB);
      expect(bendix.length).toBeGreaterThanOrEqual(3);
      const imGitter = bendix.filter((z) => gitter.includes(z.planDatum));
      expect(
        imGitter.map((z) => z.planDatum).sort(),
        "Bendix im Wochengitter",
      ).toEqual([gitter[0], gitter[0], gitter[1]]);
      for (const z of bendix.filter((n) => !gitter.includes(n.planDatum))) {
        expect(z.planDatum < montag, `${z.titel} liegt nicht vor dem Wochenmontag`).toBe(true);
      }
    },
  );
});

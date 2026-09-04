import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import { migrateAllModules } from "@/core/bootstrap";

/*
 * ECHTE DATENBANK, GEMOCKTE SITZUNG (Vorbild uav/_actions/katalog.test.ts). Eine
 * gemockte `getDb()` bewiese ueber die PK (sub, zeichenId) und ueber
 * `onConflictDoNothing()` nichts — genau die beiden entscheiden hier, ob ein
 * zweites Merken eine zweite Zeile anlegt.
 *
 * `next/cache` muss gemockt werden: `revalidatePath` ausserhalb eines Requests
 * wirft, und die Auffrischung ist nicht der Pruefgegenstand.
 */
const DIR = "./.data/zeichen-actions-test";
let angemeldet: string | null = null;

vi.mock("@/core/auth", () => ({
  auth: async () => (angemeldet === null ? null : { user: { id: angemeldet } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const ANNA = "dev:anna@localtest.me";
const BERT = "dev:bert@localtest.me";
const ANKER = "rezept:C.1.1";

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  angemeldet = ANNA;
});

async function merkzeilen(sub: string) {
  const { getDb } = await import("./_db/client");
  const { merkliste } = await import("./_db/schema");
  return getDb().select().from(merkliste).where(eq(merkliste.sub, sub)).all();
}

describe("merkeZeichen", () => {
  it("legt eine Zeile mit dem HEUTIGEN Titel als Schnappschuss an", async () => {
    const { merkeZeichen } = await import("./actions");
    const { findeZeichen } = await import("./_lib/katalog");
    await merkeZeichen(ANKER);
    const zeilen = await merkzeilen(ANNA);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]?.zeichenId).toBe(ANKER);
    expect(zeilen[0]?.titelSchnappschuss).toBe(findeZeichen(ANKER)?.titel);
  });

  /* PK (sub, zeichenId) + onConflictDoNothing: zweimal merken ist EIN Merken. */
  it("legt beim zweiten Mal keine zweite Zeile an", async () => {
    const { merkeZeichen } = await import("./actions");
    await merkeZeichen(ANKER);
    await merkeZeichen(ANKER);
    expect(await merkzeilen(ANNA)).toHaveLength(1);
  });

  /*
   * `findeZeichen` WIRFT NIE, und diese Action tut es ihm gleich: eine unbekannte
   * ID kann aus einem alten Lesezeichen oder einem manipulierten Aufruf kommen.
   * Sie ist kein Angriff und kein Feldfehler — es gibt schlicht nichts zu merken.
   */
  it("merkt nichts, was der Katalog nicht kennt — und wirft dabei nicht", async () => {
    const { merkeZeichen } = await import("./actions");
    await expect(merkeZeichen("rezept:GIBTSNICHT")).resolves.toBeUndefined();
    expect(await merkzeilen(ANNA)).toHaveLength(0);
  });

  it("wirft ohne Sitzung, BEVOR etwas geschrieben wurde", async () => {
    angemeldet = null;
    const { merkeZeichen } = await import("./actions");
    await expect(merkeZeichen(ANKER)).rejects.toThrow("Forbidden");
    expect(await merkzeilen(ANNA)).toHaveLength(0);
  });
});

describe("entferneZeichen", () => {
  /*
   * DER WICHTIGSTE FALL DIESER DATEI. Spec §4.6 Stufe 2 sagt zu, dass eine
   * verwaiste Merkzeile SICHTBAR bleibt UND einen Entfernen-Knopf traegt. Wuerde
   * diese Action wie `merkeZeichen` gegen den Katalog pruefen, waere genau diese
   * Zeile die einzige, die man NICHT loswird — der Knopf staende da und taete
   * nichts, still.
   */
  it("entfernt auch eine Zeile, deren Zeichen der Katalog nicht mehr fuehrt", async () => {
    const { getDb } = await import("./_db/client");
    const { merkliste } = await import("./_db/schema");
    getDb()
      .insert(merkliste)
      .values({ sub: ANNA, zeichenId: "rezept:GIBTSNICHT", titelSchnappschuss: "Bergungsgruppe" })
      .run();
    const { entferneZeichen } = await import("./actions");
    await entferneZeichen("rezept:GIBTSNICHT");
    expect(await merkzeilen(ANNA)).toHaveLength(0);
  });

  /*
   * IDOR: der `sub` kommt aus `auth()`, NIE aus einem Argument. Beide Personen
   * haben dieselbe zeichenId gemerkt; entfernt werden darf genau eine Zeile.
   */
  it("raeumt nur die eigene Zeile, nicht die einer anderen Person", async () => {
    const { merkeZeichen, entferneZeichen } = await import("./actions");
    await merkeZeichen(ANKER);
    angemeldet = BERT;
    await merkeZeichen(ANKER);
    await entferneZeichen(ANKER);
    expect(await merkzeilen(BERT)).toHaveLength(0);
    expect(await merkzeilen(ANNA)).toHaveLength(1);
  });

  it("wirft ohne Sitzung", async () => {
    angemeldet = null;
    const { entferneZeichen } = await import("./actions");
    await expect(entferneZeichen(ANKER)).rejects.toThrow("Forbidden");
  });
});

/*
 * DIE DRITTE ACTION — speichern, mit den ZWEI RUECKFRAGEN aus Spec §6.6.
 *
 * Geprueft wird hier die Verdrahtung, nicht die Formpruefung (`_lib/pruefung.test.ts`)
 * und nicht die Datenzugriffe (`_db/eigeneZeichen.test.ts`): dass nichts geschrieben
 * wird, solange eine Frage offen ist, und dass die Bestaetigung genau ihren Fall
 * erledigt.
 */
const START = { ok: false, art: "fehler", feldFehler: {}, werte: {} } as const;

function formular(felder: Record<string, string>): FormData {
  const daten = new FormData();
  for (const [k, v] of Object.entries(felder)) daten.set(k, v);
  return daten;
}

const SPEC = '{"kind":"formation","organization":"thw"}';
const SVG = "<svg><g/></svg>";

async function eigene(sub: string) {
  const { getDb } = await import("./_db/client");
  const { eigeneZeichenVon } = await import("./_db/eigeneZeichen");
  return eigeneZeichenVon(getDb(), sub);
}

describe("speichereEigenesZeichen", () => {
  it("legt an und traegt den heutigen Katalogstand ein", async () => {
    const { speichereEigenesZeichen } = await import("./actions");
    const { KATALOG_STAND } = await import("./_lib/katalog");
    const zustand = await speichereEigenesZeichen(
      START,
      formular({ name: "Zugtrupp Nord", spec: SPEC, svg: SVG }),
    );
    expect(zustand.ok).toBe(true);
    const zeilen = await eigene(ANNA);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]?.paketVersion).toBe(KATALOG_STAND.paket);
    expect(zeilen[0]?.datenVersion).toBe(KATALOG_STAND.daten);
  });

  /*
   * DER KANONISCHE SCHLUESSEL WIRD SERVERSEITIG GERECHNET, nicht vom Client
   * uebernommen: er beantwortet „schon gespeichert?", und ein mitgelieferter Wert
   * koennte sie beliebig beantworten. Ein Feld `specKanon` in der FormData darf
   * deshalb keine Wirkung haben.
   */
  it("rechnet den kanonischen Schluessel selbst", async () => {
    const { speichereEigenesZeichen } = await import("./actions");
    const { kanonischerSchluessel } = await import("./_lib/kanon");
    await speichereEigenesZeichen(
      START,
      formular({ name: "Zugtrupp Nord", spec: SPEC, svg: SVG, specKanon: "geloegen" }),
    );
    expect((await eigene(ANNA))[0]?.specKanon).toBe(kanonischerSchluessel(JSON.parse(SPEC)));
  });

  it("verlangt einen Namen und schreibt vorher nichts", async () => {
    const { speichereEigenesZeichen } = await import("./actions");
    const zustand = await speichereEigenesZeichen(
      START,
      formular({ name: "   ", spec: SPEC, svg: SVG }),
    );
    expect(zustand.ok).toBe(false);
    if (!zustand.ok && zustand.art === "fehler") expect(zustand.feldFehler.name).toBeTruthy();
    expect(await eigene(ANNA)).toHaveLength(0);
  });

  it("meldet einen Formfehler der Spec als Feldfehler", async () => {
    const { speichereEigenesZeichen } = await import("./actions");
    const zustand = await speichereEigenesZeichen(
      START,
      formular({ name: "Krumm", spec: "kein json", svg: SVG }),
    );
    expect(zustand.ok).toBe(false);
    if (!zustand.ok && zustand.art === "fehler") expect(zustand.feldFehler.spec).toBeTruthy();
    expect(await eigene(ANNA)).toHaveLength(0);
  });

  /*
   * ⛔ NICHTS WIRD STILL UEBERSCHRIEBEN (Spec §6.6). Der zweite Aufruf mit
   * demselben Namen fragt zurueck — und laesst die vorhandene Zeile UNVERAENDERT.
   */
  it("fragt beim gleichen Namen zurueck und aendert dabei nichts", async () => {
    const { speichereEigenesZeichen } = await import("./actions");
    await speichereEigenesZeichen(START, formular({ name: "Doppelt", spec: SPEC, svg: SVG }));
    const zustand = await speichereEigenesZeichen(
      START,
      formular({ name: "Doppelt", spec: '{"kind":"person"}', svg: SVG }),
    );
    expect(zustand.ok).toBe(false);
    if (!zustand.ok && zustand.art === "rueckfrage") expect(zustand.frage).toBe("name");
    const zeilen = await eigene(ANNA);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]?.specJson).toBe(SPEC);
  });

  it("ueberschreibt erst nach der Bestaetigung — und legt nichts Zweites an", async () => {
    const { speichereEigenesZeichen } = await import("./actions");
    await speichereEigenesZeichen(START, formular({ name: "Doppelt", spec: SPEC, svg: SVG }));
    const zustand = await speichereEigenesZeichen(
      START,
      formular({
        name: "Doppelt",
        spec: '{"kind":"person"}',
        svg: SVG,
        bestaetigung: "ueberschreiben",
      }),
    );
    expect(zustand.ok).toBe(true);
    const zeilen = await eigene(ANNA);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]?.specJson).toBe('{"kind":"person"}');
  });

  it("fragt bei gleicher Zusammenstellung unter anderem Namen zurueck und nennt den alten", async () => {
    const { speichereEigenesZeichen } = await import("./actions");
    await speichereEigenesZeichen(START, formular({ name: "Erster", spec: SPEC, svg: SVG }));
    const zustand = await speichereEigenesZeichen(
      START,
      formular({ name: "Zweiter", spec: SPEC, svg: SVG }),
    );
    expect(zustand.ok).toBe(false);
    if (!zustand.ok && zustand.art === "rueckfrage") {
      expect(zustand.frage).toBe("zusammenstellung");
      expect(zustand.text).toContain("Erster");
    }
    expect(await eigene(ANNA)).toHaveLength(1);
  });

  it("sichert nach der Bestaetigung ein zweites Mal", async () => {
    const { speichereEigenesZeichen } = await import("./actions");
    await speichereEigenesZeichen(START, formular({ name: "Erster", spec: SPEC, svg: SVG }));
    const zustand = await speichereEigenesZeichen(
      START,
      formular({ name: "Zweiter", spec: SPEC, svg: SVG, bestaetigung: "zusaetzlich" }),
    );
    expect(zustand.ok).toBe(true);
    expect(await eigene(ANNA)).toHaveLength(2);
  });

  /*
   * Eine Bestaetigung fuer den einen Fall darf den anderen nicht miterledigen:
   * „zusaetzlich" beantwortet die Namensfrage NICHT.
   */
  it("laesst die falsche Bestaetigung nicht durchgehen", async () => {
    const { speichereEigenesZeichen } = await import("./actions");
    await speichereEigenesZeichen(START, formular({ name: "Doppelt", spec: SPEC, svg: SVG }));
    const zustand = await speichereEigenesZeichen(
      START,
      formular({
        name: "Doppelt",
        spec: '{"kind":"person"}',
        svg: SVG,
        bestaetigung: "zusaetzlich",
      }),
    );
    expect(zustand.ok).toBe(false);
    if (!zustand.ok && zustand.art === "rueckfrage") expect(zustand.frage).toBe("name");
  });

  /* IDOR: dieselbe Zusammenstellung einer ANDEREN Person loest keine Rueckfrage aus. */
  it("sieht nur die eigenen Zeichen", async () => {
    const { speichereEigenesZeichen } = await import("./actions");
    await speichereEigenesZeichen(START, formular({ name: "Erster", spec: SPEC, svg: SVG }));
    angemeldet = BERT;
    const zustand = await speichereEigenesZeichen(
      START,
      formular({ name: "Erster", spec: SPEC, svg: SVG }),
    );
    expect(zustand.ok).toBe(true);
    expect(await eigene(BERT)).toHaveLength(1);
  });

  it("wirft ohne Sitzung, BEVOR etwas geschrieben wurde", async () => {
    angemeldet = null;
    const { speichereEigenesZeichen } = await import("./actions");
    await expect(
      speichereEigenesZeichen(START, formular({ name: "X", spec: SPEC, svg: SVG })),
    ).rejects.toThrow("Forbidden");
  });
});

/*
 * ⛔ DER DOPPELKONFLIKT (Review Aufgabe 7, Befund W1) — die Lage, in der beide
 * Bedingungen zugleich zutreffen und ein EINZELNES `bestaetigung`-Feld nur eine
 * der beiden Fragen beantworten kann. Vorher pendelte die Oberflaeche endlos
 * zwischen zwei Kaesten, ohne je zu speichern; der Ausweg (anders benennen) stand
 * nirgends.
 */
describe("speichereEigenesZeichen — beide Konflikte zugleich", () => {
  const SPEC_A = '{"kind":"formation","organization":"thw"}';
  const SPEC_B = '{"kind":"formation","organization":"feuerwehr"}';

  async function ausgangslage() {
    const { speichereEigenesZeichen } = await import("./actions");
    await speichereEigenesZeichen(START, formular({ name: "X", spec: SPEC_A, svg: SVG }));
    await speichereEigenesZeichen(START, formular({ name: "Y", spec: SPEC_B, svg: SVG }));
    return speichereEigenesZeichen;
  }

  it("fragt zuerst nach dem Namen — und nur danach", async () => {
    const speichern = await ausgangslage();
    const zustand = await speichern(START, formular({ name: "X", spec: SPEC_B, svg: SVG }));
    expect(zustand.ok).toBe(false);
    if (!zustand.ok && zustand.art === "rueckfrage") expect(zustand.frage).toBe("name");
  });

  /*
   * DIE ENTSCHEIDENDE ZUSICHERUNG: eine einzige Bestaetigung beendet den Vorgang.
   * Wer ueberschreibt, legt nichts Zweites an — die Zusammenstellungsfrage hat
   * damit keinen Gegenstand mehr.
   */
  it("speichert nach EINER Bestaetigung, statt erneut zu fragen", async () => {
    const speichern = await ausgangslage();
    const zustand = await speichern(
      START,
      formular({ name: "X", spec: SPEC_B, svg: SVG, bestaetigung: "ueberschreiben" }),
    );
    expect(zustand.ok, "es wurde erneut gefragt, statt zu speichern").toBe(true);
    const zeilen = await eigene(ANNA);
    // Zwei Zeilen wie vorher: „X" traegt jetzt SPEC_B, „Y" ist unberuehrt.
    expect(zeilen.map((z) => z.name).sort()).toEqual(["X", "Y"]);
    expect(zeilen.find((z) => z.name === "X")?.specJson).toBe(SPEC_B);
    expect(zeilen.find((z) => z.name === "Y")?.specJson).toBe(SPEC_B);
  });

  /* „zusaetzlich" beantwortet die Namensfrage nicht — die Frage bleibt dieselbe. */
  it("laeuft mit der falschen Bestaetigung nicht im Kreis", async () => {
    const speichern = await ausgangslage();
    const zustand = await speichern(
      START,
      formular({ name: "X", spec: SPEC_B, svg: SVG, bestaetigung: "zusaetzlich" }),
    );
    expect(zustand.ok).toBe(false);
    if (!zustand.ok && zustand.art === "rueckfrage") expect(zustand.frage).toBe("name");
    expect(await eigene(ANNA)).toHaveLength(2);
  });
});

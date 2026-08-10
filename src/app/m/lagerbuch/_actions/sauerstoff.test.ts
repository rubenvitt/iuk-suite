import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { lagerorte, o2Flaschen, o2Messungen } from "../_db/schema";
import { migrierteTestDb, type TestDb } from "../_db/testdb";

const { revalidiert, adminRiegel } = vi.hoisted(() => ({
  revalidiert: [] as string[],
  adminRiegel: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (pfad: string) => { revalidiert.push(pfad); },
}));

vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: () => adminRiegel(),
}));

vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test — jeder Aufruf übergibt t.db"); },
}));

import { flascheSpeichern, messungErfassen, setFlascheAktiv } from "./sauerstoff";

const VIEWER = {
  sub: "u-admin",
  groups: ["lagerbuch"],
  name: "A. Verwaltung",
  email: null,
};
const JETZT = new Date("2026-08-07T12:34:56.000Z");
const AKTIVER_ORT_ID = "ort-aktiv";
const INAKTIVER_ORT_ID = "ort-inaktiv";
const FLASCHE_ID = "flasche-1";
const LISTENPFAD = "/m/lagerbuch/verwaltung/sauerstoff";

const detailPfad = (id: string) => `${LISTENPFAD}/${id}`;

let t: TestDb;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(JETZT);
  revalidiert.length = 0;
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-sauerstoff-");
  t.db.insert(lagerorte).values([
    {
      id: AKTIVER_ORT_ID,
      name: "RTW 1",
      typ: "fahrzeug",
      kennung: "1/83-1",
      aktiv: true,
    },
    {
      id: INAKTIVER_ORT_ID,
      name: "Altbestand",
      typ: "lager",
      kennung: null,
      aktiv: false,
    },
  ]).run();
});

afterEach(() => {
  t.schliessen();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function flascheVorbelegen({
  id = FLASCHE_ID,
  lagerortId = AKTIVER_ORT_ID,
  nennfuelldruckBar = 300,
  aktiv = true,
}: {
  id?: string;
  lagerortId?: string;
  nennfuelldruckBar?: number;
  aktiv?: boolean;
} = {}): void {
  t.db.insert(o2Flaschen).values({
    id,
    name: "O2 Bestand",
    lagerortId,
    groesseLiter: 10,
    nennfuelldruckBar,
    aktiv,
    createdAt: new Date("2026-07-01T08:00:00.000Z"),
  }).run();
}

function flasche(id = FLASCHE_ID) {
  return t.db.select().from(o2Flaschen).where(eq(o2Flaschen.id, id)).get();
}

function wert<T>(erg: unknown): T {
  return (erg as { ok: true; wert: T }).wert;
}

describe("flascheSpeichern", () => {
  it("legt am aktiven Lagerort an, speichert den Vorgabedruck und revalidiert nur die Liste", async () => {
    const erg = await flascheSpeichern({
      name: "  O2 klein  ",
      lagerortId: AKTIVER_ORT_ID,
      groesseLiter: 2,
    }, t.db);

    expect(erg).toMatchObject({ ok: true });
    const { id } = wert<{ id: string }>(erg);
    expect(t.db.select().from(o2Flaschen).where(eq(o2Flaschen.id, id)).get())
      .toMatchObject({
        id,
        name: "O2 klein",
        lagerortId: AKTIVER_ORT_ID,
        groesseLiter: 2,
        nennfuelldruckBar: 200,
        aktiv: true,
        createdAt: JETZT,
      });
    expect(revalidiert).toEqual([LISTENPFAD]);
  });

  it("ändert die Flasche und revalidiert den Detailpfad vor der Liste", async () => {
    flascheVorbelegen();

    const erg = await flascheSpeichern({
      id: FLASCHE_ID,
      name: "O2 groß",
      lagerortId: AKTIVER_ORT_ID,
      groesseLiter: 12,
      nennfuelldruckBar: 250,
    }, t.db);

    expect(erg).toEqual({ ok: true, wert: { id: FLASCHE_ID } });
    expect(flasche()).toMatchObject({
      name: "O2 groß",
      lagerortId: AKTIVER_ORT_ID,
      groesseLiter: 12,
      nennfuelldruckBar: 250,
      aktiv: true,
      createdAt: new Date("2026-07-01T08:00:00.000Z"),
    });
    expect(revalidiert).toEqual([detailPfad(FLASCHE_ID), LISTENPFAD]);
  });

  it("schreibt den Vorgabedruck 200 auch bei einer Änderung ohne Druckangabe", async () => {
    flascheVorbelegen({ nennfuelldruckBar: 300 });

    await flascheSpeichern({
      id: FLASCHE_ID,
      name: "O2 Bestand",
      lagerortId: AKTIVER_ORT_ID,
      groesseLiter: 10,
    }, t.db);

    expect(flasche()?.nennfuelldruckBar).toBe(200);
  });

  it.each([
    { lagerortId: "ort-fehlt", beschreibung: "fehlenden" },
    { lagerortId: INAKTIVER_ORT_ID, beschreibung: "inaktiven" },
  ])("lehnt einen $beschreibung Lagerort beim Anlegen fest ohne Schreiben ab", async ({
    lagerortId,
  }) => {
    const erg = await flascheSpeichern({
      name: "O2 klein",
      lagerortId,
      groesseLiter: 2,
    }, t.db);

    expect(erg).toEqual({ ok: false, fehler: "Lagerort nicht gefunden oder inaktiv." });
    expect(t.db.select().from(o2Flaschen).all()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it.each([
    { lagerortId: "ort-fehlt", beschreibung: "fehlenden" },
    { lagerortId: INAKTIVER_ORT_ID, beschreibung: "inaktiven" },
  ])("lehnt einen $beschreibung Lagerort beim Ändern ohne Teiländerung ab", async ({
    lagerortId,
  }) => {
    flascheVorbelegen();

    const erg = await flascheSpeichern({
      id: FLASCHE_ID,
      name: "Darf nicht gespeichert werden",
      lagerortId,
      groesseLiter: 2,
      nennfuelldruckBar: 200,
    }, t.db);

    expect(erg).toEqual({ ok: false, fehler: "Lagerort nicht gefunden oder inaktiv." });
    expect(flasche()).toMatchObject({
      name: "O2 Bestand",
      lagerortId: AKTIVER_ORT_ID,
      groesseLiter: 10,
      nennfuelldruckBar: 300,
    });
    expect(revalidiert).toEqual([]);
  });

  it("lehnt eine unbekannte Flasche beim Ändern fest ohne Schreiben ab", async () => {
    const erg = await flascheSpeichern({
      id: "flasche-fehlt",
      name: "O2 unbekannt",
      lagerortId: AKTIVER_ORT_ID,
      nennfuelldruckBar: 200,
    }, t.db);

    expect(erg).toEqual({ ok: false, fehler: "Sauerstoffflasche nicht gefunden." });
    expect(t.db.select().from(o2Flaschen).all()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it.each([
    {
      eingabe: { name: " ", lagerortId: AKTIVER_ORT_ID },
      feldFehler: { name: "Name darf nicht leer sein" },
      beschreibung: "leeren Namen",
    },
    {
      eingabe: {
        name: "O2 klein",
        lagerortId: AKTIVER_ORT_ID,
        nennfuelldruckBar: 0,
      },
      feldFehler: { nennfuelldruckBar: "Nennfülldruck muss größer als 0 sein" },
      beschreibung: "nichtpositiven Nennfülldruck",
    },
  ])("meldet einen $beschreibung als festen Feldfehler", async ({ eingabe, feldFehler }) => {
    const erg = await flascheSpeichern(eingabe, t.db);

    expect(erg).toEqual({
      ok: false,
      fehler: "Bitte die markierten Felder prüfen.",
      feldFehler,
    });
    expect(t.db.select().from(o2Flaschen).all()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });
});

describe("setFlascheAktiv", () => {
  it("ändert aktiv tatsächlich und revalidiert Liste vor Detail", async () => {
    flascheVorbelegen({ aktiv: true });

    const erg = await setFlascheAktiv({ id: FLASCHE_ID, aktiv: false }, t.db);

    expect(erg).toEqual({ ok: true });
    expect(flasche()?.aktiv).toBe(false);
    expect(revalidiert).toEqual([LISTENPFAD, detailPfad(FLASCHE_ID)]);
  });

  it("lehnt eine unbekannte Flasche fest und ohne Revalidierung ab", async () => {
    const erg = await setFlascheAktiv({ id: "flasche-fehlt", aktiv: false }, t.db);

    expect(erg).toEqual({ ok: false, fehler: "Sauerstoffflasche nicht gefunden." });
    expect(revalidiert).toEqual([]);
  });

  it("weist ungültige Eingaben mit festem Text zurück", async () => {
    const erg = await setFlascheAktiv({ id: "", aktiv: "nein" }, t.db);

    expect(erg).toEqual({ ok: false, fehler: "Ungültige Eingabe." });
    expect(revalidiert).toEqual([]);
  });
});

describe("messungErfassen", () => {
  it("fügt eine Messung mit Zeitpunkt und OIDC-Quelle ein und revalidiert beide Pfade", async () => {
    flascheVorbelegen();

    const erg = await messungErfassen({
      flascheId: FLASCHE_ID,
      druckBar: 150,
      kommentar: "  Monatskontrolle  ",
    }, t.db);

    expect(erg).toMatchObject({ ok: true });
    const { id } = wert<{ id: string }>(erg);
    expect(t.db.select().from(o2Messungen).where(eq(o2Messungen.id, id)).get())
      .toMatchObject({
        id,
        flascheId: FLASCHE_ID,
        ts: JETZT,
        druckBar: 150,
        quelleTyp: "oidc",
        quelleId: VIEWER.sub,
        kommentar: "Monatskontrolle",
      });
    expect(revalidiert).toEqual([LISTENPFAD, detailPfad(FLASCHE_ID)]);
  });

  it("fügt Folgemessungen hinzu, ohne die vorherige Messung zu ändern", async () => {
    flascheVorbelegen();
    const erste = await messungErfassen({ flascheId: FLASCHE_ID, druckBar: 100 }, t.db);
    vi.setSystemTime(new Date("2026-08-07T12:35:56.000Z"));
    const zweite = await messungErfassen({ flascheId: FLASCHE_ID, druckBar: 180 }, t.db);
    const ersteId = wert<{ id: string }>(erste).id;
    const zweiteId = wert<{ id: string }>(zweite).id;

    expect(zweiteId).not.toBe(ersteId);
    expect(t.db.select().from(o2Messungen).where(eq(o2Messungen.id, ersteId)).get())
      .toMatchObject({ druckBar: 100, ts: JETZT });
    expect(t.db.select().from(o2Messungen).where(eq(o2Messungen.id, zweiteId)).get())
      .toMatchObject({ druckBar: 180, ts: new Date("2026-08-07T12:35:56.000Z") });
  });

  it("nimmt 0 bar als gültigen Messwert an", async () => {
    flascheVorbelegen();

    const erg = await messungErfassen({ flascheId: FLASCHE_ID, druckBar: 0 }, t.db);

    expect(erg).toMatchObject({ ok: true });
    expect(t.db.select().from(o2Messungen).all()).toHaveLength(1);
    expect(t.db.select().from(o2Messungen).all()[0].druckBar).toBe(0);
  });

  it("lehnt negativen Druck mit Feldfehler ohne Schreiben oder Revalidierung ab", async () => {
    flascheVorbelegen();

    const erg = await messungErfassen({ flascheId: FLASCHE_ID, druckBar: -1 }, t.db);

    expect(erg).toEqual({
      ok: false,
      fehler: "Bitte die markierten Felder prüfen.",
      feldFehler: { druckBar: "Druck darf nicht negativ sein" },
    });
    expect(t.db.select().from(o2Messungen).all()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("lehnt eine unbekannte Flasche fest statt mit Fremdschlüsselfehler ab", async () => {
    const erg = await messungErfassen({ flascheId: "flasche-fehlt", druckBar: 150 }, t.db);

    expect(erg).toEqual({ ok: false, fehler: "Sauerstoffflasche nicht gefunden." });
    expect(t.db.select().from(o2Messungen).all()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });
});

describe("Admin-Riegel", () => {
  it.each([
    {
      name: "flascheSpeichern",
      aufruf: () => flascheSpeichern({ name: "", lagerortId: "" }, t.db),
    },
    {
      name: "setFlascheAktiv",
      aufruf: () => setFlascheAktiv({ id: "", aktiv: "nein" }, t.db),
    },
    {
      name: "messungErfassen",
      aufruf: () => messungErfassen({ flascheId: "", druckBar: -1 }, t.db),
    },
  ])("lässt bei $name den Admin-Riegel vor ungültiger Eingabe entscheiden", async ({ aufruf }) => {
    const verweigert = new Error("Kein Lagerbuch-Zugang");
    adminRiegel.mockRejectedValueOnce(verweigert);

    await expect(aufruf()).rejects.toBe(verweigert);

    expect(adminRiegel).toHaveBeenCalledTimes(1);
    expect(t.db.select().from(o2Flaschen).all()).toEqual([]);
    expect(t.db.select().from(o2Messungen).all()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });
});

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import {
  artikel,
  fahrzeugTemplates,
  lagerorte,
  sollPositionen,
  templatePositionen,
} from "../_db/schema";

const { adminRiegel, revalidiert } = vi.hoisted(() => ({
  adminRiegel: vi.fn<() => Promise<unknown>>(),
  revalidiert: [] as string[],
}));

vi.mock("next/cache", () => ({
  revalidatePath: (pfad: string) => { revalidiert.push(pfad); },
}));

vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: () => adminRiegel(),
}));

vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test - jeder Aufruf uebergibt t.db"); },
}));

import {
  createTemplate,
  deleteTemplate,
  fahrzeugTemplateLoesen,
  fahrzeugTemplateSync,
  fahrzeugTemplateZuweisen,
  renameTemplate,
  setTemplateAktiv,
  templateAufFahrzeugeSyncen,
  templateAusFahrzeug,
  templatePositionEntfernen,
  templatePositionSetzen,
} from "./templates";

const JETZT = new Date("2026-08-07T10:00:00Z");
const VIEWER = {
  sub: "u-admin",
  groups: ["lagerbuch"],
  name: "A. Verwaltung",
  email: null,
};

let t: TestDb;
let laufendeId: number;

beforeEach(() => {
  revalidiert.length = 0;
  adminRiegel.mockResolvedValue(VIEWER);
  laufendeId = 0;
  t = migrierteTestDb("lagerbuch-actions-templates-");
});

afterEach(() => {
  t.schliessen();
  vi.clearAllMocks();
});

function naechsteId(praefix: string) {
  laufendeId += 1;
  return `${praefix}-${laufendeId}`;
}

function artikelAnlegen(name = "Mullbinde") {
  const id = naechsteId("art");
  t.db.insert(artikel).values({
    id,
    name,
    einheit: "Stk",
    fach: `A-${laufendeId}`,
    mindestbestand: 0,
    aktiv: true,
    createdAt: JETZT,
  }).run();
  return id;
}

function fahrzeugAnlegen(name = "RTW 1") {
  const id = naechsteId("fz");
  t.db.insert(lagerorte).values({
    id,
    name,
    typ: "fahrzeug",
    aktiv: true,
  }).run();
  return id;
}

function wertVon<T>(erg: { ok: boolean }): T {
  expect(erg.ok).toBe(true);
  return (erg as { ok: true; wert: T }).wert;
}

function fehlerVon(erg: { ok: boolean }) {
  return (erg as { ok: false; fehler: string }).fehler;
}

async function mitPfaden<T extends { ok: boolean }>(
  aufruf: () => Promise<T>,
  fahrzeugId?: string,
): Promise<T> {
  revalidiert.length = 0;
  const erg = await aufruf();
  expect(erg.ok).toBe(true);
  expect(revalidiert).toEqual([
    "/m/lagerbuch/verwaltung/vorlagen",
    "/m/lagerbuch/verwaltung/fahrzeuge",
    ...(fahrzeugId ? [`/m/lagerbuch/verwaltung/fahrzeuge/${fahrzeugId}`] : []),
  ]);
  return erg;
}

function positionenFuer(fahrzeugId: string) {
  return t.db.select().from(sollPositionen)
    .where(eq(sollPositionen.fahrzeugId, fahrzeugId)).all();
}

describe("Bauform und Riegel", () => {
  it("exportiert genau elf bewachte Actions und nicht den Transaktionshelfer", async () => {
    const mod = await import("./templates");

    expect(Object.keys(mod).sort()).toEqual([
      "createTemplate",
      "deleteTemplate",
      "fahrzeugTemplateLoesen",
      "fahrzeugTemplateSync",
      "fahrzeugTemplateZuweisen",
      "renameTemplate",
      "setTemplateAktiv",
      "templateAufFahrzeugeSyncen",
      "templateAusFahrzeug",
      "templatePositionEntfernen",
      "templatePositionSetzen",
    ]);
    expect(Object.keys(mod)).not.toContain("loeseFahrzeugVonTemplate");
  });

  it("ruft den Admin-Riegel vor der Validierung auf", async () => {
    const riegelFehler = new Error("Riegel vor Validierung");
    adminRiegel.mockRejectedValueOnce(riegelFehler);

    await expect(createTemplate({}, t.db)).rejects.toBe(riegelFehler);

    expect(t.db.select().from(fahrzeugTemplates).all()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });
});

describe("Validierung und feste Fehler", () => {
  it("lehnt einen leeren Namen ohne Schreiben oder Revalidierung ab", async () => {
    const erg = await createTemplate({ name: "   " }, t.db);

    expect(erg.ok).toBe(false);
    expect((erg as { ok: false; feldFehler?: Record<string, string> }).feldFehler?.name)
      .toMatch(/Name darf nicht leer sein/);
    expect(t.db.select().from(fahrzeugTemplates).all()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("gibt beliebige SQLite-Texte nicht an den Client weiter", async () => {
    const artikelId = artikelAnlegen();

    const erg = await templatePositionSetzen({
      templateId: "tpl-fehlt",
      fachLabel: "Fach 1",
      artikelId,
      soll: 2,
    }, t.db);

    expect(erg.ok).toBe(false);
    expect(fehlerVon(erg)).toBe("Vorlagenposition konnte nicht gespeichert werden.");
    expect(fehlerVon(erg)).not.toMatch(/foreign key|constraint/i);
    expect(t.db.select().from(templatePositionen).all()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });
});

describe("Der eine Revalidierungs-Helfer", () => {
  it("liefert fuer jede der elf Actions die exakten Pfade in derselben Reihenfolge", async () => {
    const artikelId = artikelAnlegen();
    const erstellt = await mitPfaden(() => createTemplate({ name: "Standard" }, t.db));
    const templateId = wertVon<{ id: string }>(erstellt).id;

    await mitPfaden(() => renameTemplate({ id: templateId, name: "Standard neu" }, t.db));
    await mitPfaden(() => setTemplateAktiv({ id: templateId, aktiv: false }, t.db));
    const gesetzt = await mitPfaden(() => templatePositionSetzen({
      templateId,
      fachLabel: "Fach 1",
      artikelId,
      soll: 2,
    }, t.db));
    const templatePositionId = wertVon<{ id: string }>(gesetzt).id;
    const fahrzeugId = fahrzeugAnlegen();

    await mitPfaden(
      () => fahrzeugTemplateZuweisen({ fahrzeugId, templateId }, t.db),
      fahrzeugId,
    );
    await mitPfaden(() => fahrzeugTemplateSync({ fahrzeugId }, t.db), fahrzeugId);
    await mitPfaden(() => templateAufFahrzeugeSyncen({ templateId }, t.db));
    await mitPfaden(() => fahrzeugTemplateLoesen({ fahrzeugId }, t.db), fahrzeugId);
    await mitPfaden(
      () => templateAusFahrzeug({ fahrzeugId, name: "Aus Fahrzeug", verknuepfen: true }, t.db),
      fahrzeugId,
    );
    await mitPfaden(() => templatePositionEntfernen({ id: templatePositionId }, t.db));
    await mitPfaden(() => deleteTemplate({ id: templateId }, t.db));
  });
});

describe("Vorlagen-Stammdaten", () => {
  it("legt getrimmt und aktiv an, benennt getrimmt um und schaltet nur aktiv", async () => {
    const erstellt = await createTemplate({ name: "  Standard-RTW  " }, t.db);
    const id = wertVon<{ id: string }>(erstellt).id;
    const vorher = t.db.select().from(fahrzeugTemplates)
      .where(eq(fahrzeugTemplates.id, id)).get()!;

    expect(vorher).toMatchObject({ id, name: "Standard-RTW", aktiv: true });
    expect(vorher.createdAt).toBeInstanceOf(Date);

    await renameTemplate({ id, name: "  RTW neu  " }, t.db);
    await setTemplateAktiv({ id, aktiv: false }, t.db);

    expect(t.db.select().from(fahrzeugTemplates)
      .where(eq(fahrzeugTemplates.id, id)).get()).toMatchObject({
      id,
      name: "RTW neu",
      aktiv: false,
      createdAt: vorher.createdAt,
    });
  });

  it("loescht die Vorlage FK-sicher und behaelt Fahrzeugbestueckung als manuell", async () => {
    const templateId = wertVon<{ id: string }>(
      await createTemplate({ name: "Standard" }, t.db),
    ).id;
    const artikelA = artikelAnlegen("A");
    const artikelB = artikelAnlegen("B");
    await templatePositionSetzen({
      templateId, fachLabel: "Fach A", artikelId: artikelA, soll: 2,
    }, t.db);
    await templatePositionSetzen({
      templateId, fachLabel: "Fach B", artikelId: artikelB, soll: 3,
    }, t.db);
    const fahrzeugId = fahrzeugAnlegen();
    await fahrzeugTemplateZuweisen({ fahrzeugId, templateId }, t.db);
    const vorher = positionenFuer(fahrzeugId);
    const grabstein = vorher.find((row) => row.artikelId === artikelB)!;
    const erhalten = vorher.find((row) => row.artikelId === artikelA)!;
    t.db.update(sollPositionen).set({ entfernt: true })
      .where(eq(sollPositionen.id, grabstein.id)).run();

    const erg = await mitPfaden(() => deleteTemplate({ id: templateId }, t.db));

    expect(erg.ok).toBe(true);
    expect(t.db.select().from(fahrzeugTemplates).all()).toEqual([]);
    expect(t.db.select().from(templatePositionen).all()).toEqual([]);
    expect(t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, fahrzeugId)).get()?.templateId).toBeNull();
    expect(positionenFuer(fahrzeugId)).toEqual([
      expect.objectContaining({
        id: erhalten.id,
        templatePositionId: null,
        ueberschrieben: false,
        entfernt: false,
      }),
    ]);
  });
});

describe("Vorlagen-Positionen", () => {
  it("legt an, aendert alle Felder und gibt die stabile ID zurueck", async () => {
    const templateA = wertVon<{ id: string }>(
      await createTemplate({ name: "A" }, t.db),
    ).id;
    const templateB = wertVon<{ id: string }>(
      await createTemplate({ name: "B" }, t.db),
    ).id;
    const artikelA = artikelAnlegen("A");
    const artikelB = artikelAnlegen("B");
    const erstellt = await templatePositionSetzen({
      templateId: templateA,
      fachLabel: "  Fach A  ",
      artikelId: artikelA,
      soll: "2",
      sort: "1",
    }, t.db);
    const id = wertVon<{ id: string }>(erstellt).id;

    const geaendert = await templatePositionSetzen({
      id,
      templateId: templateB,
      fachLabel: "  Fach B  ",
      artikelId: artikelB,
      soll: "4",
      sort: "3",
    }, t.db);

    expect(wertVon<{ id: string }>(geaendert).id).toBe(id);
    expect(t.db.select().from(templatePositionen)
      .where(eq(templatePositionen.id, id)).get()).toMatchObject({
      id,
      templateId: templateB,
      fachLabel: "Fach B",
      artikelId: artikelB,
      soll: 4,
      sort: 3,
    });
  });

  it("loest Referenzen vor dem Loeschen auf und erhaelt Ueberschreibungen manuell", async () => {
    const templateId = wertVon<{ id: string }>(
      await createTemplate({ name: "Standard" }, t.db),
    ).id;
    const artikelA = artikelAnlegen("A");
    const artikelB = artikelAnlegen("B");
    const posA = wertVon<{ id: string }>(await templatePositionSetzen({
      templateId, fachLabel: "Fach A", artikelId: artikelA, soll: 2,
    }, t.db)).id;
    const posB = wertVon<{ id: string }>(await templatePositionSetzen({
      templateId, fachLabel: "Fach B", artikelId: artikelB, soll: 3,
    }, t.db)).id;
    const fahrzeugId = fahrzeugAnlegen();
    await fahrzeugTemplateZuweisen({ fahrzeugId, templateId }, t.db);
    const fahrzeugB = positionenFuer(fahrzeugId)
      .find((row) => row.templatePositionId === posB)!;
    t.db.update(sollPositionen).set({ soll: 9, ueberschrieben: true })
      .where(eq(sollPositionen.id, fahrzeugB.id)).run();

    await mitPfaden(() => templatePositionEntfernen({ id: posA }, t.db));
    await mitPfaden(() => templatePositionEntfernen({ id: posB }, t.db));

    expect(t.db.select().from(templatePositionen).all()).toEqual([]);
    expect(positionenFuer(fahrzeugId)).toEqual([
      expect.objectContaining({
        id: fahrzeugB.id,
        soll: 9,
        templatePositionId: null,
        ueberschrieben: false,
      }),
    ]);
  });
});

describe("Fahrzeug und Vorlage", () => {
  it("verwirft beim Loesen Grabsteine und behaelt materialisierte Identitaeten manuell", async () => {
    const templateId = wertVon<{ id: string }>(
      await createTemplate({ name: "Standard" }, t.db),
    ).id;
    const artikelA = artikelAnlegen("A");
    const artikelB = artikelAnlegen("B");
    await templatePositionSetzen({
      templateId, fachLabel: "Fach A", artikelId: artikelA, soll: 2,
    }, t.db);
    await templatePositionSetzen({
      templateId, fachLabel: "Fach B", artikelId: artikelB, soll: 3,
    }, t.db);
    const fahrzeugId = fahrzeugAnlegen();
    await fahrzeugTemplateZuweisen({ fahrzeugId, templateId }, t.db);
    const vorher = positionenFuer(fahrzeugId);
    const erhalten = vorher.find((row) => row.artikelId === artikelA)!;
    const grabstein = vorher.find((row) => row.artikelId === artikelB)!;
    t.db.update(sollPositionen).set({ soll: 8, ueberschrieben: true })
      .where(eq(sollPositionen.id, erhalten.id)).run();
    t.db.update(sollPositionen).set({ entfernt: true })
      .where(eq(sollPositionen.id, grabstein.id)).run();

    await mitPfaden(() => fahrzeugTemplateLoesen({ fahrzeugId }, t.db), fahrzeugId);

    expect(t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, fahrzeugId)).get()?.templateId).toBeNull();
    expect(positionenFuer(fahrzeugId)).toEqual([
      expect.objectContaining({
        id: erhalten.id,
        soll: 8,
        templatePositionId: null,
        ueberschrieben: false,
        entfernt: false,
      }),
    ]);
  });

  it("weist sofort zu, synchronisiert einzeln und summiert zwei Fahrzeuge", async () => {
    const templateId = wertVon<{ id: string }>(
      await createTemplate({ name: "Standard" }, t.db),
    ).id;
    const artikelId = artikelAnlegen();
    const templatePositionId = wertVon<{ id: string }>(await templatePositionSetzen({
      templateId, fachLabel: "Fach 1", artikelId, soll: 2,
    }, t.db)).id;
    const fahrzeugA = fahrzeugAnlegen("RTW A");
    const fahrzeugB = fahrzeugAnlegen("RTW B");

    const zuweisungA = await fahrzeugTemplateZuweisen({
      fahrzeugId: fahrzeugA, templateId,
    }, t.db);
    const zuweisungB = await fahrzeugTemplateZuweisen({
      fahrzeugId: fahrzeugB, templateId,
    }, t.db);
    expect(wertVon<{ hinzugefuegt: number }>(zuweisungA).hinzugefuegt).toBe(1);
    expect(wertVon<{ hinzugefuegt: number }>(zuweisungB).hinzugefuegt).toBe(1);
    const idsVorher = [
      positionenFuer(fahrzeugA)[0]!.id,
      positionenFuer(fahrzeugB)[0]!.id,
    ];
    await templatePositionSetzen({
      id: templatePositionId,
      templateId,
      fachLabel: "Fach 1",
      artikelId,
      soll: 7,
    }, t.db);

    const alle = await mitPfaden(
      () => templateAufFahrzeugeSyncen({ templateId }, t.db),
    );
    expect(wertVon<{
      fahrzeuge: number;
      hinzugefuegt: number;
      aktualisiert: number;
      uebersprungen: number;
      entfernt: number;
      losgeloest: number;
    }>(alle)).toEqual({
      fahrzeuge: 2,
      hinzugefuegt: 0,
      aktualisiert: 2,
      uebersprungen: 0,
      entfernt: 0,
      losgeloest: 0,
    });
    const einzeln = await mitPfaden(
      () => fahrzeugTemplateSync({ fahrzeugId: fahrzeugA }, t.db),
      fahrzeugA,
    );
    expect(wertVon<{
      hinzugefuegt: number;
      aktualisiert: number;
      uebersprungen: number;
      entfernt: number;
      losgeloest: number;
    }>(einzeln)).toEqual({
      hinzugefuegt: 0,
      aktualisiert: 0,
      uebersprungen: 0,
      entfernt: 0,
      losgeloest: 0,
    });
    expect([
      positionenFuer(fahrzeugA)[0]!.id,
      positionenFuer(fahrzeugB)[0]!.id,
    ]).toEqual(idsVorher);
    expect(positionenFuer(fahrzeugA)[0]!.soll).toBe(7);
    expect(positionenFuer(fahrzeugB)[0]!.soll).toBe(7);
  });

  it("adoptiert drei aktive Zeilen direkt, ignoriert den Grabstein und bleibt idempotent", async () => {
    const fahrzeugId = fahrzeugAnlegen();
    const artikelA = artikelAnlegen("A");
    const artikelB = artikelAnlegen("B");
    const artikelC = artikelAnlegen("C");
    const artikelEntfernt = artikelAnlegen("Entfernt");
    const ausgang = [
      { id: "sp-c", fahrzeugId, fachLabel: "Fach C", artikelId: artikelC,
        soll: 6, sort: 30, ueberschrieben: true, entfernt: false },
      { id: "sp-entfernt", fahrzeugId, fachLabel: "Alt", artikelId: artikelEntfernt,
        soll: 99, sort: 5, ueberschrieben: false, entfernt: true },
      { id: "sp-a", fahrzeugId, fachLabel: "Fach A", artikelId: artikelA,
        soll: 2, sort: 20, ueberschrieben: false, entfernt: false },
      { id: "sp-b", fahrzeugId, fachLabel: "Fach B", artikelId: artikelB,
        soll: 4, sort: 10, ueberschrieben: false, entfernt: false },
    ];
    t.db.insert(sollPositionen).values(ausgang).run();
    const aktiveIds = ausgang.filter((row) => !row.entfernt).map((row) => row.id).sort();

    const erstellt = await mitPfaden(
      () => templateAusFahrzeug({
        fahrzeugId,
        name: "  Aus RTW 1  ",
        verknuepfen: true,
      }, t.db),
      fahrzeugId,
    );
    const templateId = wertVon<{ id: string }>(erstellt).id;
    const nachher = positionenFuer(fahrzeugId);
    const aktivNachher = nachher.filter((row) => !row.entfernt);
    const neueTemplatePositionen = t.db.select().from(templatePositionen)
      .where(eq(templatePositionen.templateId, templateId)).all();

    expect(t.db.select().from(fahrzeugTemplates)
      .where(eq(fahrzeugTemplates.id, templateId)).get()).toMatchObject({
      name: "Aus RTW 1",
      aktiv: true,
    });
    expect(t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, fahrzeugId)).get()?.templateId).toBe(templateId);
    expect(nachher).toHaveLength(4);
    expect(aktivNachher.map((row) => row.id).sort()).toEqual(aktiveIds);
    expect(aktivNachher).toHaveLength(3);
    expect(neueTemplatePositionen).toHaveLength(3);

    const verknuepfteIds = aktivNachher.map((row) => row.templatePositionId);
    expect(verknuepfteIds.every((id) => id !== null)).toBe(true);
    expect(new Set(verknuepfteIds)).toHaveLength(3);
    expect([...new Set(verknuepfteIds)].sort()).toEqual(
      neueTemplatePositionen.map((row) => row.id).sort(),
    );
    for (const row of aktivNachher) {
      expect(row.ueberschrieben).toBe(false);
      expect(neueTemplatePositionen.find((tp) => tp.id === row.templatePositionId))
        .toMatchObject({
          fachLabel: row.fachLabel,
          sort: row.sort,
          artikelId: row.artikelId,
          soll: row.soll,
        });
    }
    expect(nachher.find((row) => row.id === "sp-entfernt")).toMatchObject({
      templatePositionId: null,
      entfernt: true,
    });
    expect(neueTemplatePositionen.some((row) => row.artikelId === artikelEntfernt)).toBe(false);

    const wiederZuweisen = await mitPfaden(
      () => fahrzeugTemplateZuweisen({ fahrzeugId, templateId }, t.db),
      fahrzeugId,
    );
    expect(wertVon<{ hinzugefuegt: number }>(wiederZuweisen).hinzugefuegt).toBe(0);
    expect(positionenFuer(fahrzeugId).map((row) => row.id).sort())
      .toEqual(ausgang.map((row) => row.id).sort());

    const wiederSyncen = await mitPfaden(
      () => fahrzeugTemplateSync({ fahrzeugId }, t.db),
      fahrzeugId,
    );
    expect(wertVon<{ hinzugefuegt: number }>(wiederSyncen).hinzugefuegt).toBe(0);
    expect(positionenFuer(fahrzeugId).map((row) => row.id).sort())
      .toEqual(ausgang.map((row) => row.id).sort());
  });

  it("kopiert ohne Verknuepfung und laesst Fahrzeug und Zeilen unabhaengig", async () => {
    const fahrzeugId = fahrzeugAnlegen();
    const artikelA = artikelAnlegen("A");
    const artikelB = artikelAnlegen("B");
    t.db.insert(sollPositionen).values([
      { id: "sp-a", fahrzeugId, fachLabel: "A", artikelId: artikelA, soll: 2, sort: 0 },
      { id: "sp-b", fahrzeugId, fachLabel: "B", artikelId: artikelB, soll: 3, sort: 1 },
    ]).run();

    const erg = await mitPfaden(
      () => templateAusFahrzeug({ fahrzeugId, name: "Kopie", verknuepfen: false }, t.db),
      fahrzeugId,
    );
    const templateId = wertVon<{ id: string }>(erg).id;

    expect(t.db.select().from(templatePositionen)
      .where(eq(templatePositionen.templateId, templateId)).all()).toHaveLength(2);
    expect(t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, fahrzeugId)).get()?.templateId).toBeNull();
    expect(positionenFuer(fahrzeugId).map((row) => ({
      id: row.id,
      templatePositionId: row.templatePositionId,
    })).sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: "sp-a", templatePositionId: null },
      { id: "sp-b", templatePositionId: null },
    ]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestDb } from "./_db/testdb";
import { migrierteTestDb } from "./_db/testdb";
import { aufgaben, personen, type AufgabeRow, type PersonRow, type Rolle } from "./_db/schema";
import { aufgabe, schreibeVerlauf, verlaufFuer } from "./_db/queries";

/*
 * DASSELBE PRUEFSTAND-MUSTER WIE `_lib/zugang.test.ts` (echte In-Memory-DB ueber
 * `migrierteTestDb()`, `next/navigation`/`@/core/auth` als Spione) — NICHT das aus
 * `feedback/actions.test.ts` (dort mit `vi.hoisted` + `vi.resetModules()`, weil dortige Actions
 * Modul-Singletons wie Ratelimiter tragen; diese Datei hat keine, ein einfacher `let`-Spion
 * genuegt, wie `zugang.test.ts` es vormacht). `revalidatePathMock` ist der EINE Fall, der eine
 * Aufrufzaehlung braucht, deshalb `vi.hoisted` NUR fuer ihn.
 */
const { revalidatePathMock } = vi.hoisted(() => ({ revalidatePathMock: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));

let t: TestDb;
vi.mock("./_db/client", () => ({ getDb: () => t.db }));

import {
  aufgabeEinstellenAction,
  umverteilenAction,
  verteilenAction,
  zurueckziehenAction,
} from "./actions";
import type { FormState } from "./_lib/formState";

/**
 * HEUTE IST EIN FESTES DATUM, KEIN "je nach Testlauf" — die Actions ermitteln `heute` selbst ueber
 * `isoTag(new Date())` (Brief: "an genau einer Stelle je Action"), nicht ueber einen Parameter wie
 * `uebergang()`. Ohne gefaelschte Systemzeit haengten `aktivVon`/`aktivBis`-Fixturen am
 * tatsaechlichen Kalendertag des Testlaufs — hier stattdessen fest verankert.
 */
const HEUTE = "2026-08-13";

beforeEach(() => {
  t = migrierteTestDb();
  sitzung = null;
  revalidatePathMock.mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${HEUTE}T12:00:00Z`));
});
afterEach(() => {
  vi.useRealTimers();
  t.schliessen();
});

function legePerson(sub: string, rolle: Rolle, extra: Partial<PersonRow> = {}): PersonRow {
  return t.db
    .insert(personen)
    .values({
      sub,
      name: extra.name ?? sub,
      initialen: extra.initialen ?? sub.slice(0, 2).toUpperCase(),
      rolle,
      aktivVon: extra.aktivVon ?? "2026-01-01",
      aktivBis: extra.aktivBis ?? null,
    })
    .returning()
    .get();
}

function legeAufgabe(extra: Partial<typeof aufgaben.$inferInsert>): AufgabeRow {
  return t.db
    .insert(aufgaben)
    .values({
      titel: "T",
      beschreibung: "B",
      prioritaet: "mittel",
      erstellerId: extra.erstellerId as string,
      status: "eingegangen",
      faelligAm: "2026-08-20",
      dauerMinuten: 60,
      ...extra,
    })
    .returning()
    .get();
}

function anmelden(p: PersonRow): void {
  sitzung = { user: { id: p.sub } };
}

function letzteVerlaufszeile(aufgabeId: string) {
  const historie = verlaufFuer(t.db, aufgabeId);
  return historie[historie.length - 1];
}

function erwarteFeldfehler(ergebnis: FormState): Extract<FormState, { ok: false }> {
  if (ergebnis.ok) throw new Error("erwartet: Feldfehler, bekommen: ok:true");
  return ergebnis;
}

describe("aufgabeEinstellenAction", () => {
  function form(over: Record<string, string> = {}): FormData {
    const f = new FormData();
    f.set("titel", "Verbandskaesten pruefen");
    f.set("beschreibung", "Bestand und Verfallsdaten kontrollieren.");
    f.set("prioritaet", "hoch");
    f.set("faelligAm", "2026-08-20");
    f.set("dauerMinuten", "45");
    for (const [k, v] of Object.entries(over)) f.set(k, v);
    return f;
  }

  it("„Fremdaufgabe einstellen“ legt sie als eingegangen an, mit Pruefer und Verlaufszeile", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    anmelden(auftrag);

    const ergebnis = await aufgabeEinstellenAction({ ok: true }, form());
    expect(ergebnis).toEqual({ ok: true });

    const zeilen = t.db.select().from(aufgaben).all();
    expect(zeilen).toHaveLength(1);
    const neue = zeilen[0]!;
    expect(neue.status).toBe("eingegangen");
    expect(neue.zugewiesenAn).toBeNull();
    expect(neue.istSelbst).toBe(false);
    // DIE INVARIANTE (Brief): eine Fremdaufgabe bekommt den Ersteller als Pruefer.
    expect(neue.prueferId).toBe(auftrag.id);

    const letzte = letzteVerlaufszeile(neue.id)!;
    expect(letzte.ereignis).toBe("eingestellt");
    expect(letzte.akteurId).toBe(auftrag.id);
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/aufgaben", "layout");
  });

  it("„Fuer sich selbst einstellen“ ist direkt verteilt und traegt KEINEN Pruefer", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    anmelden(bufdi);

    const ergebnis = await aufgabeEinstellenAction(
      { ok: true },
      form({ fuerSichSelbst: "true" }),
    );
    expect(ergebnis).toEqual({ ok: true });

    const neue = t.db.select().from(aufgaben).all()[0]!;
    expect(neue.status).toBe("verteilt");
    expect(neue.zugewiesenAn).toBe(bufdi.id);
    expect(neue.istSelbst).toBe(true);
    // DIE INVARIANTE, SPIEGELVERKEHRT: eine Selbstaufgabe bekommt KEINEN Pruefer.
    expect(neue.prueferId).toBeNull();

    const letzte = letzteVerlaufszeile(neue.id)!;
    expect(letzte.ereignis).toBe("eingestellt");
    expect(letzte.akteurId).toBe(bufdi.id);
  });

  it("ein leerer Titel kommt als Feldfehler zurueck, die restlichen Eingaben bleiben stehen", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    anmelden(auftrag);

    const ergebnis = erwarteFeldfehler(await aufgabeEinstellenAction({ ok: true }, form({ titel: "   " })));
    expect(ergebnis.fieldErrors.titel).toBeTruthy();
    expect(ergebnis.values.beschreibung).toBe("Bestand und Verfallsdaten kontrollieren.");
    expect(t.db.select().from(aufgaben).all()).toHaveLength(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("eine leere Erklaerung kommt als Feldfehler zurueck", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    anmelden(auftrag);

    const ergebnis = erwarteFeldfehler(
      await aufgabeEinstellenAction({ ok: true }, form({ beschreibung: "  " })),
    );
    expect(ergebnis.fieldErrors.beschreibung).toBeTruthy();
    expect(ergebnis.values.titel).toBe("Verbandskaesten pruefen");
    expect(t.db.select().from(aufgaben).all()).toHaveLength(0);
  });

  it("ein ungueltiger ISO-Tag bei faelligAm kommt als Feldfehler zurueck", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    anmelden(auftrag);

    const ergebnis = erwarteFeldfehler(
      await aufgabeEinstellenAction({ ok: true }, form({ faelligAm: "20.08.2026" })),
    );
    expect(ergebnis.fieldErrors.faelligAm).toBeTruthy();
    expect(ergebnis.values.faelligAm).toBe("20.08.2026");
    expect(t.db.select().from(aufgaben).all()).toHaveLength(0);
  });

  it("dauerMinuten <= 0 kommt als Feldfehler zurueck", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    anmelden(auftrag);

    const ergebnis = erwarteFeldfehler(
      await aufgabeEinstellenAction({ ok: true }, form({ dauerMinuten: "0" })),
    );
    expect(ergebnis.fieldErrors.dauerMinuten).toBeTruthy();
    expect(ergebnis.values.dauerMinuten).toBe("0");
    expect(t.db.select().from(aufgaben).all()).toHaveLength(0);
  });

  it("dauerMinuten als Nicht-Zahl kommt als Feldfehler zurueck", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    anmelden(auftrag);

    const ergebnis = erwarteFeldfehler(
      await aufgabeEinstellenAction({ ok: true }, form({ dauerMinuten: "abc" })),
    );
    expect(ergebnis.fieldErrors.dauerMinuten).toBeTruthy();
    expect(ergebnis.values.dauerMinuten).toBe("abc");
  });

  it("eine ungueltige Uhrzeit bei faelligUhrzeit kommt als Feldfehler zurueck", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    anmelden(auftrag);

    const ergebnis = erwarteFeldfehler(
      await aufgabeEinstellenAction({ ok: true }, form({ faelligUhrzeit: "9 Uhr" })),
    );
    expect(ergebnis.fieldErrors.faelligUhrzeit).toBeTruthy();
    expect(ergebnis.values.faelligUhrzeit).toBe("9 Uhr");
  });

  it("eine manipulierte Prioritaet wirft, statt als Feldfehler zurueckzukommen", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    anmelden(auftrag);

    await expect(
      aufgabeEinstellenAction({ ok: true }, form({ prioritaet: "dringend" })),
    ).rejects.toThrow(/Unbekannte Prioritaet/);
    expect(t.db.select().from(aufgaben).all()).toHaveLength(0);
  });

  it("eine Rolle ohne Berechtigung wirft — eine BuFDi darf nicht fuer andere einstellen", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    anmelden(bufdi);

    // Muster statt bloss "irgendein Wurf" (Review Fix-Runde 1, Punkt 6): sonst waere ein Wurf aus
    // einem ANDEREN Grund (z. B. eine kaputte Fixtur, die personFuerSession in notFound() laufen
    // laesst) ebenfalls gruen, obwohl er nichts ueber die gepruefte Zusage aussagt.
    await expect(aufgabeEinstellenAction({ ok: true }, form())).rejects.toThrow(
      /Auftraggeber oder die Koordination/,
    );
    expect(t.db.select().from(aufgaben).all()).toHaveLength(0);
  });

  it("eine ausgeschiedene Person, die es duerfte, wenn sie aktiv waere, wirft (fuer andere)", async () => {
    const exAuftrag = legePerson("dev:ex-auftrag@test", "auftrag", { aktivBis: "2026-08-01" });
    anmelden(exAuftrag);

    await expect(aufgabeEinstellenAction({ ok: true }, form())).rejects.toThrow(
      /Auftraggeber oder die Koordination/,
    );
    expect(t.db.select().from(aufgaben).all()).toHaveLength(0);
  });

  it("eine ausgeschiedene Person kann sich auch fuer sich selbst keine Aufgabe mehr einstellen", async () => {
    const exBufdi = legePerson("dev:ex-bufdi@test", "bufdi", { aktivBis: "2026-08-01" });
    anmelden(exBufdi);

    await expect(
      aufgabeEinstellenAction({ ok: true }, form({ fuerSichSelbst: "true" })),
    ).rejects.toThrow(/ausgeschiedene Person kann sich keine neue Aufgabe/);
    expect(t.db.select().from(aufgaben).all()).toHaveLength(0);
  });
});

describe("verteilenAction", () => {
  function form(aufgabeId: string, over: Record<string, string> = {}): FormData {
    const f = new FormData();
    f.set("aufgabeId", aufgabeId);
    for (const [k, v] of Object.entries(over)) f.set(k, v);
    return f;
  }

  it("verteilt eine eingegangene Aufgabe an eine aktive BuFDi, mit Zeitvorschlag und Verlaufszeile", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const koordination = legePerson("dev:rike@test", "koordination");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id });
    anmelden(koordination);

    const ergebnis = await verteilenAction(
      { ok: true },
      form(task.id, { zielId: bufdi.id, vorschlagDatum: "2026-08-14", vorschlagUhrzeit: "09:00" }),
    );
    expect(ergebnis).toEqual({ ok: true });

    const nachher = aufgabe(t.db, task.id)!;
    expect(nachher.status).toBe("verteilt");
    expect(nachher.zugewiesenAn).toBe(bufdi.id);
    expect(nachher.vorschlagDatum).toBe("2026-08-14");
    expect(nachher.vorschlagUhrzeit).toBe("09:00");

    const letzte = letzteVerlaufszeile(task.id)!;
    expect(letzte.ereignis).toBe("verteilt");
    expect(letzte.akteurId).toBe(koordination.id);
    // DER VERLAUF IST DIE LEISTUNGSDOKUMENTATION (Spec §6) — die notiz ist kein Beiwerk (Review
    // Fix-Runde 1, Punkt 5).
    expect(letzte.notiz).toBe("Vorschlag: 2026-08-14 09:00");
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/aufgaben", "layout");
  });

  it("eine unbekannte Zielperson kommt als Feldfehler zurueck, die Aufgabe bleibt eingegangen", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const koordination = legePerson("dev:rike@test", "koordination");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id });
    anmelden(koordination);

    const ergebnis = erwarteFeldfehler(
      await verteilenAction({ ok: true }, form(task.id, { zielId: "nicht-vorhanden" })),
    );
    expect(ergebnis.fieldErrors.zielId).toBeTruthy();
    expect(ergebnis.values.zielId).toBe("nicht-vorhanden");
    expect(ergebnis.values.aufgabeId).toBe(task.id);
    expect(aufgabe(t.db, task.id)!.status).toBe("eingegangen");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("eine INAKTIVE BuFDi als Ziel kommt als Feldfehler zurueck, auch wenn sie sonst passt", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const koordination = legePerson("dev:rike@test", "koordination");
    const inaktiv = legePerson("dev:doerte@test", "bufdi", { aktivBis: "2026-08-01" });
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id });
    anmelden(koordination);

    const ergebnis = erwarteFeldfehler(
      await verteilenAction({ ok: true }, form(task.id, { zielId: inaktiv.id })),
    );
    expect(ergebnis.fieldErrors.zielId).toBeTruthy();
    expect(ergebnis.values.zielId).toBe(inaktiv.id);
    expect(aufgabe(t.db, task.id)!.status).toBe("eingegangen");
  });

  it("eine aktive Nicht-BuFDi-Person als Ziel kommt als Feldfehler zurueck", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const koordination = legePerson("dev:rike@test", "koordination");
    const anderer = legePerson("dev:tomke@test", "auftrag");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id });
    anmelden(koordination);

    const ergebnis = erwarteFeldfehler(
      await verteilenAction({ ok: true }, form(task.id, { zielId: anderer.id })),
    );
    expect(ergebnis.fieldErrors.zielId).toBeTruthy();
    expect(ergebnis.values.zielId).toBe(anderer.id);
  });

  it("„Ziel ist die Koordination selbst“ wird als Feldfehler abgelehnt — die dritte Uebergabe aus Aufgabe 8", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const koordination = legePerson("dev:rike@test", "koordination");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id });
    anmelden(koordination);

    // Die Koordination ist aktiv und existiert — nur `bufdis()` schliesst sie aus, weil ihre
    // Rolle nicht "bufdi" ist. Ohne diese Pruefung liesse sich hier eine fremd eingestellte
    // Aufgabe an die Koordination SELBST verteilen (istSelbst bliebe false, erstellerId !==
    // zugewiesenAn), und darfFreigeben's zweite Klausel waere die einzige verbleibende Bremse.
    const ergebnis = erwarteFeldfehler(
      await verteilenAction({ ok: true }, form(task.id, { zielId: koordination.id })),
    );
    expect(ergebnis.fieldErrors.zielId).toBeTruthy();
    expect(ergebnis.values.zielId).toBe(koordination.id);
    const nachher = aufgabe(t.db, task.id)!;
    expect(nachher.status).toBe("eingegangen");
    expect(nachher.zugewiesenAn).toBeNull();
  });

  it("eine Rolle ohne Berechtigung wirft — auftrag darf nicht verteilen", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id });
    anmelden(auftrag);

    await expect(verteilenAction({ ok: true }, form(task.id, { zielId: bufdi.id }))).rejects.toThrow(
      /darf die Aktion "verteilen"/,
    );
    expect(aufgabe(t.db, task.id)!.status).toBe("eingegangen");
  });

  it("eine ausgeschiedene Koordination, die es duerfte, wenn sie aktiv waere, wirft", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const exKoordination = legePerson("dev:ex-rike@test", "koordination", { aktivBis: "2026-08-01" });
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id });
    anmelden(exKoordination);

    await expect(
      verteilenAction({ ok: true }, form(task.id, { zielId: bufdi.id })),
    ).rejects.toThrow(/darf die Aktion "verteilen"/);
    expect(aufgabe(t.db, task.id)!.status).toBe("eingegangen");
  });

  it("eine bereits verteilte Aufgabe wird nicht ueber verteilenAction erneut verteilt", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const koordination = legePerson("dev:rike@test", "koordination");
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const task = legeAufgabe({
      erstellerId: auftrag.id,
      prueferId: auftrag.id,
      status: "verteilt",
      zugewiesenAn: bufdi1.id,
    });
    anmelden(koordination);

    await expect(
      verteilenAction({ ok: true }, form(task.id, { zielId: bufdi2.id })),
    ).rejects.toThrow(/Aktion "verteilen" ist im Zustand "verteilt" nicht vorgesehen/);
    expect(aufgabe(t.db, task.id)!.zugewiesenAn).toBe(bufdi1.id);
  });
});

describe("umverteilenAction", () => {
  function form(aufgabeId: string, over: Record<string, string> = {}): FormData {
    const f = new FormData();
    f.set("aufgabeId", aufgabeId);
    for (const [k, v] of Object.entries(over)) f.set(k, v);
    return f;
  }

  /**
   * Planung mit NICHT-Null-`planRang`, sonst wuerde eine Gegenprobe die Leerung nicht sehen
   * koennen — UND ein stehengebliebener Zeitvorschlag aus der vorherigen Verteilung
   * (`vorschlagDatum`/`vorschlagUhrzeit`), sonst waere derselbe blinde Fleck bei einer Spalte
   * weiter offen (Review Fix-Runde 1, Punkt 1): ohne diesen stehenden Vorschlag koennte eine
   * konditionale Variante der Leerung ("nur schreiben, wenn ein neuer Vorschlag mitkommt") die
   * Suite nicht rot machen, weil es nichts zu loeschen gaebe.
   */
  function verteilteAufgabeMitPlanung(erstellerId: string, prueferId: string, zugewiesenAn: string) {
    return legeAufgabe({
      erstellerId,
      prueferId,
      status: "verteilt",
      zugewiesenAn,
      planDatum: "2026-08-17",
      planUhrzeit: "10:00",
      planRang: 3,
      vorschlagDatum: "2026-08-10",
      vorschlagUhrzeit: "08:00",
    });
  }

  it("verteilt eine verteilte Aufgabe an eine andere aktive BuFDi und raeumt die Planung", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const koordination = legePerson("dev:rike@test", "koordination");
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const task = verteilteAufgabeMitPlanung(auftrag.id, auftrag.id, bufdi1.id);
    anmelden(koordination);

    const ergebnis = await umverteilenAction({ ok: true }, form(task.id, { zielId: bufdi2.id }));
    expect(ergebnis).toEqual({ ok: true });

    const nachher = aufgabe(t.db, task.id)!;
    expect(nachher.status).toBe("verteilt");
    expect(nachher.zugewiesenAn).toBe(bufdi2.id);
    // DIE GERAEUMTE PLANUNG (Spec §5.2, "Regel 3") — NACHGELESEN, NICHT BEHAUPTET.
    expect(nachher.planDatum).toBeNull();
    expect(nachher.planUhrzeit).toBeNull();
    expect(nachher.planRang).toBe(0);
    // DER ALTE ZEITVORSCHLAG GALT DER VORHERIGEN ZIELPERSON (Review Fix-Runde 1, Punkt 1): ohne
    // neuen Vorschlag im selben Zug wird er geleert, nicht stehen gelassen — sonst zeigte
    // `vorschlagOffen` der NEUEN Person einen Vorschlag an, den nie jemand fuer sie ausgesprochen hat.
    expect(nachher.vorschlagDatum).toBeNull();
    expect(nachher.vorschlagUhrzeit).toBeNull();

    const letzte = letzteVerlaufszeile(task.id)!;
    expect(letzte.ereignis).toBe("umverteilt");
    expect(letzte.akteurId).toBe(koordination.id);
    // KEIN "Vorschlag: …" in der Notiz, weil kein neuer Vorschlag mitkam (Review Fix-Runde 1, Punkt 5).
    expect(letzte.notiz).toBeNull();
  });

  it("ein neuer Zeitvorschlag darf im selben Zug gesetzt werden", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const koordination = legePerson("dev:rike@test", "koordination");
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const task = verteilteAufgabeMitPlanung(auftrag.id, auftrag.id, bufdi1.id);
    anmelden(koordination);

    await umverteilenAction(
      { ok: true },
      form(task.id, { zielId: bufdi2.id, vorschlagDatum: "2026-08-18", vorschlagUhrzeit: "11:00" }),
    );

    const nachher = aufgabe(t.db, task.id)!;
    expect(nachher.vorschlagDatum).toBe("2026-08-18");
    expect(nachher.vorschlagUhrzeit).toBe("11:00");
    expect(letzteVerlaufszeile(task.id)!.notiz).toBe("Vorschlag: 2026-08-18 11:00");
  });

  it("„Ziel ist die Koordination selbst“ wird auch beim Umverteilen als Feldfehler abgelehnt", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const koordination = legePerson("dev:rike@test", "koordination");
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const task = verteilteAufgabeMitPlanung(auftrag.id, auftrag.id, bufdi1.id);
    anmelden(koordination);

    const ergebnis = erwarteFeldfehler(
      await umverteilenAction({ ok: true }, form(task.id, { zielId: koordination.id })),
    );
    expect(ergebnis.fieldErrors.zielId).toBeTruthy();
    expect(ergebnis.values.zielId).toBe(koordination.id);
    const nachher = aufgabe(t.db, task.id)!;
    expect(nachher.zugewiesenAn).toBe(bufdi1.id);
    expect(nachher.planDatum).toBe("2026-08-17"); // unveraendert bei Ablehnung
  });

  it("eine Rolle ohne Berechtigung wirft — auftrag darf nicht umverteilen", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const task = verteilteAufgabeMitPlanung(auftrag.id, auftrag.id, bufdi1.id);
    anmelden(auftrag);

    await expect(
      umverteilenAction({ ok: true }, form(task.id, { zielId: bufdi2.id })),
    ).rejects.toThrow(/darf die Aktion "umverteilen"/);
    expect(aufgabe(t.db, task.id)!.zugewiesenAn).toBe(bufdi1.id);
  });

  it("eine ausgeschiedene Koordination, die es duerfte, wenn sie aktiv waere, wirft", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const exKoordination = legePerson("dev:ex-rike@test", "koordination", { aktivBis: "2026-08-01" });
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const task = verteilteAufgabeMitPlanung(auftrag.id, auftrag.id, bufdi1.id);
    anmelden(exKoordination);

    await expect(
      umverteilenAction({ ok: true }, form(task.id, { zielId: bufdi2.id })),
    ).rejects.toThrow(/darf die Aktion "umverteilen"/);
    expect(aufgabe(t.db, task.id)!.zugewiesenAn).toBe(bufdi1.id);
  });

  it("eine noch eingegangene Aufgabe wird nicht ueber umverteilenAction verteilt", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const koordination = legePerson("dev:rike@test", "koordination");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id });
    anmelden(koordination);

    await expect(
      umverteilenAction({ ok: true }, form(task.id, { zielId: bufdi.id })),
    ).rejects.toThrow(/Aktion "umverteilen" ist im Zustand "eingegangen" nicht vorgesehen/);
    expect(aufgabe(t.db, task.id)!.status).toBe("eingegangen");
  });
});

describe("zurueckziehenAction", () => {
  function form(aufgabeId: string): FormData {
    const f = new FormData();
    f.set("aufgabeId", aufgabeId);
    return f;
  }

  it("der Ersteller zieht eine eingegangene Aufgabe zurueck — sie wird samt Verlauf geloescht", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const task = legeAufgabe({ erstellerId: auftrag.id });
    schreibeVerlauf(t.db, { aufgabeId: task.id, ereignis: "eingestellt", akteurId: auftrag.id });
    anmelden(auftrag);

    await zurueckziehenAction(form(task.id));

    expect(aufgabe(t.db, task.id)).toBeNull();
    expect(verlaufFuer(t.db, task.id)).toEqual([]); // Kaskade
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/aufgaben", "layout");
  });

  it("die Koordination kann eine fremde eingegangene Aufgabe ebenfalls zurueckziehen", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const koordination = legePerson("dev:rike@test", "koordination");
    const task = legeAufgabe({ erstellerId: auftrag.id });
    anmelden(koordination);

    await zurueckziehenAction(form(task.id));

    expect(aufgabe(t.db, task.id)).toBeNull();
  });

  it("eine unbeteiligte BuFDi darf nicht zurueckziehen", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id });
    anmelden(bufdi);

    await expect(zurueckziehenAction(form(task.id))).rejects.toThrow(
      /Nur die Erstellerin bzw. der Ersteller oder die Koordination/,
    );
    expect(aufgabe(t.db, task.id)).not.toBeNull();
  });

  it("ein ausgeschiedener Ersteller, der es duerfte, wenn er aktiv waere, wirft", async () => {
    const exAuftrag = legePerson("dev:ex-malte@test", "auftrag", { aktivBis: "2026-08-01" });
    const task = legeAufgabe({ erstellerId: exAuftrag.id });
    anmelden(exAuftrag);

    await expect(zurueckziehenAction(form(task.id))).rejects.toThrow(
      /Nur die Erstellerin bzw. der Ersteller oder die Koordination/,
    );
    expect(aufgabe(t.db, task.id)).not.toBeNull();
  });

  it.each(["verteilt", "in_arbeit", "freigabe_offen", "abgeschlossen", "zurueckgewiesen"] as const)(
    "zurueckziehen aus dem Zustand %s wird abgelehnt — hat bereits eine Geschichte",
    async (status) => {
      const auftrag = legePerson("dev:malte@test", "auftrag");
      const bufdi = legePerson("dev:alina@test", "bufdi");
      const task = legeAufgabe({
        erstellerId: auftrag.id,
        prueferId: auftrag.id,
        zugewiesenAn: bufdi.id,
        status,
      });
      anmelden(auftrag);

      await expect(zurueckziehenAction(form(task.id))).rejects.toThrow(
        /Zurueckziehen ist nur aus dem Zustand "eingegangen" moeglich/,
      );
      expect(aufgabe(t.db, task.id)).not.toBeNull();
    },
  );

  it("eine unbekannte aufgabeId wirft", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    anmelden(auftrag);

    await expect(zurueckziehenAction(form("nicht-vorhanden"))).rejects.toThrow(
      /nicht gefunden/,
    );
  });
});

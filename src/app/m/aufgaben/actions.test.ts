import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestDb } from "./_db/testdb";
import { migrierteTestDb } from "./_db/testdb";
import { aufgaben, nachweise, personen, type AufgabeRow, type PersonRow, type Rolle } from "./_db/schema";
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
  einplanenAction,
  fertigMeldenAction,
  freigebenAction,
  startenAction,
  umverteilenAction,
  verteilenAction,
  wiederaufnehmenAction,
  zurueckziehenAction,
  zurueckweisenAction,
  zuruecksetzenAction,
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

/*
 * AB HIER AUFGABE 10 — DIE RESTLICHEN SIEBEN UEBERGAENGE.
 */

function legeNachweis(
  aufgabeId: string,
  art: "text" | "bild",
  erstelltVon: string,
  text: string | null = null,
) {
  return t.db.insert(nachweise).values({ aufgabeId, art, text, erstelltVon }).returning().get();
}

describe("startenAction", () => {
  function form(aufgabeId: string): FormData {
    const f = new FormData();
    f.set("aufgabeId", aufgabeId);
    return f;
  }

  it("der zugewiesene BuFDi startet eine verteilte Aufgabe — sie wird in_arbeit, mit Verlaufszeile", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id });
    anmelden(bufdi);

    await startenAction(form(task.id));

    expect(aufgabe(t.db, task.id)!.status).toBe("in_arbeit");
    const letzte = letzteVerlaufszeile(task.id)!;
    expect(letzte.ereignis).toBe("gestartet");
    expect(letzte.akteurId).toBe(bufdi.id);
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/aufgaben", "layout");
  });

  it("eine unbeteiligte BuFDi darf eine fremd zugewiesene Aufgabe nicht starten", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi1.id });
    anmelden(bufdi2);

    await expect(startenAction(form(task.id))).rejects.toThrow(/darf die Aktion "starten"/);
    expect(aufgabe(t.db, task.id)!.status).toBe("verteilt");
  });

  it("eine ausgeschiedene BuFDi, die es duerfte, wenn sie aktiv waere, wirft", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const exBufdi = legePerson("dev:ex-alina@test", "bufdi", { aktivBis: "2026-08-01" });
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: exBufdi.id });
    anmelden(exBufdi);

    await expect(startenAction(form(task.id))).rejects.toThrow(/darf die Aktion "starten"/);
    expect(aufgabe(t.db, task.id)!.status).toBe("verteilt");
  });

  it("aus dem Zustand eingegangen wird nicht gestartet", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id });
    anmelden(bufdi);

    await expect(startenAction(form(task.id))).rejects.toThrow(
      /Aktion "starten" ist im Zustand "eingegangen" nicht vorgesehen/,
    );
  });

  it("eine unbekannte aufgabeId wirft", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    anmelden(bufdi);

    await expect(startenAction(form("nicht-vorhanden"))).rejects.toThrow(/nicht gefunden/);
  });
});

describe("zuruecksetzenAction", () => {
  function form(aufgabeId: string): FormData {
    const f = new FormData();
    f.set("aufgabeId", aufgabeId);
    return f;
  }

  it("der zugewiesene BuFDi setzt eine begonnene Aufgabe zurueck — sie wird wieder verteilt", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id });
    anmelden(bufdi);

    await zuruecksetzenAction(form(task.id));

    expect(aufgabe(t.db, task.id)!.status).toBe("verteilt");
    const letzte = letzteVerlaufszeile(task.id)!;
    expect(letzte.ereignis).toBe("zurueckgesetzt");
    expect(letzte.akteurId).toBe(bufdi.id);
  });

  it("eine unbeteiligte BuFDi darf nicht zuruecksetzen", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi1.id });
    anmelden(bufdi2);

    await expect(zuruecksetzenAction(form(task.id))).rejects.toThrow(/darf die Aktion "zuruecksetzen"/);
    expect(aufgabe(t.db, task.id)!.status).toBe("in_arbeit");
  });

  it("eine ausgeschiedene BuFDi, die es duerfte, wenn sie aktiv waere, wirft", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const exBufdi = legePerson("dev:ex-alina@test", "bufdi", { aktivBis: "2026-08-01" });
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: exBufdi.id });
    anmelden(exBufdi);

    await expect(zuruecksetzenAction(form(task.id))).rejects.toThrow(/darf die Aktion "zuruecksetzen"/);
  });
});

describe("einplanenAction", () => {
  function form(aufgabeId: string, over: Record<string, string> = {}): FormData {
    const f = new FormData();
    f.set("aufgabeId", aufgabeId);
    for (const [k, v] of Object.entries(over)) f.set(k, v);
    return f;
  }

  it("der zugewiesene BuFDi plant eine Aufgabe in einen leeren Tag — planRang 0, Verlaufszeile „Eingeplant“", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id });
    anmelden(bufdi);

    const ergebnis = await einplanenAction({ ok: true }, form(task.id, { planDatum: "2026-08-17", planUhrzeit: "09:30" }));
    expect(ergebnis).toEqual({ ok: true });

    const nachher = aufgabe(t.db, task.id)!;
    expect(nachher.planDatum).toBe("2026-08-17");
    expect(nachher.planUhrzeit).toBe("09:30");
    expect(nachher.planRang).toBe(0);

    const letzte = letzteVerlaufszeile(task.id)!;
    expect(letzte.ereignis).toBe("eingeplant");
    expect(letzte.notiz).toBe("Eingeplant: 2026-08-17 09:30");
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/aufgaben", "layout");
  });

  /**
   * SPEC-NACHTRAG VOM 2026-08-13 (Betreiberentscheidung, `72ef235`): `in_arbeit` ist jetzt ein
   * zulaessiger Ausgangszustand fuer `einplanen`. Der Widerspruch, den diese Aufgabe gemeldet hatte,
   * ist damit aufgeloest — `_lib/tagesplan.ts` zeigt eine `in_arbeit`-Aufgabe mit `planDatum`
   * regulaer in der Tagesspalte, und jetzt kann sie auch verschoben werden, ohne erst zurueckgesetzt
   * werden zu muessen.
   */
  it("eine Aufgabe in in_arbeit wird verschoben — bleibt in_arbeit, der Verlauf haelt es fest", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({
      erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id,
      planDatum: "2026-08-14", planUhrzeit: "10:00", planRang: 0,
    });
    anmelden(bufdi);

    const ergebnis = await einplanenAction({ ok: true }, form(task.id, { planDatum: "2026-08-17" }));
    expect(ergebnis).toEqual({ ok: true });

    const nachher = aufgabe(t.db, task.id)!;
    expect(nachher.status).toBe("in_arbeit");
    expect(nachher.planDatum).toBe("2026-08-17");

    const letzte = letzteVerlaufszeile(task.id)!;
    expect(letzte.ereignis).toBe("eingeplant");
    expect(letzte.notiz).toBe("Eingeplant: 2026-08-17");
  });

  it("eine zweite Aufgabe am selben Tag derselben Person wird ANS ENDE gehaengt (planRang = max+1)", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id, planDatum: "2026-08-17", planRang: 0 });
    legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id, planDatum: "2026-08-17", planRang: 2 });
    const neue = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id });
    anmelden(bufdi);

    await einplanenAction({ ok: true }, form(neue.id, { planDatum: "2026-08-17" }));

    expect(aufgabe(t.db, neue.id)!.planRang).toBe(3);
  });

  /**
   * DIE GEGENPROBE ZUR PLANRANG-ENTSCHEIDUNG (Brief + Beratung): ohne die "gleicher Tag behaelt
   * seinen Rang"-Ausnahme wuerde ein zweites `einplanen` auf denselben Tag (z. B. nur die Uhrzeit
   * korrigieren) die Aufgabe ERNEUT ans Ende haengen, weil die Abfrage die eigene, bereits am
   * Zieltag liegende Zeile mitzaehlt. Dieser Test faellt genau dann rot, wenn diese Ausnahme fehlt.
   */
  it("ein erneutes Einplanen auf DENSELBEN Tag behaelt den bisherigen planRang (keine Neusortierung)", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    // Zwei Aufgaben am selben Tag; "erste" hat den niedrigeren Rang und liegt VOR "zweite".
    const erste = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id, planDatum: "2026-08-17", planRang: 0 });
    legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id, planDatum: "2026-08-17", planRang: 1 });
    anmelden(bufdi);

    // "erste" wird NOCH EINMAL fuer denselben Tag eingeplant, nur mit einer anderen Uhrzeit.
    await einplanenAction({ ok: true }, form(erste.id, { planDatum: "2026-08-17", planUhrzeit: "14:00" }));

    // Der Rang bleibt 0 — "erste" haengt NICHT hinter "zweite" (Rang 1).
    expect(aufgabe(t.db, erste.id)!.planRang).toBe(0);
  });

  it("ein angenommener Zeitvorschlag: Plantag und Uhrzeit stimmen ueberein — Verlaufszeile „Vorschlag angenommen“", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({
      erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id,
      vorschlagDatum: "2026-08-17", vorschlagUhrzeit: "09:00",
    });
    anmelden(bufdi);

    await einplanenAction({ ok: true }, form(task.id, { planDatum: "2026-08-17", planUhrzeit: "09:00" }));

    expect(letzteVerlaufszeile(task.id)!.notiz).toBe("Vorschlag angenommen: 2026-08-17 09:00");
    // DER VORSCHLAG BLEIBT STEHEN (Spec §5.1) — der Verlauf soll belegen koennen, ob angenommen
    // oder abgewichen wurde, deshalb wird er NICHT geleert.
    expect(aufgabe(t.db, task.id)!.vorschlagDatum).toBe("2026-08-17");
  });

  it("ein abweichend eingeplanter Tag — Verlaufszeile „Vorschlag abgewichen“ mit beiden Angaben", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({
      erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id,
      vorschlagDatum: "2026-08-17", vorschlagUhrzeit: "09:00",
    });
    anmelden(bufdi);

    await einplanenAction({ ok: true }, form(task.id, { planDatum: "2026-08-18", planUhrzeit: "11:00" }));

    expect(letzteVerlaufszeile(task.id)!.notiz).toBe(
      "Vorschlag abgewichen — Vorschlag: 2026-08-17 09:00, eingeplant: 2026-08-18 11:00",
    );
  });

  it("ein ungueltiger planDatum kommt als Feldfehler zurueck, die Eingaben bleiben stehen", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id });
    anmelden(bufdi);

    const ergebnis = erwarteFeldfehler(
      await einplanenAction({ ok: true }, form(task.id, { planDatum: "17.08.2026" })),
    );
    expect(ergebnis.fieldErrors.planDatum).toBeTruthy();
    expect(ergebnis.values.planDatum).toBe("17.08.2026");
    expect(aufgabe(t.db, task.id)!.planDatum).toBeNull();
  });

  it("eine ungueltige planUhrzeit kommt als Feldfehler zurueck", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id });
    anmelden(bufdi);

    const ergebnis = erwarteFeldfehler(
      await einplanenAction({ ok: true }, form(task.id, { planDatum: "2026-08-17", planUhrzeit: "9 Uhr" })),
    );
    expect(ergebnis.fieldErrors.planUhrzeit).toBeTruthy();
    expect(aufgabe(t.db, task.id)!.planDatum).toBeNull();
  });

  it("die Koordination darf keinen fremden Plan aendern, obwohl sie sonst fast alles darf", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const koordination = legePerson("dev:rike@test", "koordination");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id });
    anmelden(koordination);

    await expect(
      einplanenAction({ ok: true }, form(task.id, { planDatum: "2026-08-17" })),
    ).rejects.toThrow(/darf die Aktion "einplanen"/);
    expect(aufgabe(t.db, task.id)!.planDatum).toBeNull();
  });

  it("eine unbeteiligte BuFDi darf den Plan einer anderen nicht aendern", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi1.id });
    anmelden(bufdi2);

    await expect(
      einplanenAction({ ok: true }, form(task.id, { planDatum: "2026-08-17" })),
    ).rejects.toThrow(/darf die Aktion "einplanen"/);
  });

  it("eine ausgeschiedene BuFDi, die es duerfte, wenn sie aktiv waere, wirft", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const exBufdi = legePerson("dev:ex-alina@test", "bufdi", { aktivBis: "2026-08-01" });
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: exBufdi.id });
    anmelden(exBufdi);

    await expect(
      einplanenAction({ ok: true }, form(task.id, { planDatum: "2026-08-17" })),
    ).rejects.toThrow(/darf die Aktion "einplanen"/);
  });

  it("aus dem Zustand eingegangen wird nicht eingeplant", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id });
    anmelden(bufdi);

    await expect(
      einplanenAction({ ok: true }, form(task.id, { planDatum: "2026-08-17" })),
    ).rejects.toThrow(/Aktion "einplanen" ist im Zustand "eingegangen" nicht vorgesehen/);
  });
});

describe("fertigMeldenAction", () => {
  function form(aufgabeId: string, over: Record<string, string> = {}): FormData {
    const f = new FormData();
    f.set("aufgabeId", aufgabeId);
    for (const [k, v] of Object.entries(over)) f.set(k, v);
    return f;
  }

  it("eine Fremdaufgabe ohne Nachweispflicht landet auf freigabe_offen, Ereignis fertig_gemeldet", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({
      erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id,
      nachweisPflicht: false,
    });
    anmelden(bufdi);

    const ergebnis = await fertigMeldenAction({ ok: true }, form(task.id));
    expect(ergebnis).toEqual({ ok: true });

    expect(aufgabe(t.db, task.id)!.status).toBe("freigabe_offen");
    const letzte = letzteVerlaufszeile(task.id)!;
    expect(letzte.ereignis).toBe("fertig_gemeldet");
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/aufgaben", "layout");
  });

  it("eine Selbstaufgabe geht die Kurzstrecke: fertig melden landet DIREKT auf abgeschlossen", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({
      erstellerId: bufdi.id, status: "in_arbeit", zugewiesenAn: bufdi.id, istSelbst: true, prueferId: null,
      nachweisPflicht: false,
    });
    anmelden(bufdi);

    const ergebnis = await fertigMeldenAction({ ok: true }, form(task.id));
    expect(ergebnis).toEqual({ ok: true });

    expect(aufgabe(t.db, task.id)!.status).toBe("abgeschlossen");
    // ERGEBNIS AUS `uebergang()` UEBERNOMMEN, NICHT `istSelbst` erneut abgefragt (Brief): dasselbe
    // Vokabular wie bei `freigebenAction` -- "derselbe Endzustand, zwei Wege dorthin".
    expect(letzteVerlaufszeile(task.id)!.ereignis).toBe("abgeschlossen");
  });

  it("Nachweispflicht Text: fertig melden OHNE Text wird als Feldfehler abgelehnt", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({
      erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id,
      nachweisPflicht: true, nachweisArt: "text",
    });
    anmelden(bufdi);

    const ergebnis = erwarteFeldfehler(await fertigMeldenAction({ ok: true }, form(task.id)));
    expect(ergebnis.fieldErrors.nachweisText).toBeTruthy();
    expect(aufgabe(t.db, task.id)!.status).toBe("in_arbeit");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("Nachweispflicht Text: fertig melden MIT Text geht durch und schreibt den Nachweis", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({
      erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id,
      nachweisPflicht: true, nachweisArt: "text",
    });
    anmelden(bufdi);

    const ergebnis = await fertigMeldenAction({ ok: true }, form(task.id, { nachweisText: "Bestand kontrolliert, alles vollstaendig." }));
    expect(ergebnis).toEqual({ ok: true });
    expect(aufgabe(t.db, task.id)!.status).toBe("freigabe_offen");

    const nachweise_ = t.db.select().from(nachweise).all();
    expect(nachweise_).toHaveLength(1);
    expect(nachweise_[0]!.art).toBe("text");
    expect(nachweise_[0]!.text).toBe("Bestand kontrolliert, alles vollstaendig.");
    expect(nachweise_[0]!.erstelltVon).toBe(bufdi.id);
  });

  it("Nachweispflicht Bild: fertig melden OHNE Bild wird abgelehnt, auch wenn Text vorhanden ist — die Untergrenzen-Regel", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({
      erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id,
      nachweisPflicht: true, nachweisArt: "bild",
    });
    anmelden(bufdi);

    const ergebnis = erwarteFeldfehler(
      await fertigMeldenAction({ ok: true }, form(task.id, { nachweisText: "Text ist da, aber kein Bild." })),
    );
    expect(ergebnis.fieldErrors.nachweis).toBeTruthy();
    expect(aufgabe(t.db, task.id)!.status).toBe("in_arbeit");
    // KEIN NACHWEIS GESCHRIEBEN — die Ablehnung kommt VOR dem Schreiben.
    expect(t.db.select().from(nachweise).all()).toHaveLength(0);
  });

  it("Nachweispflicht Bild: ein vorhandener Bild-Nachweis reicht auch OHNE Text", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({
      erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id,
      nachweisPflicht: true, nachweisArt: "bild",
    });
    legeNachweis(task.id, "bild", bufdi.id);
    anmelden(bufdi);

    const ergebnis = await fertigMeldenAction({ ok: true }, form(task.id));
    expect(ergebnis).toEqual({ ok: true });
    expect(aufgabe(t.db, task.id)!.status).toBe("freigabe_offen");
  });

  it("eine unbeteiligte BuFDi darf eine fremd zugewiesene Aufgabe nicht fertig melden", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi1.id });
    anmelden(bufdi2);

    await expect(fertigMeldenAction({ ok: true }, form(task.id))).rejects.toThrow(/darf die Aktion "fertig"/);
  });

  it("eine ausgeschiedene BuFDi, die es duerfte, wenn sie aktiv waere, wirft", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const exBufdi = legePerson("dev:ex-alina@test", "bufdi", { aktivBis: "2026-08-01" });
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: exBufdi.id });
    anmelden(exBufdi);

    await expect(fertigMeldenAction({ ok: true }, form(task.id))).rejects.toThrow(/darf die Aktion "fertig"/);
  });
});

describe("freigebenAction", () => {
  function form(aufgabeId: string): FormData {
    const f = new FormData();
    f.set("aufgabeId", aufgabeId);
    return f;
  }

  it("der eingetragene Pruefer gibt frei — abgeschlossen, KEINE Vertretungsnotiz", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "freigabe_offen", zugewiesenAn: bufdi.id });
    anmelden(auftrag);

    await freigebenAction(form(task.id));

    expect(aufgabe(t.db, task.id)!.status).toBe("abgeschlossen");
    const letzte = letzteVerlaufszeile(task.id)!;
    expect(letzte.ereignis).toBe("abgeschlossen");
    expect(letzte.akteurId).toBe(auftrag.id);
    expect(letzte.notiz).toBeNull();
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/aufgaben", "layout");
  });

  it("die Koordination gibt IN VERTRETUNG frei — die Verlaufszeile nennt Vertretung UND den regulaeren Pruefer", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const koordination = legePerson("dev:rike@test", "koordination");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "freigabe_offen", zugewiesenAn: bufdi.id });
    anmelden(koordination);

    await freigebenAction(form(task.id));

    expect(aufgabe(t.db, task.id)!.status).toBe("abgeschlossen");
    const letzte = letzteVerlaufszeile(task.id)!;
    expect(letzte.akteurId).toBe(koordination.id);
    // DER REGULAERE PRUEFER DANEBEN GESTELLT (Brief): dessen Zeile (siehe Test oben) hat KEINE
    // Notiz, diese hier NENNT die Vertretung und den Namen des regulaeren Pruefers.
    expect(letzte.notiz).toBe(`Freigegeben von ${koordination.name} in Vertretung für ${auftrag.name}`);
  });

  it("der zugewiesene BuFDi darf die eigene Aufgabe nicht freigeben, selbst wenn er als Pruefer eingetragen ist", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: bufdi.id, status: "freigabe_offen", zugewiesenAn: bufdi.id });
    anmelden(bufdi);

    await expect(freigebenAction(form(task.id))).rejects.toThrow(/darf die Aktion "freigeben"/);
    expect(aufgabe(t.db, task.id)!.status).toBe("freigabe_offen");
  });

  it("eine unbeteiligte BuFDi darf nicht freigeben", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "freigabe_offen", zugewiesenAn: bufdi1.id });
    anmelden(bufdi2);

    await expect(freigebenAction(form(task.id))).rejects.toThrow(/darf die Aktion "freigeben"/);
  });

  it("eine ausgeschiedene Koordination, die es duerfte, wenn sie aktiv waere, wirft", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const exKoordination = legePerson("dev:ex-rike@test", "koordination", { aktivBis: "2026-08-01" });
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "freigabe_offen", zugewiesenAn: bufdi.id });
    anmelden(exKoordination);

    await expect(freigebenAction(form(task.id))).rejects.toThrow(/darf die Aktion "freigeben"/);
  });

  it("aus dem Zustand in_arbeit wird nicht freigegeben", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id });
    anmelden(auftrag);

    await expect(freigebenAction(form(task.id))).rejects.toThrow(
      /Aktion "freigeben" ist im Zustand "in_arbeit" nicht vorgesehen/,
    );
  });
});

describe("zurueckweisenAction", () => {
  function form(aufgabeId: string, over: Record<string, string> = {}): FormData {
    const f = new FormData();
    f.set("aufgabeId", aufgabeId);
    for (const [k, v] of Object.entries(over)) f.set(k, v);
    return f;
  }

  it("der eingetragene Pruefer weist mit Begruendung zurueck — zurueckgewiesen, Begruendung im Verlauf", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "freigabe_offen", zugewiesenAn: bufdi.id });
    anmelden(auftrag);

    const ergebnis = await zurueckweisenAction(
      { ok: true },
      form(task.id, { begruendung: "Verfallsdaten wurden nicht kontrolliert." }),
    );
    expect(ergebnis).toEqual({ ok: true });

    expect(aufgabe(t.db, task.id)!.status).toBe("zurueckgewiesen");
    const letzte = letzteVerlaufszeile(task.id)!;
    expect(letzte.ereignis).toBe("zurueckgewiesen");
    // DIE BEGRUENDUNG GEHOERT IN DIE VERLAUFSZEILE (Brief): der Verlauf ist die
    // Leistungsdokumentation, nicht nur ein Feld auf der Aufgabe.
    expect(letzte.notiz).toBe("Verfallsdaten wurden nicht kontrolliert.");
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/aufgaben", "layout");
  });

  it("eine leere Begruendung wird als Feldfehler abgelehnt, mit den Eingaben in values", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "freigabe_offen", zugewiesenAn: bufdi.id });
    anmelden(auftrag);

    const ergebnis = erwarteFeldfehler(await zurueckweisenAction({ ok: true }, form(task.id)));
    expect(ergebnis.fieldErrors.begruendung).toBeTruthy();
    expect(ergebnis.values.aufgabeId).toBe(task.id);
    expect(aufgabe(t.db, task.id)!.status).toBe("freigabe_offen");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("eine Begruendung aus nur Leerzeichen wird ebenfalls als Feldfehler abgelehnt", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "freigabe_offen", zugewiesenAn: bufdi.id });
    anmelden(auftrag);

    const ergebnis = erwarteFeldfehler(
      await zurueckweisenAction({ ok: true }, form(task.id, { begruendung: "   " })),
    );
    expect(ergebnis.fieldErrors.begruendung).toBeTruthy();
  });

  it("eine unbeteiligte BuFDi darf nicht zurueckweisen", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "freigabe_offen", zugewiesenAn: bufdi1.id });
    anmelden(bufdi2);

    await expect(
      zurueckweisenAction({ ok: true }, form(task.id, { begruendung: "Nein." })),
    ).rejects.toThrow(/darf die Aktion "zurueckweisen"/);
  });

  it("ein ausgeschiedener Pruefer, der es duerfte, wenn er aktiv waere, wirft", async () => {
    const exAuftrag = legePerson("dev:ex-malte@test", "auftrag", { aktivBis: "2026-08-01" });
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: exAuftrag.id, prueferId: exAuftrag.id, status: "freigabe_offen", zugewiesenAn: bufdi.id });
    anmelden(exAuftrag);

    await expect(
      zurueckweisenAction({ ok: true }, form(task.id, { begruendung: "Nein." })),
    ).rejects.toThrow(/darf die Aktion "zurueckweisen"/);
  });
});

describe("wiederaufnehmenAction", () => {
  function form(aufgabeId: string): FormData {
    const f = new FormData();
    f.set("aufgabeId", aufgabeId);
    return f;
  }

  it("der zugewiesene BuFDi nimmt eine zurueckgewiesene Aufgabe wieder auf — sie wird in_arbeit", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "zurueckgewiesen", zugewiesenAn: bufdi.id });
    anmelden(bufdi);

    await wiederaufnehmenAction(form(task.id));

    expect(aufgabe(t.db, task.id)!.status).toBe("in_arbeit");
    const letzte = letzteVerlaufszeile(task.id)!;
    expect(letzte.ereignis).toBe("wiederaufgenommen");
    expect(letzte.akteurId).toBe(bufdi.id);
  });

  it("eine unbeteiligte BuFDi darf nicht wiederaufnehmen", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "zurueckgewiesen", zugewiesenAn: bufdi1.id });
    anmelden(bufdi2);

    await expect(wiederaufnehmenAction(form(task.id))).rejects.toThrow(/darf die Aktion "wiederaufnehmen"/);
  });

  it("eine ausgeschiedene BuFDi, die es duerfte, wenn sie aktiv waere, wirft", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const exBufdi = legePerson("dev:ex-alina@test", "bufdi", { aktivBis: "2026-08-01" });
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "zurueckgewiesen", zugewiesenAn: exBufdi.id });
    anmelden(exBufdi);

    await expect(wiederaufnehmenAction(form(task.id))).rejects.toThrow(/darf die Aktion "wiederaufnehmen"/);
  });

  it("aus dem Zustand verteilt wird nicht wiederaufgenommen", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id });
    anmelden(bufdi);

    await expect(wiederaufnehmenAction(form(task.id))).rejects.toThrow(
      /Aktion "wiederaufnehmen" ist im Zustand "verteilt" nicht vorgesehen/,
    );
  });
});

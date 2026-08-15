import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestDb } from "./_db/testdb";
import { migrierteTestDb } from "./_db/testdb";
import {
  aufgaben,
  dateien,
  nachweise,
  personen,
  routinen,
  verlauf,
  type AufgabeRow,
  type PersonRow,
  type Rolle,
  type RoutineRow,
  type ScanStatus,
} from "./_db/schema";
import { aufgabe, personNachId, routineNachId, schreibeVerlauf, verlaufFuer } from "./_db/queries";

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
  einplanenAnnehmenAction,
  fertigMeldenAction,
  freigebenAction,
  personAendernAction,
  personAnlegenAction,
  personBeendenAction,
  rangVerschiebenAction,
  routineAendernAction,
  routineAnlegenAction,
  routineRuhenAction,
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

function legeRoutine(extra: Partial<typeof routinen.$inferInsert> & { personId: string }): RoutineRow {
  return t.db
    .insert(routinen)
    .values({
      titel: "Fruehbesprechung",
      wochentage: 0b11111,
      uhrzeit: "08:00",
      dauerMinuten: 15,
      ...extra,
    })
    .returning()
    .get();
}

/**
 * ANMELDEN — DIE SITZUNG STELLT DIE KOORDINATIONSGRUPPE, SEIT DIE ZEILE SIE NICHT MEHR TRAEGT
 * (Quellenwechsel 2026-08-15): `istKoordination` kommt aus `canAdminModule("aufgaben")`
 * (`_lib/zugang.ts`s `akteurFuer`), nicht mehr aus `personen.rolle`. Damit jede bestehende Zusage
 * dieser Datei DIESELBE bleibt, bekommt eine koordinierende Person hier genau die Gruppe, die ihre
 * Rolle bisher bedeutet hat — die FIXTUR wandert mit der Quelle, die ERWARTUNG bleibt stehen.
 *
 * SEIT `ROLLEN = ["auftrag", "bufdi"]` MUSS DER AUFRUFER ES SAGEN (`anmelden(p, true)`): aus der
 * Zeile ist es nicht mehr ableitbar — sie traegt `auftrag` wie jede andere Auftraggeber-Zeile, und
 * genau das ist der Punkt des Umbaus.
 *
 * `iuk-aufgaben-koordination` ist der Registry-Vorgabewert (`core/registry.ts`);
 * `SUITE_ADMIN_GROUP_AUFGABEN` ist in der Testumgebung nicht gesetzt. Die wenigen Tests, die eine
 * Sitzung MIT ausdruecklichen Gruppen brauchen (Suite-Admin, Modul-Admin ohne Zeile), setzen
 * `sitzung` weiterhin selbst — sie pruefen genau diese Gruppenfrage.
 */
function anmelden(p: PersonRow, koordiniert = false): void {
  sitzung = {
    user: { id: p.sub, groups: koordiniert ? ["iuk-aufgaben-koordination"] : [] },
  };
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
    const koordination = legePerson("dev:rike@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id });
    anmelden(koordination, true);

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
    const koordination = legePerson("dev:rike@test", "auftrag");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id });
    anmelden(koordination, true);

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
    const koordination = legePerson("dev:rike@test", "auftrag");
    const inaktiv = legePerson("dev:doerte@test", "bufdi", { aktivBis: "2026-08-01" });
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id });
    anmelden(koordination, true);

    const ergebnis = erwarteFeldfehler(
      await verteilenAction({ ok: true }, form(task.id, { zielId: inaktiv.id })),
    );
    expect(ergebnis.fieldErrors.zielId).toBeTruthy();
    expect(ergebnis.values.zielId).toBe(inaktiv.id);
    expect(aufgabe(t.db, task.id)!.status).toBe("eingegangen");
  });

  it("eine aktive Nicht-BuFDi-Person als Ziel kommt als Feldfehler zurueck", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const koordination = legePerson("dev:rike@test", "auftrag");
    const anderer = legePerson("dev:tomke@test", "auftrag");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id });
    anmelden(koordination, true);

    const ergebnis = erwarteFeldfehler(
      await verteilenAction({ ok: true }, form(task.id, { zielId: anderer.id })),
    );
    expect(ergebnis.fieldErrors.zielId).toBeTruthy();
    expect(ergebnis.values.zielId).toBe(anderer.id);
  });

  it("„Ziel ist die Koordination selbst“ wird als Feldfehler abgelehnt — die dritte Uebergabe aus Aufgabe 8", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const koordination = legePerson("dev:rike@test", "auftrag");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id });
    anmelden(koordination, true);

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
    const exKoordination = legePerson("dev:ex-rike@test", "auftrag", { aktivBis: "2026-08-01" });
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id });
    anmelden(exKoordination, true);

    await expect(
      verteilenAction({ ok: true }, form(task.id, { zielId: bufdi.id })),
    ).rejects.toThrow(/darf die Aktion "verteilen"/);
    expect(aufgabe(t.db, task.id)!.status).toBe("eingegangen");
  });

  it("eine bereits verteilte Aufgabe wird nicht ueber verteilenAction erneut verteilt", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const koordination = legePerson("dev:rike@test", "auftrag");
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const task = legeAufgabe({
      erstellerId: auftrag.id,
      prueferId: auftrag.id,
      status: "verteilt",
      zugewiesenAn: bufdi1.id,
    });
    anmelden(koordination, true);

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
    const koordination = legePerson("dev:rike@test", "auftrag");
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const task = verteilteAufgabeMitPlanung(auftrag.id, auftrag.id, bufdi1.id);
    anmelden(koordination, true);

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
    const koordination = legePerson("dev:rike@test", "auftrag");
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const task = verteilteAufgabeMitPlanung(auftrag.id, auftrag.id, bufdi1.id);
    anmelden(koordination, true);

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
    const koordination = legePerson("dev:rike@test", "auftrag");
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const task = verteilteAufgabeMitPlanung(auftrag.id, auftrag.id, bufdi1.id);
    anmelden(koordination, true);

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
    const exKoordination = legePerson("dev:ex-rike@test", "auftrag", { aktivBis: "2026-08-01" });
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const task = verteilteAufgabeMitPlanung(auftrag.id, auftrag.id, bufdi1.id);
    anmelden(exKoordination, true);

    await expect(
      umverteilenAction({ ok: true }, form(task.id, { zielId: bufdi2.id })),
    ).rejects.toThrow(/darf die Aktion "umverteilen"/);
    expect(aufgabe(t.db, task.id)!.zugewiesenAn).toBe(bufdi1.id);
  });

  it("eine noch eingegangene Aufgabe wird nicht ueber umverteilenAction verteilt", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const koordination = legePerson("dev:rike@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id });
    anmelden(koordination, true);

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
    const koordination = legePerson("dev:rike@test", "auftrag");
    const task = legeAufgabe({ erstellerId: auftrag.id });
    anmelden(koordination, true);

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

/**
 * MIT EXPLIZITEM `erstelltAm` (Review Fix-Runde 1, Befund #6) — die Tests zur
 * "Nachweis nach Zurueckweisung"-Regel brauchen einen Nachweis, dessen Zeitpunkt NACHWEISLICH vor
 * oder nach einer Zurueckweisungs-Verlaufszeile liegt. `vi.setSystemTime` ist in dieser Datei
 * EINMALIG in `beforeEach` gesetzt (Systemzeit bleibt sonst eingefroren) — ein expliziter Zeitpunkt
 * hier ist deshalb verlaesslicher als zwei Aufrufe mit dazwischenliegendem Zeitsprung.
 */
function legeNachweisMitZeit(
  aufgabeId: string,
  art: "text" | "bild",
  erstelltVon: string,
  erstelltAm: Date,
  text: string | null = null,
) {
  return t.db.insert(nachweise).values({ aufgabeId, art, text, erstelltVon, erstelltAm }).returning().get();
}

/** Dasselbe Prinzip wie `legeNachweisMitZeit`, fuer die Zurueckweisungs-Verlaufszeile selbst. */
function legeVerlaufMitZeit(aufgabeId: string, ereignis: string, akteurId: string, ts: Date) {
  return t.db.insert(verlauf).values({ aufgabeId, ereignis, akteurId, ts }).returning().get();
}

/**
 * EINE `dateien`-ZEILE MIT GEWAEHLTEM `scanStatus` (Aufgabe 19) — fuer `fertigMeldenAction`s
 * geschaerfte Pruefung: ein Bild-Nachweis erfuellt die Pflicht nur, wenn seine `dateien`-Zeile
 * GENAU `sauber` traegt.
 */
function legeDatei(aufgabeId: string, scanStatus: ScanStatus) {
  return t.db
    .insert(dateien)
    .values({ aufgabeId, dateiname: "bild.jpg", mime: "image/jpeg", groesse: 1024, scanStatus })
    .returning()
    .get();
}

/**
 * EIN BILD-NACHWEIS MIT ECHTER `dateiId` (Aufgabe 19) — anders als `legeNachweis(..., "bild", ...)"
 * oben (Aufgabe 10, VOR `dateiId`/`scanStatus`): diese Fabrik haengt eine echte `dateien`-Zeile an,
 * mit dem gewaehlten Scan-Status. Ein `erstelltAm` kann fuer die
 * „seit-letzter-Zurueckweisung"-Tests explizit gesetzt werden.
 */
function legeNachweisMitDatei(
  aufgabeId: string,
  erstelltVon: string,
  scanStatus: ScanStatus,
  erstelltAm?: Date,
) {
  const datei = legeDatei(aufgabeId, scanStatus);
  return t.db
    .insert(nachweise)
    .values({
      aufgabeId,
      art: "bild",
      text: null,
      dateiId: datei.id,
      erstelltVon,
      ...(erstelltAm ? { erstelltAm } : {}),
    })
    .returning()
    .get();
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
    // `planRang: 7` als Ausgangswert (Review Fix-Runde 1, Minor #1): der Schema-Vorgabewert ist
    // ohnehin 0, `expect(...).toBe(0)` unten bliebe also gruen, wuerde `planRang` gar nicht
    // geschrieben. Ein vom Vorgabewert VERSCHIEDENER Ausgangswert macht die Zusicherung echt — sie
    // beweist, dass der leere Zieltag wirklich auf 0 GERECHNET wird, nicht nur zufaellig dabeisteht.
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id, planRang: 7 });
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
   * SPEC-NACHTRAG VOM 2026-08-13 (Teil 1 der Fix-Runde 1, Betreiberentscheidung, `72ef235`):
   * `in_arbeit` ist jetzt ein zulaessiger Ausgangszustand fuer `einplanen`. Der Widerspruch, den
   * diese Aufgabe gemeldet hatte, ist damit aufgeloest — `_lib/tagesplan.ts` zeigt eine
   * `in_arbeit`-Aufgabe mit `planDatum` regulaer in der Tagesspalte, und jetzt kann sie auch
   * verschoben werden, ohne erst zurueckgesetzt werden zu muessen.
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
    // `values.planUhrzeit` war bisher unbehauptet (Review Fix-Runde 1, Minor #3) — ohne diese Zeile
    // koennte die Action das Feld beim Feldfehler vergessen haben, und niemand haette es gemerkt.
    expect(ergebnis.values.planUhrzeit).toBe("9 Uhr");
    expect(aufgabe(t.db, task.id)!.planDatum).toBeNull();
  });

  it("die Koordination darf keinen fremden Plan aendern, obwohl sie sonst fast alles darf", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const koordination = legePerson("dev:rike@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id });
    anmelden(koordination, true);

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

  /*
   * FIX-RUNDE 1 (Betreiberentscheidung): `dauerMinuten` ist ein viertes, OPTIONALES Feld — leer
   * laesst den bestehenden Wert unveraendert, gesendet muss es gueltig sein. Die zehn Tests OBERHALB
   * dieser Gruppe senden das Feld nirgends und bleiben genau deshalb gruen (Vorhersage aus dem
   * Bericht zu Aufgabe 12, jetzt bestaetigt statt nur behauptet).
   */
  describe("dauerMinuten — viertes, optionales Feld (Fix-Runde 1)", () => {
    it("ein gesendeter, gueltiger Wert aendert die Dauerschaetzung", async () => {
      const auftrag = legePerson("dev:malte@test", "auftrag");
      const bufdi = legePerson("dev:alina@test", "bufdi");
      const task = legeAufgabe({
        erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id,
        dauerMinuten: 60,
      });
      anmelden(bufdi);

      const ergebnis = await einplanenAction(
        { ok: true },
        form(task.id, { planDatum: "2026-08-17", dauerMinuten: "90" }),
      );
      expect(ergebnis).toEqual({ ok: true });
      expect(aufgabe(t.db, task.id)!.dauerMinuten).toBe(90);
    });

    it("ein LEERES Feld laesst die bestehende Dauerschaetzung unveraendert", async () => {
      const auftrag = legePerson("dev:malte@test", "auftrag");
      const bufdi = legePerson("dev:alina@test", "bufdi");
      const task = legeAufgabe({
        erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id,
        dauerMinuten: 60,
      });
      anmelden(bufdi);

      // KEIN `dauerMinuten` im Formular — genau das Verhalten der zehn bestehenden Tests oben.
      await einplanenAction({ ok: true }, form(task.id, { planDatum: "2026-08-17" }));

      expect(aufgabe(t.db, task.id)!.dauerMinuten).toBe(60);
    });

    it("ein ungueltiger Wert kommt als Feldfehler zurueck und traegt die Eingabe mit — die Dauer bleibt unveraendert", async () => {
      const auftrag = legePerson("dev:malte@test", "auftrag");
      const bufdi = legePerson("dev:alina@test", "bufdi");
      const task = legeAufgabe({
        erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id,
        dauerMinuten: 60,
      });
      anmelden(bufdi);

      const ergebnis = erwarteFeldfehler(
        await einplanenAction(
          { ok: true },
          form(task.id, { planDatum: "2026-08-17", dauerMinuten: "0" }),
        ),
      );
      expect(ergebnis.fieldErrors.dauerMinuten).toBeTruthy();
      expect(ergebnis.values.dauerMinuten).toBe("0");
      expect(aufgabe(t.db, task.id)!.dauerMinuten).toBe(60);
      // KEIN TEILWEISES SCHREIBEN: ein Feldfehler bei der Dauer verhindert AUCH das Einplanen selbst —
      // derselbe `fieldErrors`-Rueckgabepfad wie bei jedem anderen Feld dieser Action.
      expect(aufgabe(t.db, task.id)!.planDatum).toBeNull();
    });
  });
});

describe("einplanenAnnehmenAction — die Form-Bruecke fuer „Annehmen“ (Aufgabe 13, EinstiegBufdi)", () => {
  function form(aufgabeId: string, over: Record<string, string> = {}): FormData {
    const f = new FormData();
    f.set("aufgabeId", aufgabeId);
    for (const [k, v] of Object.entries(over)) f.set(k, v);
    return f;
  }

  /*
   * DIE ZUSAGE, DIE DIE AUFGABE VERLANGT: „Annehmen“ LAEUFT DURCH DENSELBEN WEG WIE EIN MANUELLES
   * EINPLANEN — dieselbe Verlaufsnotiz (`einplanenNotiz` erkennt „Vorschlag angenommen"), derselbe
   * `planRang`, dieselbe Berechtigungspruefung. Ein Nachbau, der nur `planDatum`/`planUhrzeit`
   * direkt schriebe, liesse genau diese Notiz und die Rang-Berechnung aus.
   */
  it("plant die Aufgabe mit den vorgeschlagenen Werten ein und schreibt „Vorschlag angenommen“ in den Verlauf", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({
      erstellerId: auftrag.id,
      prueferId: auftrag.id,
      status: "verteilt",
      zugewiesenAn: bufdi.id,
      vorschlagDatum: "2026-08-17",
      vorschlagUhrzeit: "09:00",
    });
    anmelden(bufdi);

    await einplanenAnnehmenAction(form(task.id, { planDatum: "2026-08-17", planUhrzeit: "09:00" }));

    const nachher = aufgabe(t.db, task.id)!;
    expect(nachher.planDatum).toBe("2026-08-17");
    expect(nachher.planUhrzeit).toBe("09:00");

    const letzte = letzteVerlaufszeile(task.id)!;
    expect(letzte.ereignis).toBe("eingeplant");
    expect(letzte.notiz).toBe("Vorschlag angenommen: 2026-08-17 09:00");
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/aufgaben", "layout");
  });

  it("wirft wie einplanenAction, wenn die Berechtigung fehlt — keine stille Ablehnung", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const andereBufdi = legePerson("dev:bendix@test", "bufdi");
    const task = legeAufgabe({
      erstellerId: auftrag.id,
      prueferId: auftrag.id,
      status: "verteilt",
      zugewiesenAn: bufdi.id,
      vorschlagDatum: "2026-08-17",
    });
    anmelden(andereBufdi);

    await expect(
      einplanenAnnehmenAction(form(task.id, { planDatum: "2026-08-17" })),
    ).rejects.toThrow();
  });

  /*
   * REVIEW FIX-RUNDE 1, IMPORTANT: `einplanenAction` gibt bei einem ungueltigen `planDatum`
   * `{ ok: false, fieldErrors }` zurueck — KEINEN Wurf. Die vorherige Fassung dieser Bruecke
   * verwarf dieses Ergebnis stillschweigend: `revalidate()` lief nicht, die Seite kam unveraendert
   * zurueck, ohne jede Meldung. Jetzt wirft die Bruecke selbst, sobald `ergebnis.ok === false`.
   */
  it("wirft bei einem Feldfehler, statt ihn stillschweigend zu verwerfen", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({
      erstellerId: auftrag.id,
      prueferId: auftrag.id,
      status: "verteilt",
      zugewiesenAn: bufdi.id,
      vorschlagDatum: "2026-08-17",
    });
    anmelden(bufdi);

    // Ein leeres `planDatum` ist ein Feldfehler in `einplanenAction`, kein Berechtigungswurf —
    // genau der Fall, den die alte Bruecke stillschweigend verschluckte.
    await expect(einplanenAnnehmenAction(form(task.id, { planDatum: "" }))).rejects.toThrow(
      /Plantag/,
    );

    // UND unveraendert: kein stiller No-Op hat die Aufgabe doch irgendwie eingeplant.
    expect(aufgabe(t.db, task.id)!.planDatum).toBeNull();
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

  it("Nachweispflicht Bild: ein vorhandener, SAUBERER Bild-Nachweis reicht auch OHNE Text", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({
      erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id,
      nachweisPflicht: true, nachweisArt: "bild",
    });
    legeNachweisMitDatei(task.id, bufdi.id, "sauber");
    anmelden(bufdi);

    const ergebnis = await fertigMeldenAction({ ok: true }, form(task.id));
    expect(ergebnis).toEqual({ ok: true });
    expect(aufgabe(t.db, task.id)!.status).toBe("freigabe_offen");
  });

  /**
   * DIE GESCHAERFTE PRUEFUNG (Aufgabe 19, Naht aus Aufgabe 10): EXAKT `sauber` liefert die Pflicht
   * ab — `offen`, `befund` UND `fehler` je EINZELN gepruft, nicht stichprobenweise (Brief).
   */
  describe("Nachweispflicht Bild — der Scan-Status entscheidet, erschoepfend ueber alle vier Zustaende", () => {
    it("`offen` (direkt nach dem Upload): abgelehnt, MIT der Auskunft 'wird noch geprueft' — nicht 'fehlt'", async () => {
      const auftrag = legePerson("dev:malte@test", "auftrag");
      const bufdi = legePerson("dev:alina@test", "bufdi");
      const task = legeAufgabe({
        erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id,
        nachweisPflicht: true, nachweisArt: "bild",
      });
      legeNachweisMitDatei(task.id, bufdi.id, "offen");
      anmelden(bufdi);

      const ergebnis = erwarteFeldfehler(await fertigMeldenAction({ ok: true }, form(task.id)));
      expect(ergebnis.fieldErrors.nachweis).toContain("wird noch geprüft");
      expect(ergebnis.fieldErrors.nachweis).not.toContain("erforderlich");
      expect(aufgabe(t.db, task.id)!.status).toBe("in_arbeit");
    });

    it("`befund`: abgelehnt", async () => {
      const auftrag = legePerson("dev:malte@test", "auftrag");
      const bufdi = legePerson("dev:alina@test", "bufdi");
      const task = legeAufgabe({
        erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id,
        nachweisPflicht: true, nachweisArt: "bild",
      });
      legeNachweisMitDatei(task.id, bufdi.id, "befund");
      anmelden(bufdi);

      const ergebnis = erwarteFeldfehler(await fertigMeldenAction({ ok: true }, form(task.id)));
      expect(ergebnis.fieldErrors.nachweis).toBeTruthy();
      expect(aufgabe(t.db, task.id)!.status).toBe("in_arbeit");
    });

    it("`fehler`: abgelehnt", async () => {
      const auftrag = legePerson("dev:malte@test", "auftrag");
      const bufdi = legePerson("dev:alina@test", "bufdi");
      const task = legeAufgabe({
        erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id,
        nachweisPflicht: true, nachweisArt: "bild",
      });
      legeNachweisMitDatei(task.id, bufdi.id, "fehler");
      anmelden(bufdi);

      const ergebnis = erwarteFeldfehler(await fertigMeldenAction({ ok: true }, form(task.id)));
      expect(ergebnis.fieldErrors.nachweis).toBeTruthy();
      expect(aufgabe(t.db, task.id)!.status).toBe("in_arbeit");
    });

    it("`sauber`: geht durch (Gegenprobe zu den drei Ablehnungen oben)", async () => {
      const auftrag = legePerson("dev:malte@test", "auftrag");
      const bufdi = legePerson("dev:alina@test", "bufdi");
      const task = legeAufgabe({
        erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id,
        nachweisPflicht: true, nachweisArt: "bild",
      });
      legeNachweisMitDatei(task.id, bufdi.id, "sauber");
      anmelden(bufdi);

      const ergebnis = await fertigMeldenAction({ ok: true }, form(task.id));
      expect(ergebnis).toEqual({ ok: true });
      expect(aufgabe(t.db, task.id)!.status).toBe("freigabe_offen");
    });

    /**
     * DER ALT-FALL AUS AUFGABE 10 (VOR `dateiId`): ein Bild-Nachweis-Datensatz OHNE angehaengte
     * Datei erfuellt die Pflicht NICHT MEHR — sonst liesse sich die Pflicht durch eine reine
     * `nachweise`-Zeile ohne je gescanntes Bild vortaeuschen, genau die Luecke, die Aufgabe 19
     * schliesst.
     */
    it("ein Bild-Nachweis OHNE angehaengte Datei (dateiId: null) erfuellt die Pflicht nicht mehr", async () => {
      const auftrag = legePerson("dev:malte@test", "auftrag");
      const bufdi = legePerson("dev:alina@test", "bufdi");
      const task = legeAufgabe({
        erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id,
        nachweisPflicht: true, nachweisArt: "bild",
      });
      legeNachweis(task.id, "bild", bufdi.id);
      anmelden(bufdi);

      const ergebnis = erwarteFeldfehler(await fertigMeldenAction({ ok: true }, form(task.id)));
      expect(ergebnis.fieldErrors.nachweis).toContain("erforderlich");
      expect(aufgabe(t.db, task.id)!.status).toBe("in_arbeit");
    });
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

  /**
   * REVIEW FIX-RUNDE 1, IMPORTANT #1 — VIERTES VORKOMMEN DESSELBEN MUSTERS DIESER REIHE. Ohne
   * diesen Test liesse sich die Artfilterung im Textzweig
   * (`vorhandene.some((n) => n.art === "text" && …)`) auf "irgendein Nachweis genuegt"
   * (`vorhandene.length > 0`) verkuerzen, ohne dass die Suite rot wird — der Bild-Nachweis hier
   * beweist, dass NUR ein Text-Nachweis die Textpflicht erfuellt, kein beliebiger.
   */
  it("ein Bild-Nachweis erfuellt NICHT die Textpflicht — die Artfilterung im Textzweig ist bewacht", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({
      erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id,
      nachweisPflicht: true, nachweisArt: "text",
    });
    legeNachweis(task.id, "bild", bufdi.id);
    anmelden(bufdi);

    const ergebnis = erwarteFeldfehler(await fertigMeldenAction({ ok: true }, form(task.id)));
    expect(ergebnis.fieldErrors.nachweisText).toBeTruthy();
    expect(aufgabe(t.db, task.id)!.status).toBe("in_arbeit");
  });

  describe("ein Nachweis von VOR der letzten Zurueckweisung erfuellt die Pflicht nicht erneut (Befund #6)", () => {
    it("Text: der alte Nachweis reicht nicht, ein Feldfehler kommt zurueck", async () => {
      const auftrag = legePerson("dev:malte@test", "auftrag");
      const bufdi = legePerson("dev:alina@test", "bufdi");
      const task = legeAufgabe({
        erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id,
        nachweisPflicht: true, nachweisArt: "text",
      });
      // Der Nachweis entstand VOR der Zurueckweisung — z. B. beim ersten, unzureichenden Anlauf.
      legeNachweisMitZeit(task.id, "text", bufdi.id, new Date("2026-08-10T08:00:00Z"), "Alter Nachweis.");
      legeVerlaufMitZeit(task.id, "zurueckgewiesen", auftrag.id, new Date("2026-08-11T08:00:00Z"));
      anmelden(bufdi);

      const ergebnis = erwarteFeldfehler(await fertigMeldenAction({ ok: true }, form(task.id)));
      expect(ergebnis.fieldErrors.nachweisText).toBeTruthy();
      expect(aufgabe(t.db, task.id)!.status).toBe("in_arbeit");
    });

    it("Text: ein NEUER Nachweis nach der Zurueckweisung erfuellt die Pflicht", async () => {
      const auftrag = legePerson("dev:malte@test", "auftrag");
      const bufdi = legePerson("dev:alina@test", "bufdi");
      const task = legeAufgabe({
        erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id,
        nachweisPflicht: true, nachweisArt: "text",
      });
      legeNachweisMitZeit(task.id, "text", bufdi.id, new Date("2026-08-10T08:00:00Z"), "Alter Nachweis.");
      legeVerlaufMitZeit(task.id, "zurueckgewiesen", auftrag.id, new Date("2026-08-11T08:00:00Z"));
      legeNachweisMitZeit(task.id, "text", bufdi.id, new Date("2026-08-12T08:00:00Z"), "Neuer Nachweis.");
      anmelden(bufdi);

      const ergebnis = await fertigMeldenAction({ ok: true }, form(task.id));
      expect(ergebnis).toEqual({ ok: true });
      expect(aufgabe(t.db, task.id)!.status).toBe("freigabe_offen");
    });

    it("Bild: der alte, SAUBERE Bild-Nachweis reicht nicht, ein Feldfehler kommt zurueck", async () => {
      const auftrag = legePerson("dev:malte@test", "auftrag");
      const bufdi = legePerson("dev:alina@test", "bufdi");
      const task = legeAufgabe({
        erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id,
        nachweisPflicht: true, nachweisArt: "bild",
      });
      // AUSDRUECKLICH `sauber` (nicht `offen`/`befund`/`fehler`): dieser Test beweist den
      // ZEITFILTER ("vor der Zurueckweisung zaehlt nicht"), nicht den Scan-Status-Filter — beide
      // duerfen sich nicht vermischen, sonst waere unklar, WELCHE der beiden Bedingungen ablehnt.
      legeNachweisMitDatei(task.id, bufdi.id, "sauber", new Date("2026-08-10T08:00:00Z"));
      legeVerlaufMitZeit(task.id, "zurueckgewiesen", auftrag.id, new Date("2026-08-11T08:00:00Z"));
      anmelden(bufdi);

      const ergebnis = erwarteFeldfehler(await fertigMeldenAction({ ok: true }, form(task.id)));
      expect(ergebnis.fieldErrors.nachweis).toContain("erforderlich");
      expect(aufgabe(t.db, task.id)!.status).toBe("in_arbeit");
    });

    it("Bild: ein NEUER, SAUBERER Bild-Nachweis nach der Zurueckweisung erfuellt die Pflicht", async () => {
      const auftrag = legePerson("dev:malte@test", "auftrag");
      const bufdi = legePerson("dev:alina@test", "bufdi");
      const task = legeAufgabe({
        erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id,
        nachweisPflicht: true, nachweisArt: "bild",
      });
      legeNachweisMitDatei(task.id, bufdi.id, "sauber", new Date("2026-08-10T08:00:00Z"));
      legeVerlaufMitZeit(task.id, "zurueckgewiesen", auftrag.id, new Date("2026-08-11T08:00:00Z"));
      legeNachweisMitDatei(task.id, bufdi.id, "sauber", new Date("2026-08-12T08:00:00Z"));
      anmelden(bufdi);

      const ergebnis = await fertigMeldenAction({ ok: true }, form(task.id));
      expect(ergebnis).toEqual({ ok: true });
      expect(aufgabe(t.db, task.id)!.status).toBe("freigabe_offen");
    });
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
    const koordination = legePerson("dev:rike@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "freigabe_offen", zugewiesenAn: bufdi.id });
    anmelden(koordination, true);

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
    const exKoordination = legePerson("dev:ex-rike@test", "auftrag", { aktivBis: "2026-08-01" });
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "freigabe_offen", zugewiesenAn: bufdi.id });
    anmelden(exKoordination, true);

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

  /**
   * REVIEW FIX-RUNDE 1, MINOR #5 — laut statt still. `personNachId` liefert nur bei einer
   * Datenbankinkonsistenz `null` (eine `prueferId`, die auf keine Person mehr zeigt); eine solche
   * Zeile ist unter `foreign_keys = ON` (`testdb.ts`) reguer gar nicht einfuegbar — die Pragma wird
   * hier bewusst kurz ausgeschaltet, um GENAU diese sonst unerreichbare Inkonsistenz nachzustellen.
   */
  it("wirft, statt eine UUID ins Journal zu schreiben, wenn der eingetragene Pruefer nicht mehr existiert", async () => {
    const koordination = legePerson("dev:rike@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const auftrag = legePerson("dev:malte@test", "auftrag");

    t.sqlite.pragma("foreign_keys = OFF");
    const task = legeAufgabe({
      erstellerId: auftrag.id, prueferId: "verwaiste-pruefer-id", status: "freigabe_offen", zugewiesenAn: bufdi.id,
    });
    t.sqlite.pragma("foreign_keys = ON");
    anmelden(koordination, true);

    await expect(freigebenAction(form(task.id))).rejects.toThrow(/Pruefer .* nicht gefunden/);
    expect(aufgabe(t.db, task.id)!.status).toBe("freigabe_offen");
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
    // `values.begruendung` kommt UNVERAENDERT zurueck, auch wenn es nur Leerzeichen sind (Review
    // Fix-Runde 1, Minor #3) — sonst wuesste die Oberflaeche nach dem Feldfehler nicht mehr, was im
    // Feld stand.
    expect(ergebnis.values.begruendung).toBe("   ");
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

/*
 * AB HIER AUFGABE 11 — ROUTINEN. EINE ROUTINE DURCHLAEUFT `uebergang()` NICHT (Spec §6): kein
 * `status`, kein Verlauf. Die drei Actions pruefen `darfPlanAendern` direkt — DASSELBE Praedikat,
 * das den Zeitplan schuetzt, keine zweite Fassung derselben Regel.
 */

const BERECHTIGUNGS_MELDUNG = /Keine Berechtigung, diese Routine zu aendern\./;

describe("routineAnlegenAction", () => {
  function form(over: Record<string, string | string[]> = {}): FormData {
    const f = new FormData();
    f.set("titel", "Fruehsport");
    f.set("uhrzeit", "07:00");
    f.set("dauerMinuten", "30");
    for (const wert of (over.wochentage as string[] | undefined) ?? ["0", "2", "4"]) {
      f.append("wochentage", wert);
    }
    for (const [k, v] of Object.entries(over)) {
      if (k === "wochentage") continue;
      f.set(k, v as string);
    }
    return f;
  }

  it("legt eine Routine fuer die anmeldende Person an, mit der richtigen Bitmaske", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    anmelden(bufdi);

    const ergebnis = await routineAnlegenAction({ ok: true }, form());
    expect(ergebnis).toEqual({ ok: true });

    const zeilen = t.db.select().from(routinen).all();
    expect(zeilen).toHaveLength(1);
    const neue = zeilen[0]!;
    expect(neue.personId).toBe(bufdi.id);
    expect(neue.titel).toBe("Fruehsport");
    // Mo (Bit 0) + Mi (Bit 2) + Fr (Bit 4) = 1 + 4 + 16 = 21 — DIE BITMASKE GEHT RICHTIG (Brief).
    expect(neue.wochentage).toBe(0b10101);
    expect(neue.uhrzeit).toBe("07:00");
    expect(neue.dauerMinuten).toBe(30);
    expect(neue.aktiv).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/aufgaben", "layout");
  });

  it("ignoriert ein untergeschobenes fremdes personId-Feld — die Routine gehoert IMMER der anmeldenden Person", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const fremde = legePerson("dev:bendix@test", "bufdi");
    anmelden(bufdi);

    await routineAnlegenAction({ ok: true }, form({ personId: fremde.id }));

    const neue = t.db.select().from(routinen).all()[0]!;
    expect(neue.personId).toBe(bufdi.id);
  });

  it("eine ausgeschiedene Person darf sich selbst keine Routine mehr anlegen", async () => {
    const exBufdi = legePerson("dev:ex-alina@test", "bufdi", { aktivBis: "2026-08-01" });
    anmelden(exBufdi);

    await expect(routineAnlegenAction({ ok: true }, form())).rejects.toThrow(BERECHTIGUNGS_MELDUNG);
  });

  /*
   * DIE ROLLE, DIE DIE ROUTE ERZWINGT (Abschlussreview G6) — bis dahin ungeprueft und ungeriegelt:
   * `/routinen` gatet mit `darfRoutinenVerwalten` (`rolle === "bufdi"`), die Actions nur mit
   * `darfPlanAendern` (Identitaet). Die bestehenden Gegenproben treffen alle eine FREMDE Routine
   * und werden deshalb schon von `darfPlanAendern` abgewiesen — der Fall "falsche Rolle, EIGENE
   * Routine" kam auf beiden Seiten nicht vor und lief per direktem POST durch. Je ein Fall pro
   * Action, hier und in den beiden Gruppen darunter.
   */
  it("die Koordination legt auch sich selbst keine Routine an — /routinen ist rollengebunden", async () => {
    const koordination = legePerson("dev:rike@test", "auftrag");
    anmelden(koordination, true);

    await expect(routineAnlegenAction({ ok: true }, form())).rejects.toThrow(BERECHTIGUNGS_MELDUNG);
    expect(t.db.select().from(routinen).all()).toHaveLength(0);
  });

  it("ohne Wochentag wird abgelehnt — eine Routine ohne einen einzigen Tag ist sinnlos", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    anmelden(bufdi);

    const ergebnis = erwarteFeldfehler(await routineAnlegenAction({ ok: true }, form({ wochentage: [] })));
    expect(ergebnis.fieldErrors.wochentage).toBeTruthy();
    expect(t.db.select().from(routinen).all()).toHaveLength(0);
  });

  it("leerer Titel wird abgelehnt", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    anmelden(bufdi);

    const ergebnis = erwarteFeldfehler(await routineAnlegenAction({ ok: true }, form({ titel: "  " })));
    expect(ergebnis.fieldErrors.titel).toBeTruthy();
  });

  it("eine nicht-positive Dauer wird abgelehnt", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    anmelden(bufdi);

    const ergebnis = erwarteFeldfehler(
      await routineAnlegenAction({ ok: true }, form({ dauerMinuten: "0" })),
    );
    expect(ergebnis.fieldErrors.dauerMinuten).toBeTruthy();
  });

  it("eine ungueltige Uhrzeit wird als Feldfehler abgelehnt, nicht als Wurf (minutenVon wirft seit Aufgabe 7)", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    anmelden(bufdi);

    const ergebnis = erwarteFeldfehler(
      await routineAnlegenAction({ ok: true }, form({ uhrzeit: "25:99" })),
    );
    expect(ergebnis.fieldErrors.uhrzeit).toBeTruthy();
  });

  it("eine leere Uhrzeit ist gueltig — sie ist optional", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    anmelden(bufdi);

    const ergebnis = await routineAnlegenAction({ ok: true }, form({ uhrzeit: "" }));
    expect(ergebnis).toEqual({ ok: true });
    expect(t.db.select().from(routinen).all()[0]!.uhrzeit).toBeNull();
  });

  it("ein Feldfehler traegt alle Eingaben zurueck, EINSCHLIESSLICH der Wochentagsauswahl", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    anmelden(bufdi);

    const ergebnis = erwarteFeldfehler(
      await routineAnlegenAction(
        { ok: true },
        form({ titel: "", wochentage: ["1", "3"], uhrzeit: "09:15", dauerMinuten: "20" }),
      ),
    );
    expect(ergebnis.values.wochentage).toBe("1,3");
    expect(ergebnis.values.uhrzeit).toBe("09:15");
    expect(ergebnis.values.dauerMinuten).toBe("20");
  });
});

describe("routineAendernAction", () => {
  function form(routineId: string, over: Record<string, string | string[]> = {}): FormData {
    const f = new FormData();
    f.set("routineId", routineId);
    f.set("titel", "Fruehsport, angepasst");
    f.set("uhrzeit", "07:30");
    f.set("dauerMinuten", "45");
    for (const wert of (over.wochentage as string[] | undefined) ?? ["1", "3"]) {
      f.append("wochentage", wert);
    }
    for (const [k, v] of Object.entries(over)) {
      if (k === "wochentage") continue;
      f.set(k, v as string);
    }
    return f;
  }

  it("die eigene Person aendert Titel, Wochentage, Uhrzeit und Dauer", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const routine = legeRoutine({ personId: bufdi.id });
    anmelden(bufdi);

    const ergebnis = await routineAendernAction({ ok: true }, form(routine.id));
    expect(ergebnis).toEqual({ ok: true });

    const aktualisiert = routineNachId(t.db, routine.id)!;
    expect(aktualisiert.titel).toBe("Fruehsport, angepasst");
    // Di (Bit 1) + Do (Bit 3) = 2 + 8 = 10.
    expect(aktualisiert.wochentage).toBe(0b01010);
    expect(aktualisiert.uhrzeit).toBe("07:30");
    expect(aktualisiert.dauerMinuten).toBe(45);
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/aufgaben", "layout");
  });

  /*
   * DIE GEGENPROBE, DIE DER BRIEF VERLANGT: "auch die Koordination darf keine fremden Routinen ...
   * aendern." — mit einer fremden AKTIVEN Person UND mit einer ausgeschiedenen, je mit der Meldung
   * geprueft (nicht nur, DASS geworfen wird).
   */
  it("eine fremde AKTIVE BuFDi darf eine Routine nicht aendern", async () => {
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const routine = legeRoutine({ personId: bufdi1.id });
    anmelden(bufdi2);

    await expect(routineAendernAction({ ok: true }, form(routine.id))).rejects.toThrow(
      BERECHTIGUNGS_MELDUNG,
    );
  });

  it("auch die Koordination darf eine fremde Routine nicht aendern — sie schlaegt vor, sie setzt nicht", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const koordination = legePerson("dev:rike@test", "auftrag");
    const routine = legeRoutine({ personId: bufdi.id });
    anmelden(koordination, true);

    await expect(routineAendernAction({ ok: true }, form(routine.id))).rejects.toThrow(
      BERECHTIGUNGS_MELDUNG,
    );
  });

  it("eine ausgeschiedene Person darf ihre eigene Routine nicht mehr aendern", async () => {
    const exBufdi = legePerson("dev:ex-alina@test", "bufdi", { aktivBis: "2026-08-01" });
    const routine = legeRoutine({ personId: exBufdi.id });
    anmelden(exBufdi);

    await expect(routineAendernAction({ ok: true }, form(routine.id))).rejects.toThrow(
      BERECHTIGUNGS_MELDUNG,
    );
  });

  /** DIE ROLLE, DIE DIE ROUTE ERZWINGT (Abschlussreview G6) — s. `routineAnlegenAction` oben. */
  it("die Koordination aendert auch ihre EIGENE Routine nicht — die Rolle riegelt, nicht nur die Identitaet", async () => {
    const koordination = legePerson("dev:rike@test", "auftrag");
    const eigene = legeRoutine({ personId: koordination.id, titel: "Unveraendert" });
    anmelden(koordination, true);

    await expect(routineAendernAction({ ok: true }, form(eigene.id))).rejects.toThrow(
      BERECHTIGUNGS_MELDUNG,
    );
    expect(routineNachId(t.db, eigene.id)!.titel).toBe("Unveraendert");
  });

  it("eine unbekannte routineId wirft", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    anmelden(bufdi);

    await expect(routineAendernAction({ ok: true }, form("unbekannt"))).rejects.toThrow(
      /Routine "unbekannt" nicht gefunden/,
    );
  });

  it("eine fehlende routineId wirft", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    anmelden(bufdi);
    const f = form("");
    f.delete("routineId");

    await expect(routineAendernAction({ ok: true }, f)).rejects.toThrow(/routineId fehlt/);
  });

  it("ohne Wochentag wird abgelehnt", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const routine = legeRoutine({ personId: bufdi.id });
    anmelden(bufdi);

    const ergebnis = erwarteFeldfehler(
      await routineAendernAction({ ok: true }, form(routine.id, { wochentage: [] })),
    );
    expect(ergebnis.fieldErrors.wochentage).toBeTruthy();
    // DIE GEGENPROBE FUER "ANGENOMMEN, NICHT NUR BEHAUPTET": unveraendert in der Datenbank.
    expect(routineNachId(t.db, routine.id)!.wochentage).toBe(routine.wochentage);
  });

  it("ein Feldfehler traegt alle Eingaben zurueck, EINSCHLIESSLICH der Wochentagsauswahl und der routineId", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const routine = legeRoutine({ personId: bufdi.id });
    anmelden(bufdi);

    const ergebnis = erwarteFeldfehler(
      await routineAendernAction({ ok: true }, form(routine.id, { titel: "", wochentage: ["0"] })),
    );
    expect(ergebnis.values.routineId).toBe(routine.id);
    expect(ergebnis.values.wochentage).toBe("0");
  });
});

describe("routineRuhenAction", () => {
  function form(routineId: string): FormData {
    const f = new FormData();
    f.set("routineId", routineId);
    return f;
  }

  it("schaltet eine aktive Routine auf ruhend", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const routine = legeRoutine({ personId: bufdi.id, aktiv: true });
    anmelden(bufdi);

    await routineRuhenAction(form(routine.id));

    expect(routineNachId(t.db, routine.id)!.aktiv).toBe(false);
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/aufgaben", "layout");
  });

  it("weckt eine ruhende Routine wieder auf", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const routine = legeRoutine({ personId: bufdi.id, aktiv: false });
    anmelden(bufdi);

    await routineRuhenAction(form(routine.id));

    expect(routineNachId(t.db, routine.id)!.aktiv).toBe(true);
  });

  it("eine fremde AKTIVE BuFDi darf eine Routine nicht ruhen schalten", async () => {
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const routine = legeRoutine({ personId: bufdi1.id });
    anmelden(bufdi2);

    await expect(routineRuhenAction(form(routine.id))).rejects.toThrow(BERECHTIGUNGS_MELDUNG);
  });

  it("auch die Koordination darf eine fremde Routine nicht ruhen schalten", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const koordination = legePerson("dev:rike@test", "auftrag");
    const routine = legeRoutine({ personId: bufdi.id });
    anmelden(koordination, true);

    await expect(routineRuhenAction(form(routine.id))).rejects.toThrow(BERECHTIGUNGS_MELDUNG);
  });

  it("eine ausgeschiedene Person darf ihre eigene Routine nicht mehr umschalten", async () => {
    const exBufdi = legePerson("dev:ex-alina@test", "bufdi", { aktivBis: "2026-08-01" });
    const routine = legeRoutine({ personId: exBufdi.id });
    anmelden(exBufdi);

    await expect(routineRuhenAction(form(routine.id))).rejects.toThrow(BERECHTIGUNGS_MELDUNG);
  });

  it("eine unbekannte routineId wirft", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    anmelden(bufdi);

    await expect(routineRuhenAction(form("unbekannt"))).rejects.toThrow(/Routine "unbekannt" nicht gefunden/);
  });

  /** DIE ROLLE, DIE DIE ROUTE ERZWINGT (Abschlussreview G6) — s. `routineAnlegenAction` oben. */
  it("eine auftrag-Person schaltet auch ihre EIGENE Routine nicht ruhend", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const eigene = legeRoutine({ personId: auftrag.id, aktiv: true });
    anmelden(auftrag);

    await expect(routineRuhenAction(form(eigene.id))).rejects.toThrow(BERECHTIGUNGS_MELDUNG);
    expect(routineNachId(t.db, eigene.id)!.aktiv).toBe(true);
  });
});

describe("rangVerschiebenAction", () => {
  function form(aufgabeId: string, richtung: string): FormData {
    const f = new FormData();
    f.set("aufgabeId", aufgabeId);
    f.set("richtung", richtung);
    return f;
  }

  /**
   * DREI EINTRAEGE, KEINER AUF DEM SCHEMA-VORGABEWERT (Review-Hinweis, Vorbild der
   * `planRang: 7`-Begruendung bei `einplanenAction` oben, Zeile ~825): Raenge 3/5/8 statt 0/1/2 —
   * sonst bewiese ein gruener Test nichts, weil ein NICHT geschriebener Rang zufaellig ohnehin beim
   * Vorgabewert stuende. Die "Mitte" ist die Aufgabe, an der getauscht wird; "Erste" und "Letzte"
   * sind die Nachbarn, "Deckung" (anderer Tag) und "Fremd" (andere Person, selber Tag, SELBE Raenge)
   * sind die Gegenproben fuer die Tag-/Personen-Eingrenzung.
   */
  function drei(bufdi: PersonRow, auftrag: PersonRow, tag: string) {
    const erste = legeAufgabe({
      erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id,
      titel: "Erste", planDatum: tag, planRang: 3,
    });
    const mitte = legeAufgabe({
      erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id,
      titel: "Mitte", planDatum: tag, planRang: 5,
    });
    const letzte = legeAufgabe({
      erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id,
      titel: "Letzte", planDatum: tag, planRang: 8,
    });
    return { erste, mitte, letzte };
  }

  it("hoch tauscht die Mitte mit ihrem Vorgaenger — genau zwei Raenge aendern sich, der dritte bleibt", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const { erste, mitte, letzte } = drei(bufdi, auftrag, "2026-08-17");
    anmelden(bufdi);

    await rangVerschiebenAction(form(mitte.id, "hoch"));

    expect(aufgabe(t.db, mitte.id)!.planRang).toBe(3);
    expect(aufgabe(t.db, erste.id)!.planRang).toBe(5);
    expect(aufgabe(t.db, letzte.id)!.planRang).toBe(8); // unberuehrt
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/aufgaben", "layout");
  });

  it("runter tauscht die Mitte mit ihrem Nachfolger — genau zwei Raenge aendern sich, der dritte bleibt", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const { erste, mitte, letzte } = drei(bufdi, auftrag, "2026-08-17");
    anmelden(bufdi);

    await rangVerschiebenAction(form(mitte.id, "runter"));

    expect(aufgabe(t.db, mitte.id)!.planRang).toBe(8);
    expect(aufgabe(t.db, letzte.id)!.planRang).toBe(5);
    expect(aufgabe(t.db, erste.id)!.planRang).toBe(3); // unberuehrt
  });

  it("schreibt KEINE Verlaufszeile — ein Rangtausch ist keine Umplanung (eigene Begruendung, actions.ts)", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const { mitte } = drei(bufdi, auftrag, "2026-08-17");
    anmelden(bufdi);

    await rangVerschiebenAction(form(mitte.id, "hoch"));

    expect(verlaufFuer(t.db, mitte.id)).toEqual([]);
  });

  it("eine andere Person am selben Tag mit denselben Raengen bleibt unberuehrt — die Skala ist je Person", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const { mitte } = drei(bufdi1, auftrag, "2026-08-17");
    const fremdeMitte = legeAufgabe({
      erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi2.id,
      titel: "Fremde Mitte", planDatum: "2026-08-17", planRang: 5,
    });
    anmelden(bufdi1);

    await rangVerschiebenAction(form(mitte.id, "hoch"));

    expect(aufgabe(t.db, fremdeMitte.id)!.planRang).toBe(5);
  });

  it("dieselbe Person an einem ANDEREN Tag mit demselben Rang bleibt unberuehrt — die Skala ist je Tag", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const { mitte } = drei(bufdi, auftrag, "2026-08-17");
    const andererTag = legeAufgabe({
      erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id,
      titel: "Anderer Tag", planDatum: "2026-08-18", planRang: 5,
    });
    anmelden(bufdi);

    await rangVerschiebenAction(form(mitte.id, "hoch"));

    expect(aufgabe(t.db, andererTag.id)!.planRang).toBe(5);
  });

  /*
   * GEGENPROBE (b), ZWEITE HAELFTE: wird der Grenzwurf unten in `rangVerschiebenAction`
   * (`nachbarIndex < 0 || nachbarIndex >= zeilen.length`) entfernt, wird DIESER Test rot — "hoch" auf
   * die erste Zeile faende `zeilen[-1]` (`undefined`) und schriebe `planRang: undefined` bzw. wuerfe
   * einen anderen (ungeprueften) Fehler statt der hier erwarteten Meldung.
   */
  it("die erste Aufgabe hat keinen Vorgaenger — hoch wirft, mit geprüfter Meldung", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const { erste } = drei(bufdi, auftrag, "2026-08-17");
    anmelden(bufdi);

    await expect(rangVerschiebenAction(form(erste.id, "hoch"))).rejects.toThrow(
      /Kein Nachbar in dieser Richtung\./,
    );
    expect(aufgabe(t.db, erste.id)!.planRang).toBe(3);
  });

  it("die letzte Aufgabe hat keinen Nachfolger — runter wirft, mit geprüfter Meldung", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const { letzte } = drei(bufdi, auftrag, "2026-08-17");
    anmelden(bufdi);

    await expect(rangVerschiebenAction(form(letzte.id, "runter"))).rejects.toThrow(
      /Kein Nachbar in dieser Richtung\./,
    );
    expect(aufgabe(t.db, letzte.id)!.planRang).toBe(8);
  });

  it("eine einzelne eingeplante Aufgabe ist erste UND letzte — beide Richtungen werfen", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const einzige = legeAufgabe({
      erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id,
      planDatum: "2026-08-17", planRang: 3,
    });
    anmelden(bufdi);

    await expect(rangVerschiebenAction(form(einzige.id, "hoch"))).rejects.toThrow(
      /Kein Nachbar in dieser Richtung\./,
    );
    await expect(rangVerschiebenAction(form(einzige.id, "runter"))).rejects.toThrow(
      /Kein Nachbar in dieser Richtung\./,
    );
  });

  /*
   * GEGENPROBE (a): wird die `darfPlanAendern`-Pruefung in `rangVerschiebenAction` entfernt, werden
   * DIESE DREI Tests rot (fremde aktive BuFDi, Koordination, ausgeschiedene eigene Person) — jeder
   * prueft die Meldung, nicht nur, dass ueberhaupt geworfen wird (Lektion 4).
   */
  it("eine unbeteiligte BuFDi darf den Rang einer anderen Person nicht aendern", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi1 = legePerson("dev:alina@test", "bufdi");
    const bufdi2 = legePerson("dev:bendix@test", "bufdi");
    const { mitte } = drei(bufdi1, auftrag, "2026-08-17");
    anmelden(bufdi2);

    await expect(rangVerschiebenAction(form(mitte.id, "hoch"))).rejects.toThrow(
      /Keine Berechtigung, diesen Rang zu aendern\./,
    );
    expect(aufgabe(t.db, mitte.id)!.planRang).toBe(5);
  });

  it("auch die Koordination darf keinen fremden Rang verschieben", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const koordination = legePerson("dev:rike@test", "auftrag");
    const { mitte } = drei(bufdi, auftrag, "2026-08-17");
    anmelden(koordination, true);

    await expect(rangVerschiebenAction(form(mitte.id, "hoch"))).rejects.toThrow(
      /Keine Berechtigung, diesen Rang zu aendern\./,
    );
    expect(aufgabe(t.db, mitte.id)!.planRang).toBe(5);
  });

  it("eine ausgeschiedene BuFDi, die es duerfte, wenn sie aktiv waere, wirft", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const exBufdi = legePerson("dev:ex-alina@test", "bufdi", { aktivBis: "2026-08-01" });
    const { mitte } = drei(exBufdi, auftrag, "2026-08-17");
    anmelden(exBufdi);

    await expect(rangVerschiebenAction(form(mitte.id, "hoch"))).rejects.toThrow(
      /Keine Berechtigung, diesen Rang zu aendern\./,
    );
  });

  it("eine unbekannte aufgabeId wirft", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    anmelden(bufdi);

    await expect(rangVerschiebenAction(form("unbekannt", "hoch"))).rejects.toThrow(
      /Aufgabe "unbekannt" nicht gefunden/,
    );
  });

  it("eine nicht eingeplante Aufgabe hat keinen Rang zu verschieben", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id });
    anmelden(bufdi);

    await expect(rangVerschiebenAction(form(task.id, "hoch"))).rejects.toThrow(
      /Aufgabe ist nicht eingeplant/,
    );
  });

  it("eine unbekannte Richtung ist nur ueber ein manipuliertes Formular erreichbar und wirft", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const { mitte } = drei(bufdi, auftrag, "2026-08-17");
    anmelden(bufdi);

    await expect(rangVerschiebenAction(form(mitte.id, "seitwaerts"))).rejects.toThrow(
      /Unbekannte Richtung "seitwaerts"/,
    );
  });

  /**
   * DIESELBE ZUSAGE WIE BEI `einplanenAction` (Spec-Nachtrag 2026-08-13): ein Rangwechsel prueft
   * `task.status` nirgends — `darfPlanAendern` kennt nur die Zuweisung, keinen Zustand. Eine
   * `in_arbeit`-Aufgabe laesst sich also genauso verschieben wie eine `verteilt`e.
   */
  it("eine Aufgabe in_arbeit laesst sich im Rang verschieben wie jede andere", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const erste = legeAufgabe({
      erstellerId: auftrag.id, prueferId: auftrag.id, status: "in_arbeit", zugewiesenAn: bufdi.id,
      planDatum: "2026-08-17", planRang: 3,
    });
    const mitte = legeAufgabe({
      erstellerId: auftrag.id, prueferId: auftrag.id, status: "verteilt", zugewiesenAn: bufdi.id,
      planDatum: "2026-08-17", planRang: 5,
    });
    anmelden(bufdi);

    await rangVerschiebenAction(form(mitte.id, "hoch"));

    expect(aufgabe(t.db, mitte.id)!.status).toBe("verteilt");
    expect(aufgabe(t.db, erste.id)!.status).toBe("in_arbeit");
    expect(aufgabe(t.db, mitte.id)!.planRang).toBe(3);
    expect(aufgabe(t.db, erste.id)!.planRang).toBe(5);
  });
});

/*
 * AB HIER AUFGABE 14 — DIE PERSONENVERWALTUNG.
 */

describe("personAnlegenAction", () => {
  function form(over: Record<string, string> = {}): FormData {
    const f = new FormData();
    f.set("sub", "dev:neu@localtest.me");
    f.set("name", "Neu");
    f.set("initialen", "NE");
    f.set("rolle", "bufdi");
    f.set("sollMinutenTag", "300");
    f.set("aktivVon", "2026-08-14");
    f.set("aktivBis", "");
    for (const [k, v] of Object.entries(over)) f.set(k, v);
    return f;
  }

  it("koordination legt eine Person an", async () => {
    const koordination = legePerson("dev:rike@test", "auftrag");
    anmelden(koordination, true);

    const ergebnis = await personAnlegenAction({ ok: true }, form());
    expect(ergebnis).toEqual({ ok: true });

    const neue = t.db
      .select()
      .from(personen)
      .where(eq(personen.sub, "dev:neu@localtest.me"))
      .get()!;
    expect(neue).toMatchObject({
      name: "Neu", initialen: "NE", rolle: "bufdi", sollMinutenTag: 300,
      aktivVon: "2026-08-14", aktivBis: null,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/aufgaben", "layout");
  });

  /**
   * PERSISTENT-, NICHT NORMALISIERT: Pocket-ID-`sub`-Werte sind gross-/kleinschreibungssensitiv.
   * Eine `.toLowerCase()` auf dem Weg hinein wuerde eine Zeile erzeugen, die bei der naechsten
   * Anmeldung mit dem tatsaechlichen (gemischten) `sub` STILL nie trifft.
   */
  it("normalisiert den sub NICHT (Gross-/Kleinschreibung bleibt erhalten)", async () => {
    const koordination = legePerson("dev:rike@test", "auftrag");
    anmelden(koordination, true);

    await personAnlegenAction({ ok: true }, form({ sub: "dev:MixedCase@Localtest.me" }));
    const neue = t.db
      .select()
      .from(personen)
      .where(eq(personen.sub, "dev:MixedCase@Localtest.me"))
      .get();
    expect(neue).toBeTruthy();
    const tiefergestellt = t.db
      .select()
      .from(personen)
      .where(eq(personen.sub, "dev:mixedcase@localtest.me"))
      .get();
    expect(tiefergestellt).toBeUndefined();
  });

  it("ein leerer Name kommt als Feldfehler zurueck, values traegt jedes Feld", async () => {
    const koordination = legePerson("dev:rike@test", "auftrag");
    anmelden(koordination, true);

    const ergebnis = erwarteFeldfehler(
      await personAnlegenAction({ ok: true }, form({ name: "  " })),
    );
    expect(ergebnis.fieldErrors.name).toBeTruthy();
    expect(ergebnis.values.sub).toBe("dev:neu@localtest.me");
    expect(ergebnis.values.rolle).toBe("bufdi");
    expect(ergebnis.values.sollMinutenTag).toBe("300");
  });

  it("ein bereits vergebener sub kommt als Feldfehler zurueck, keine zweite Zeile entsteht", async () => {
    const koordination = legePerson("dev:rike@test", "auftrag");
    legePerson("dev:doppelt@localtest.me", "bufdi");
    anmelden(koordination, true);

    const ergebnis = erwarteFeldfehler(
      await personAnlegenAction({ ok: true }, form({ sub: "dev:doppelt@localtest.me" })),
    );
    expect(ergebnis.fieldErrors.sub).toBeTruthy();
    const treffer = t.db
      .select()
      .from(personen)
      .where(eq(personen.sub, "dev:doppelt@localtest.me"))
      .all();
    expect(treffer).toHaveLength(1);
  });

  it("aktivBis vor aktivVon kommt als Feldfehler zurueck", async () => {
    const koordination = legePerson("dev:rike@test", "auftrag");
    anmelden(koordination, true);

    const ergebnis = erwarteFeldfehler(
      await personAnlegenAction({ ok: true }, form({ aktivBis: "2026-08-01" })),
    );
    expect(ergebnis.fieldErrors.aktivBis).toBeTruthy();
  });

  it("eine unbekannte Rolle ist nur ueber ein manipuliertes Formular erreichbar und wirft", async () => {
    const koordination = legePerson("dev:rike@test", "auftrag");
    anmelden(koordination, true);

    await expect(
      personAnlegenAction({ ok: true }, form({ rolle: "admin" })),
    ).rejects.toThrow(/Unbekannte Rolle/);
  });

  it("auftrag darf keine Personen anlegen — wirft", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    anmelden(auftrag);

    await expect(personAnlegenAction({ ok: true }, form())).rejects.toThrow(
      /Keine Berechtigung/,
    );
  });

  it("bufdi darf keine Personen anlegen — wirft", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    anmelden(bufdi);

    await expect(personAnlegenAction({ ok: true }, form())).rejects.toThrow(
      /Keine Berechtigung/,
    );
  });

  /**
   * DER ERSTBETRIEBS-FALL, UND ZWAR SCHREIBEND (Abschlussreview K1) — die Zusicherung, die bis zum
   * Abschlussreview NIRGENDS gedeckt war: `personen/page.test.tsx` prueft nur, dass der Suite-Admin
   * das FORMULAR sieht, und jeder Test hier begann bis dahin mit `legePerson(...)`, hatte also
   * immer schon eine `personen`-Zeile fuer den Handelnden.
   *
   * BEWUSST KEIN `legePerson` FUER DIE SITZUNG: eine frische Produktionsdatenbank hat NULL
   * `personen`-Zeilen (`core/bootstrap.ts` seedet `aufgaben` nicht), und `erstellePerson` hat im
   * Produktionscode genau einen Aufrufer — diese Action. Wirft sie, ist das Modul ohne direkten
   * Datenbankeingriff nicht in Betrieb zu nehmen.
   *
   * "dashboard-admins" ist der Vorgabewert von `suiteAdminGroup()` (`core/groups.ts`) — dieselbe
   * Gruppe, mit der `personen/page.test.tsx` die Route-Haelfte desselben Notausgangs prueft.
   */
  it("Suite-Admin OHNE eigene personen-Zeile legt die erste Person an — die Zeile steht danach in der Datenbank", async () => {
    sitzung = { user: { id: "dev:admin@test", groups: ["dashboard-admins"] } };

    const ergebnis = await personAnlegenAction({ ok: true }, form());
    expect(ergebnis).toEqual({ ok: true });

    const erste = t.db
      .select()
      .from(personen)
      .where(eq(personen.sub, "dev:neu@localtest.me"))
      .get();
    expect(erste).toMatchObject({ name: "Neu", rolle: "bufdi" });
    // Und zwar die ALLERERSTE Zeile ueberhaupt — der Handelnde selbst hat keine.
    expect(t.db.select().from(personen).all()).toHaveLength(1);
  });

  it("die modul-eigene Admin-Gruppe (iuk-aufgaben-koordination) legt ebenso an", async () => {
    sitzung = { user: { id: "dev:modadmin@test", groups: ["iuk-aufgaben-koordination"] } };

    expect(await personAnlegenAction({ ok: true }, form())).toEqual({ ok: true });
    expect(t.db.select().from(personen).all()).toHaveLength(1);
  });

  /**
   * `canAdminModule` IST NICHT `session.user.isAdmin` — `CLAUDE.md` schaerft genau diese
   * Unterscheidung eigens ein: `isAdmin` heisst suiteweit „ist Betreiber", die Frage „darf diese
   * Person Modul X verwalten?" beantwortet `isModuleAdmin` aus `core/groups`, und das liest
   * AUSSCHLIESSLICH `session.user.groups` (Suite-Admin-Gruppe ODER `adminGroups` des Moduls aus
   * der Registry). Im ganzen Modul `aufgaben` kommt `isAdmin` deshalb nirgends vor.
   *
   * DIESER TEST IST DER RIEGEL GEGEN DIE NAHELIEGENDE FEHLBEHEBUNG: wer den Notausgang spaeter
   * „vereinfacht", indem er auf `session.user.isAdmin` prueft, oeffnet ihn fuer einen anderen
   * Personenkreis als den entschiedenen — und die drei Tests darueber blieben dabei gruen, weil
   * ihre Sitzungen die Gruppen ohnehin tragen. Umgekehrt belegt dieser Fall, dass die drei nicht
   * aus dem falschen Grund gruen sind: eine Sitzung MIT `isAdmin`, aber OHNE jede Gruppe kommt
   * nicht durch.
   */
  it("eine Sitzung mit session.user.isAdmin, aber ohne jede Gruppe kommt NICHT durch", async () => {
    sitzung = { user: { id: "dev:betreiber@test", isAdmin: true, groups: [] } };

    await expect(personAnlegenAction({ ok: true }, form())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(t.db.select().from(personen).all()).toHaveLength(0);
  });
});

describe("personAendernAction", () => {
  function form(personId: string, over: Record<string, string> = {}): FormData {
    const f = new FormData();
    f.set("personId", personId);
    f.set("name", "Geaendert");
    f.set("initialen", "GA");
    f.set("rolle", "bufdi");
    f.set("sollMinutenTag", "400");
    f.set("aktivVon", "2026-08-01");
    f.set("aktivBis", "");
    for (const [k, v] of Object.entries(over)) f.set(k, v);
    return f;
  }

  it("koordination aendert eine bestehende Person", async () => {
    const koordination = legePerson("dev:rike@test", "auftrag");
    const ziel = legePerson("dev:alina@test", "bufdi", { name: "Alt" });
    anmelden(koordination, true);

    const ergebnis = await personAendernAction({ ok: true }, form(ziel.id));
    expect(ergebnis).toEqual({ ok: true });
    expect(personNachId(t.db, ziel.id)).toMatchObject({ name: "Geaendert", sollMinutenTag: 400 });
  });

  /**
   * DER `sub` BLEIBT UNVERAENDERLICH, AUCH UEBER EIN MANIPULIERTES FORMULAR: `personAendernAction`
   * liest das Feld `sub` aus `formData` gar nicht erst — ein geaendertes `sub` haengte die gesamte
   * Geschichte einer Person still an eine andere Anmeldung um.
   */
  it("ein mitgeschicktes sub-Feld wird ignoriert — der sub bleibt stehen", async () => {
    const koordination = legePerson("dev:rike@test", "auftrag");
    const ziel = legePerson("dev:alina@test", "bufdi");
    anmelden(koordination, true);

    await personAendernAction({ ok: true }, form(ziel.id, { sub: "dev:uebernommen@test" }));
    expect(personNachId(t.db, ziel.id)!.sub).toBe("dev:alina@test");
  });

  it("fehlendes personId wirft", async () => {
    const koordination = legePerson("dev:rike@test", "auftrag");
    anmelden(koordination, true);

    await expect(personAendernAction({ ok: true }, form(""))).rejects.toThrow(/personId fehlt/);
  });

  it("unbekanntes personId wirft", async () => {
    const koordination = legePerson("dev:rike@test", "auftrag");
    anmelden(koordination, true);

    await expect(
      personAendernAction({ ok: true }, form("unbekannte-id")),
    ).rejects.toThrow(/nicht gefunden/);
  });

  it("auftrag darf keine Personen aendern — wirft", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const ziel = legePerson("dev:alina@test", "bufdi");
    anmelden(auftrag);

    await expect(personAendernAction({ ok: true }, form(ziel.id))).rejects.toThrow(
      /Keine Berechtigung/,
    );
  });

  /**
   * DER AUSSPERR-FALL, UND ZWAR SCHREIBEND (Abschlussreview K1) — die zweite der beiden Folgen, die
   * die Betreiberentscheidung vom 2026-08-14 abwenden sollte: die EINZIGE Koordinationsperson hat
   * ihr eigenes `aktivBis` auf gestern gesetzt, `darfPersonenVerwalten` lehnt sie seither ab
   * (`istAktiv` ist falsch). Ohne den Notausgang IN DER ACTION saehe sie als Suite-Admin zwar das
   * Formular (`personen/page.test.tsx` belegt das), koennte es aber nicht absenden — nur ein
   * direkter Datenbankeingriff hoebe die Sperre auf.
   *
   * DAS AUSDRUECKLICHE `rolle` IM FORMULAR IST PFLICHT UND KEINE FIXTUR-KOSMETIK: das `form()`
   * dieser Gruppe traegt sonst `bufdi`, und eine Reaktivierung, die die Person dabei still zur
   * BuFDi degradiert, loeste den Fall gerade NICHT auf — sie waere wieder aktiv, aber ohne das
   * Recht, das sie zurueckholen wollte. Deshalb pruefen die Zusicherungen unten BEIDE Felder.
   *
   * SEIT DEM QUELLENWECHSEL (2026-08-15) HEISST DIESE ROLLE `auftrag`, NICHT MEHR `koordination` —
   * und die Aussage wird dadurch SCHAERFER, nicht schwaecher: die Koordination selbst haengt jetzt
   * an der Auth-Gruppe und kann von diesem Formular gar nicht mehr entzogen werden; was hier
   * schiefgehen koennte, ist die stille Degradierung zur BuFDi, die ihr `darfEinstellenFuerAndere`
   * und `darfFreigabenSehen` naehme. Genau das prueft die Zeile weiterhin.
   */
  it("Aussperr-Fall: die beendete einzige Koordinationsperson reaktiviert sich als Suite-Admin — mit ihrer Rolle", async () => {
    const exRike = legePerson("dev:rike@test", "auftrag", { aktivBis: "2026-08-12" });
    sitzung = { user: { id: exRike.sub, groups: ["dashboard-admins"] } };

    const ergebnis = await personAendernAction(
      { ok: true },
      form(exRike.id, { rolle: "auftrag", aktivBis: "" }),
    );
    expect(ergebnis).toEqual({ ok: true });
    expect(personNachId(t.db, exRike.id)).toMatchObject({
      aktivBis: null,
      rolle: "auftrag",
    });
  });
});

describe("personBeendenAction — setzt aktivBis auf HEUTE", () => {
  function form(personId: string): FormData {
    const f = new FormData();
    f.set("personId", personId);
    return f;
  }

  it("koordination beendet eine aktive Person", async () => {
    const koordination = legePerson("dev:rike@test", "auftrag");
    const ziel = legePerson("dev:alina@test", "bufdi", { aktivBis: null });
    anmelden(koordination, true);

    await personBeendenAction(form(ziel.id));
    expect(personNachId(t.db, ziel.id)!.aktivBis).toBe(HEUTE);
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/aufgaben", "layout");
  });

  it("unbekanntes personId wirft", async () => {
    const koordination = legePerson("dev:rike@test", "auftrag");
    anmelden(koordination, true);

    await expect(personBeendenAction(form("unbekannte-id"))).rejects.toThrow(/nicht gefunden/);
  });

  it("auftrag darf keine Personen beenden — wirft", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const ziel = legePerson("dev:alina@test", "bufdi");
    anmelden(auftrag);

    await expect(personBeendenAction(form(ziel.id))).rejects.toThrow(/Keine Berechtigung/);
  });

  /**
   * DIE ZWEITE HAELFTE DES NOTAUSGANGS (Abschlussreview K1): `personBeendenAction` trug denselben
   * Riegel wie `personFormularGemeinsam` und musste ihn deshalb im selben Griff bekommen — sonst
   * bliebe eine der beiden Schreibwege der Personenverwaltung fuer den Betreiber verschlossen,
   * waehrend die andere offen ist.
   */
  it("Suite-Admin OHNE eigene personen-Zeile beendet eine Person", async () => {
    const ziel = legePerson("dev:alina@test", "bufdi", { aktivBis: null });
    sitzung = { user: { id: "dev:admin@test", groups: ["dashboard-admins"] } };

    await personBeendenAction(form(ziel.id));
    expect(personNachId(t.db, ziel.id)!.aktivBis).toBe(HEUTE);
  });
});

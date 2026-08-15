// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import {
  aufgaben,
  nachweise,
  personen,
  verlauf,
  type AufgabeRow,
  type PersonRow,
  type Rolle,
} from "../../_db/schema";
import type { Akteur } from "../../_lib/zugang";
import s from "../../_ui/aufgaben.module.css";

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
let mockDb: TestDb;
vi.mock("../../_db/client", () => ({ getDb: () => mockDb.db }));

import AufgabeDetailPage, { aufgabeInhalt } from "./page";

const HEUTE = "2026-08-13";

let t: TestDb;
beforeEach(() => {
  t = migrierteTestDb();
  mockDb = t;
  sitzung = null;
});
afterEach(async () => {
  await unmount();
  t.schliessen();
});

/**
 * DIE FIXTUR-ZEILE ALS `Akteur`. `istKoordination` STEHT AUSDRUECKLICH AM AUFRUF, NICHT ABGELEITET
 * AUS DER ZEILE (Quellenwechsel 2026-08-15): die Koordination kommt aus der Auth-Gruppe und liegt
 * damit auf einer ANDEREN Achse als `rolle` — eine koordinierende Person traegt in der Tabelle
 * typischerweise `auftrag`. Eine Ableitung aus der Zeile ginge gar nicht mehr: `ROLLEN` kennt
 * `koordination` nicht mehr. `akteur(rike, true)` macht an der Fixtur sichtbar, dass die Zusage die
 * Gruppe voraussetzt, waehrend `akteur(malte)` denselben `auftrag` OHNE Gruppe meint.
 */
function akteur(p: PersonRow, istKoordination = false): Akteur {
  return { person: p, istKoordination };
}

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

function legeAufgabe(extra: Partial<typeof aufgaben.$inferInsert> & { erstellerId: string }): AufgabeRow {
  return t.db
    .insert(aufgaben)
    .values({
      titel: "T",
      beschreibung: "B",
      prioritaet: "mittel",
      status: "verteilt",
      faelligAm: "2026-08-20",
      dauerMinuten: 60,
      ...extra,
    })
    .returning()
    .get();
}

function legeVerlauf(aufgabeId: string, ereignis: string, akteurId: string, ts: Date, notiz?: string) {
  return t.db.insert(verlauf).values({ aufgabeId, ereignis, akteurId, ts, notiz }).returning().get();
}

function legeNachweis(aufgabeId: string, text: string, erstelltVon: string) {
  return t.db.insert(nachweise).values({ aufgabeId, art: "text", text, erstelltVon }).returning().get();
}

/**
 * ANMELDEN — DIE SITZUNG STELLT DIE KOORDINATIONSGRUPPE, UND ZWAR AUSDRUECKLICH AM AUFRUF
 * (Quellenwechsel 2026-08-15): `istKoordination` kommt aus `canAdminModule("aufgaben")`
 * (`_lib/zugang.ts`s `akteurFuer`), also aus `session.user.groups` — nicht mehr aus
 * `personen.rolle`, die den Wert `koordination` gar nicht mehr kennt. Rolle und Koordination sind
 * zwei unabhaengige Achsen; welche der beiden eine Zusage traegt, steht deshalb am Aufruf
 * (`anmelden(rike, true)`) und nicht mehr verdeckt in der Fixtur-Zeile. Die FIXTUR wandert mit der
 * Quelle, die ERWARTUNG bleibt stehen.
 *
 * `iuk-aufgaben-koordination` ist der Registry-Vorgabewert (`core/registry.ts`);
 * `SUITE_ADMIN_GROUP_AUFGABEN` ist in der Testumgebung nicht gesetzt.
 */
function anmelden(p: PersonRow, koordiniert = false): void {
  sitzung = {
    user: { id: p.sub, groups: koordiniert ? ["iuk-aufgaben-koordination"] : [] },
  };
}

describe("aufgabeInhalt — Titel, Chip-Zeile, Erklärung ungekürzt, Metablock", () => {
  it("zeigt Titel, Zustand, Priorität, Nachweispflicht und die Erklärung VOLLSTÄNDIG", async () => {
    const malte = legePerson("dev:malte@test", "auftrag", { name: "Malte" });
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    const langerText = "Ein sehr ausführlicher Erklärungstext. ".repeat(20).trim();
    const a = legeAufgabe({
      titel: "Verbandskästen prüfen",
      beschreibung: langerText,
      prioritaet: "hoch",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "verteilt",
      nachweisPflicht: true,
      nachweisArt: "text",
    });
    await mount(aufgabeInhalt(t.db, akteur(malte), a, HEUTE));

    expect(query("h1").textContent).toBe("Verbandskästen prüfen");
    expect(document.body.textContent).toContain("Verteilt");
    expect(document.body.textContent).toContain("Hoch");
    expect(document.body.textContent).toContain("Nachweispflicht: Ja (Text)");
    expect(document.body.textContent).toContain(langerText);
  });

  it("zeigt den Metablock: Auftraggeber, Zugewiesen, Frist, Dauerschätzung, Prüfer", async () => {
    const malte = legePerson("dev:malte@test", "auftrag", { name: "Malte" });
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    const a = legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      faelligAm: "2026-08-25",
      dauerMinuten: 90,
    });
    await mount(aufgabeInhalt(t.db, akteur(malte), a, HEUTE));

    expect(document.body.textContent).toContain("Malte");
    expect(document.body.textContent).toContain("Alina");
    expect(document.body.textContent).toContain("90 Min.");
  });

  it("eine noch nicht verteilte Aufgabe zeigt „Noch nicht verteilt“ statt eines Namens", async () => {
    const malte = legePerson("dev:malte@test", "auftrag", { name: "Malte" });
    const a = legeAufgabe({ erstellerId: malte.id, zugewiesenAn: null, status: "eingegangen" });
    await mount(aufgabeInhalt(t.db, akteur(malte), a, HEUTE));
    expect(document.body.textContent).toContain("Noch nicht verteilt");
  });
});

describe("aufgabeInhalt — Nachweise sind enger als die Aufgabe (Spec §2)", () => {
  it("ein BuFDi, der die Aufgabe sehen darf (Peer-Sichtbarkeit), sieht NICHT ihre Nachweise", async () => {
    const malte = legePerson("dev:malte@test", "auftrag", { name: "Malte" });
    const zugewiesen = legePerson("dev:zug@test", "bufdi", { name: "Zugewiesene" });
    const fremderBufdi = legePerson("dev:fremd@test", "bufdi", { name: "FremdeBuFDi" });
    const a = legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: zugewiesen.id,
      prueferId: malte.id,
      status: "freigabe_offen",
    });
    legeNachweis(a.id, "Geheimer Bericht, den nur die Beteiligten sehen sollen.", zugewiesen.id);

    await mount(aufgabeInhalt(t.db, akteur(fremderBufdi), a, HEUTE));
    expect(document.body.textContent).not.toContain("Geheimer Bericht");
    expect(document.body.textContent).toContain(
      "Nachweise sind nur für Koordination, Ersteller, Zugewiesene und den eingetragenen Prüfer sichtbar.",
    );
  });

  it("die zugewiesene Person sieht den EIGENEN Nachweis", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const zugewiesen = legePerson("dev:zug@test", "bufdi");
    const a = legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: zugewiesen.id,
      prueferId: malte.id,
      status: "freigabe_offen",
    });
    legeNachweis(a.id, "Kurs durchgeführt, 8 Teilnehmende.", zugewiesen.id);

    await mount(aufgabeInhalt(t.db, akteur(zugewiesen), a, HEUTE));
    expect(document.body.textContent).toContain("Kurs durchgeführt, 8 Teilnehmende.");
  });

  /** Die neue Klausel aus `_lib/zugang.ts` (Aufgabe 16, Widerspruch — s. Bericht). */
  it("der eingetragene Prüfer sieht den Nachweis, obwohl er weder Ersteller noch Zugewiesener ist", async () => {
    const ersteller = legePerson("dev:e@test", "auftrag");
    const pruefer = legePerson("dev:p@test", "auftrag");
    const zugewiesen = legePerson("dev:z@test", "bufdi");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: zugewiesen.id,
      prueferId: pruefer.id,
      status: "freigabe_offen",
    });
    legeNachweis(a.id, "Nachweistext fuer den Pruefer.", zugewiesen.id);

    await mount(aufgabeInhalt(t.db, akteur(pruefer), a, HEUTE));
    expect(document.body.textContent).toContain("Nachweistext fuer den Pruefer.");
  });

  /**
   * DIE BETREIBERENTSCHEIDUNG AUS FIX-RUNDE 1 (`_lib/zugang.ts`s Kopfkommentar zur Pruefer-Klausel
   * von `darfNachweisSehen`): ein AUSGESCHIEDENER Pruefer sieht den Nachweis weiterhin (Sichtpraedikat,
   * kein `istAktiv`), bekommt aber ueber `aktionsOptionen`/`uebergang()`/`darfFreigeben` KEINE
   * Freigabe-Aktion mehr — „sehen ohne handeln zu koennen" ist hier die Zusage, nicht die Luecke.
   * Ein Test, der NUR eine Haelfte pruefte, koennte die andere unbemerkt verlieren.
   */
  it("ein AUSGESCHIEDENER Prüfer sieht den Nachweis weiterhin, bekommt aber keine Freigabe-Aktion mehr", async () => {
    const ersteller = legePerson("dev:e2@test", "auftrag");
    const exPruefer = legePerson("dev:p2@test", "auftrag", { aktivBis: "2020-01-01" });
    const zugewiesen = legePerson("dev:z2@test", "bufdi");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: zugewiesen.id,
      prueferId: exPruefer.id,
      status: "freigabe_offen",
    });
    legeNachweis(a.id, "Nachweistext fuer den ausgeschiedenen Pruefer.", zugewiesen.id);

    await mount(aufgabeInhalt(t.db, akteur(exPruefer), a, HEUTE));
    expect(document.body.textContent).toContain("Nachweistext fuer den ausgeschiedenen Pruefer.");
    expect(queryAll("[data-testid^='freigeben-']")).toHaveLength(0);
    expect(queryAll("[data-testid^='zurueckweisen-']")).toHaveLength(0);
    expect(document.body.textContent).toContain("Für diese Aufgabe ist derzeit keine Aktion möglich.");
  });
});

describe("aufgabeInhalt — der Verlauf als Journal", () => {
  /**
   * DIE EINFUEGEREIHENFOLGE IST BEWUSST NICHT DIE ZEITLICHE (Fix-Runde 1, Important 2): vorher
   * standen die drei Zeilen in aufsteigender `ts`-Reihenfolge im Code, sodass ein entferntes
   * `orderBy(asc(verlauf.ts))` in `_db/queries.ts`s `verlaufFuer` unbemerkt geblieben waere — SQLite
   * haette einfach die Einfuegereihenfolge zurueckgegeben, zufaellig identisch mit der erwarteten.
   * `gestartet` (der spaeteste Zeitpunkt) steht jetzt ZUERST im Code, `eingestellt` (der frueheste)
   * an zweiter Stelle — nur ein echtes `ORDER BY ts ASC` kann die Zusicherung unten noch erfuellen.
   */
  it("zeigt jeden Eintrag vollständig, mit Akteur und Zeitpunkt, in AUFSTEIGENDER Reihenfolge", async () => {
    const malte = legePerson("dev:malte@test", "auftrag", { name: "Malte" });
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    const a = legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "in_arbeit" });
    legeVerlauf(a.id, "gestartet", alina.id, new Date("2026-08-12T10:00:00Z"));
    legeVerlauf(a.id, "eingestellt", malte.id, new Date("2026-08-10T08:00:00Z"));
    legeVerlauf(a.id, "verteilt", malte.id, new Date("2026-08-11T09:00:00Z"));

    await mount(aufgabeInhalt(t.db, akteur(malte), a, HEUTE));
    const eintraege = queryAll("li").filter((li) => li.closest(`ul.${s.journal}`) !== null);
    expect(eintraege).toHaveLength(3);
    const texte = eintraege.map((li) => li.textContent ?? "");
    expect(texte[0]).toContain("Malte");
    expect(texte[0]).toContain("Eingestellt");
    expect(texte[1]).toContain("Verteilt");
    expect(texte[2]).toContain("Alina");
    expect(texte[2]).toContain("Bearbeitung gestartet");
  });

  it("eine Vertretungsfreigabe ist als solche erkennbar — die Notiz steht im Journal", async () => {
    // `rike` KOORDINIERT, TRAEGT ABER `auftrag` (Quellenwechsel 2026-08-15) — die Vertretung ist
    // eine Frage von `istKoordination` (`istVertretungsfreigabe`), nicht mehr eine der Rolle,
    // weshalb das `true` unten die fachlich richtige Fixtur ist. Die Zusicherung selbst haengt
    // NICHT daran: die Notiz steht in `verlauf` und wird ohnehin gerendert.
    const rike = legePerson("dev:rike@test", "auftrag", { name: "Rike" });
    const tomke = legePerson("dev:tomke@test", "auftrag", { name: "Tomke" });
    const carla = legePerson("dev:carla@test", "bufdi", { name: "Carla" });
    const a = legeAufgabe({
      erstellerId: tomke.id,
      zugewiesenAn: carla.id,
      prueferId: tomke.id,
      status: "abgeschlossen",
    });
    legeVerlauf(
      a.id,
      "abgeschlossen",
      rike.id,
      new Date("2026-08-12T10:00:00Z"),
      "Freigegeben von Rike in Vertretung für Tomke",
    );

    await mount(aufgabeInhalt(t.db, akteur(rike, true), a, HEUTE));
    expect(document.body.textContent).toContain("Freigegeben von Rike in Vertretung für Tomke");
  });
});

describe("AufgabeDetailPage — Sichtrecht und die Grenze der Erklärseiten-Ausnahme", () => {
  it("/a/<unbekannt> ergibt notFound() — die Grenze der Ausnahme aus dem Spec-Nachtrag", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    anmelden(alina);
    await expect(
      AufgabeDetailPage({ params: Promise.resolve({ id: "unbekannte-id" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("eine Person ohne Sichtrecht bekommt notFound(), keine leere Seite", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const tomke = legePerson("dev:tomke@test", "auftrag");
    const a = legeAufgabe({ erstellerId: malte.id, prueferId: malte.id, zugewiesenAn: null });
    anmelden(tomke);
    await expect(
      AufgabeDetailPage({ params: Promise.resolve({ id: a.id }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("Sitzung ohne personen-Zeile: die Erklärseite (200), kein notFound()", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const a = legeAufgabe({ erstellerId: malte.id, prueferId: malte.id });
    sitzung = { user: { id: "dev:unbekannt@test" } };
    const element = await AufgabeDetailPage({ params: Promise.resolve({ id: a.id }) });
    await mount(element);
    expect(document.body.textContent).toContain("Du bist noch nicht im Modul eingetragen.");
  });

  it("die Koordination sieht jede Aufgabe (200), auch eine fremde", async () => {
    // ALLEIN DIE GRUPPE TRAEGT DIESE ZUSAGE: `rike` ist derselbe `auftrag` wie `tomke` im Test
    // darueber, der auf einer fremden Aufgabe `notFound()` bekommt. Der Unterschied ist das `true`.
    const rike = legePerson("dev:rike@test", "auftrag");
    const malte = legePerson("dev:malte@test", "auftrag");
    const a = legeAufgabe({ erstellerId: malte.id, prueferId: malte.id, titel: "Fremde Aufgabe" });
    anmelden(rike, true);
    const element = await AufgabeDetailPage({ params: Promise.resolve({ id: a.id }) });
    await mount(element);
    expect(query("h1").textContent).toBe("Fremde Aufgabe");
  });
});

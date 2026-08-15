// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { personen, aufgaben, type PersonRow, type Rolle } from "../_db/schema";
import type { Akteur } from "../_lib/zugang";

const { EinstiegAuftrag } = await import("./EinstiegAuftrag");

let t: TestDb;
beforeEach(() => {
  t = migrierteTestDb();
});
afterEach(async () => {
  await unmount();
  t.schliessen();
});

const HEUTE = "2026-08-13";

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

function legeAufgabe(extra: Partial<typeof aufgaben.$inferInsert> & { erstellerId: string }) {
  return t.db
    .insert(aufgaben)
    .values({
      titel: "T",
      beschreibung: "B",
      prioritaet: "mittel",
      status: "eingegangen",
      faelligAm: "2026-08-20",
      dauerMinuten: 60,
      ...extra,
    })
    .returning()
    .get();
}

/**
 * DIE FIXTUR-ZEILE ALS `Akteur` — der Refactor auf `Akteur` (`_lib/zugang.ts`) ändert die
 * AUFRUFFORM, NICHT das Verhalten: `istKoordination` folgt hier weiterhin genau der Rolle der
 * Zeile, damit jede Zusage dieser Datei unverändert bleibt.
 */
function akteur(p: PersonRow): Akteur {
  return { person: p, istKoordination: p.rolle === "koordination" };
}

describe("EinstiegAuftrag — der Knopf, eigene Auftraege, Freigabe-Warteschlange (Spec §8.3)", () => {
  it("traegt den Knopf „Aufgabe einstellen“, der auf /neu fuehrt", async () => {
    const malte = legePerson("dev:malte@test", "auftrag", { name: "Malte" });
    await mount(<EinstiegAuftrag db={t.db} akteur={akteur(malte)} heute={HEUTE} />);
    const knopf = queryAll<HTMLAnchorElement>("a").find((a) => a.textContent === "Aufgabe einstellen");
    expect(knopf?.getAttribute("href")).toBe("/neu");
  });

  it("zeigt NUR die eigenen Auftraege — ein fremder Ersteller erscheint nicht", async () => {
    const malte = legePerson("dev:malte@test", "auftrag", { name: "Malte" });
    const tomke = legePerson("dev:tomke@test", "auftrag", { name: "Tomke" });
    legeAufgabe({ titel: "Meine Aufgabe", erstellerId: malte.id });
    legeAufgabe({ titel: "Fremde Aufgabe", erstellerId: tomke.id });

    await mount(<EinstiegAuftrag db={t.db} akteur={akteur(malte)} heute={HEUTE} />);

    const abschnitt = query("#auftraege");
    expect(abschnitt.textContent).toContain("Meine Aufgabe");
    expect(abschnitt.textContent).not.toContain("Fremde Aufgabe");
  });

  /*
   * ZUSTAND UND EMPFAENGER, MIT VONEINANDER VERSCHIEDENEN WERTEN (Lehre 2/3 dieser Aufgabenreihe):
   * eine noch nicht verteilte Aufgabe traegt „Noch nicht verteilt", eine verteilte den NAMEN der
   * Empfaengerin — zwei unterscheidbare Saetze, kein einziger Platzhalter fuer beide Faelle.
   */
  it("zeigt je Zeile Zustand UND Empfaenger — „noch nicht verteilt“ unterscheidet sich vom Namen", async () => {
    const malte = legePerson("dev:malte@test", "auftrag", { name: "Malte" });
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    legeAufgabe({ titel: "Unverteilt", erstellerId: malte.id, status: "eingegangen", zugewiesenAn: null });
    legeAufgabe({
      titel: "Verteilt an Alina", erstellerId: malte.id, zugewiesenAn: alina.id,
      prueferId: malte.id, status: "verteilt",
    });

    await mount(<EinstiegAuftrag db={t.db} akteur={akteur(malte)} heute={HEUTE} />);

    const zeilen = queryAll("#auftraege li");
    expect(zeilen).toHaveLength(2);
    const unverteilteZeile = zeilen.find((z) => z.textContent?.includes("Unverteilt"))!;
    const verteilteZeile = zeilen.find((z) => z.textContent?.includes("Verteilt an Alina"))!;
    expect(unverteilteZeile.textContent).toContain("Noch nicht verteilt");
    expect(unverteilteZeile.textContent).toContain("Zu verteilen");
    expect(verteilteZeile.textContent).toContain("Empfänger: Alina");
    expect(verteilteZeile.textContent).toContain("Verteilt");
  });

  it("Leerzustand: „Noch keine eigenen Aufträge.“", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    await mount(<EinstiegAuftrag db={t.db} akteur={akteur(malte)} heute={HEUTE} />);
    expect(query("#auftraege").textContent).toContain("Noch keine eigenen Aufträge.");
  });

  /*
   * FUER `auftrag` BLEIBT „IN VERTRETUNG" STRUKTURELL IMMER LEER (`istVertretungsfreigabe` verlangt
   * `rolle === "koordination"`, `_lib/zugang.ts`) — die Trennung „meine"/„in Vertretung" MIT je
   * einem Fall auf BEIDEN Seiten ist deshalb keine Aussage, die dieser Einstieg je selbst zeigen
   * kann; sie gehoert der Rolle, fuer die Vertretung ueberhaupt vorkommt (`freigaben/page.test.tsx`
   * mit `koordination`, und `EinstiegKoordination.test.tsx`). Hier wird geprueft, dass „meine"
   * korrekt fuellt UND „in Vertretung" nicht faelschlich mitzieht, was eine fremde Freigabe (mit
   * einem ANDEREN Pruefer) waere.
   */
  it("„meine“ zeigt die eigene Freigabe; eine fremde (anderer Pruefer) erscheint in KEINER Liste", async () => {
    const malte = legePerson("dev:malte@test", "auftrag", { name: "Malte" });
    const rike = legePerson("dev:rike@test", "koordination", { name: "Rike" });
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    // MEINE: Malte ist der eingetragene Pruefer.
    legeAufgabe({
      titel: "Meine Freigabe", erstellerId: rike.id, zugewiesenAn: alina.id,
      prueferId: malte.id, status: "freigabe_offen",
    });
    // EIN ANDERER PRUEFER (Rike) — `darfFreigeben` lehnt das fuer Malte rundweg ab (weder Pruefer
    // noch koordination); die Aufgabe darf in KEINER seiner beiden Listen auftauchen.
    legeAufgabe({
      titel: "Anderer Pruefer", erstellerId: rike.id, zugewiesenAn: alina.id,
      prueferId: rike.id, status: "freigabe_offen",
    });

    await mount(<EinstiegAuftrag db={t.db} akteur={akteur(malte)} heute={HEUTE} />);

    const abschnitt = query("#freigabe");
    expect(abschnitt.textContent).toContain("Meine Freigabe");
    expect(abschnitt.textContent).not.toContain("Anderer Pruefer");
    expect(abschnitt.textContent).toContain("Keine Freigabe in Vertretung offen");
  });

  it("Leerzustaende der Freigabe-Warteschlange, ausgeschrieben", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    await mount(<EinstiegAuftrag db={t.db} akteur={akteur(malte)} heute={HEUTE} />);
    const abschnitt = query("#freigabe");
    expect(abschnitt.textContent).toContain("Keine Freigabe offen");
    expect(abschnitt.textContent).toContain("Keine Freigabe in Vertretung offen");
  });

  /*
   * DIE KERNZUSAGE DER GANZEN AUFGABE (Spec §8.3, Brief woertlich): kein Weg zum Verteilen. Sucht
   * aktiv nach einem Verweis/Knopf, statt die Abwesenheit nur zu behaupten — dieselbe Disziplin wie
   * die e2e-Gegenprobe auf `/verteilen` (404 fuer `auftrag`).
   */
  it("enthaelt keinen Weg zum Verteilen — kein Verweis auf /verteilen, kein „Verteilen“-Knopf", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    legeAufgabe({ titel: "Im Posteingang", erstellerId: malte.id, status: "eingegangen" });

    await mount(<EinstiegAuftrag db={t.db} akteur={akteur(malte)} heute={HEUTE} />);

    const hrefs = queryAll<HTMLAnchorElement>("a").map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.includes("verteilen"))).toBe(false);
    const beschriftungen = [
      ...queryAll("a").map((a) => a.textContent),
      ...queryAll("button").map((b) => b.textContent),
    ];
    expect(beschriftungen).not.toContain("Verteilen");
  });

  it("die Kontextzeile nennt Anzahl, offen und Freigabe (Spec §9.4-Beispiel)", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    legeAufgabe({ titel: "A", erstellerId: malte.id, status: "eingegangen" });
    legeAufgabe({ titel: "B", erstellerId: malte.id, status: "abgeschlossen" });
    await mount(<EinstiegAuftrag db={t.db} akteur={akteur(malte)} heute={HEUTE} />);
    expect(document.body.textContent).toContain("2 Aufträge insgesamt");
    expect(document.body.textContent).toContain("1 offen");
  });
});

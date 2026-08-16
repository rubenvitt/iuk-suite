// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { personen, aufgaben, type PersonRow, type Rolle } from "../_db/schema";
import { montagDerWoche, wochenTage } from "../_lib/datum";
import { lage } from "../_lib/lage";
import type { Akteur } from "../_lib/zugang";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const { EinstiegAuftrag } = await import("./EinstiegAuftrag");

/*
 * „MEINE AUFTRAEGE" NACH DER OBERFLAECHEN-SPEC (2026-08-16 §3.4, §5.3).
 *
 * FUER DIESE ROLLE EXISTIERT EBENE 4 DES AUFBAUS NICHT (§3.4, R3-Ausnahmetabelle): „Eigene
 * Auftraege" zeigt JEDE eigene Zeile ungedeckelt, jede Zone waere eine wortwoertliche
 * Wiederholung. Die Tests unten pruefen deshalb ausdruecklich die ABWESENHEIT von Zonen — eine
 * Abwesenheit, die man behaupten und nicht messen wuerde, ist keine Zusage.
 */

let t: TestDb;
beforeEach(() => {
  t = migrierteTestDb();
});
afterEach(async () => {
  await unmount();
  t.schliessen();
});

const HEUTE = "2026-08-13";
const TAGE = wochenTage(montagDerWoche(HEUTE));

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
      sollMinutenTag: extra.sollMinutenTag ?? 468,
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

function akteur(p: PersonRow, istKoordination = false): Akteur {
  return { person: p, istKoordination };
}

async function zeige(p: PersonRow): Promise<void> {
  const a = akteur(p);
  await mount(<EinstiegAuftrag db={t.db} akteur={a} heute={HEUTE} lage={lage(t.db, a, HEUTE, TAGE)} />);
}

function flaeche(): HTMLElement {
  return query("[data-testid='aufgaben-flaeche']");
}

describe("EinstiegAuftrag — der Aufbau aus §3.4", () => {
  it("die Fuehrungskarte ist das ERSTE Kind von `aufgaben-flaeche`", async () => {
    const malte = legePerson("malte", "auftrag", { name: "Malte" });
    legeAufgabe({ erstellerId: malte.id, titel: "Verbandskästen" });
    await zeige(malte);
    expect(flaeche().firstElementChild?.getAttribute("data-rolle")).toBe("fuehrung");
  });

  /**
   * DIE KERNZUSAGE DER MODULSPEC §8.3 IN BILDFORM (§4.2, §5.3): Rang 2 und Rang 3 tragen KEINEN
   * Primaerknopf. Malte darf mit einem ueberfaelligen Auftrag bei einer BuFDi nichts tun — die
   * Uebergangstabelle kennt fuer ihn dort keine Aktion, und die Abwesenheit IST die Auskunft.
   */
  it("traegt bei einem unverteilten Auftrag GAR keinen Primaerknopf", async () => {
    const malte = legePerson("malte", "auftrag", { name: "Malte" });
    legeAufgabe({ erstellerId: malte.id, titel: "Verbandskästen" });
    await zeige(malte);
    expect(flaeche().querySelectorAll(".ant-btn-primary")).toHaveLength(0);
  });

  it("traegt auch bei voller Lage hoechstens einen `.ant-btn-primary`", async () => {
    const malte = legePerson("malte", "auftrag", { name: "Malte" });
    const alina = legePerson("alina", "bufdi", { name: "Alina" });
    legeAufgabe({ erstellerId: malte.id, titel: "Unverteilt" });
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      titel: "Freigabe", status: "freigabe_offen",
    });
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      titel: "Überfällig", status: "verteilt", faelligAm: "2026-08-01",
    });
    await zeige(malte);
    expect(flaeche().querySelectorAll(".ant-btn-primary").length).toBeLessThanOrEqual(1);
  });

  /**
   * EBENE 4 EXISTIERT FUER DIESE ROLLE NICHT (§3.4). Gemessen ueber `data-anlass`, das jede Zone
   * traegt — sonst waere „keine Zonen" eine Behauptung ueber etwas, das der Test gar nicht sucht.
   */
  it("bildet KEINE Zone, auch wenn mehrere Sprossen belegt sind", async () => {
    const malte = legePerson("malte", "auftrag", { name: "Malte" });
    const alina = legePerson("alina", "bufdi", { name: "Alina" });
    legeAufgabe({ erstellerId: malte.id, titel: "Unverteilt A" });
    legeAufgabe({ erstellerId: malte.id, titel: "Unverteilt B" });
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      titel: "Überfällig", status: "verteilt", faelligAm: "2026-08-01",
    });
    await zeige(malte);
    expect(queryAll("[data-anlass]")).toHaveLength(0);
  });

  it("die Kontextzeile nennt alle vier Kennzahlen und schreibt die Null als Wort", async () => {
    const malte = legePerson("malte", "auftrag");
    legeAufgabe({ erstellerId: malte.id });
    await zeige(malte);
    const zeile = queryAll("p")
      .map((p) => p.textContent ?? "")
      .find((z) => z.includes("Auftrag"));
    expect(zeile).toBe("1 Auftrag · 1 offen · 1 unverteilt · nichts wartet auf deine Freigabe");
  });
});

describe("EinstiegAuftrag — „Eigene Auftraege“ (Flaeche der Rolle, ungedeckelt)", () => {
  it("zeigt NUR die eigenen Auftraege — ein fremder Ersteller erscheint nicht", async () => {
    const malte = legePerson("malte", "auftrag", { name: "Malte" });
    const rike = legePerson("rike", "auftrag", { name: "Rike" });
    legeAufgabe({ erstellerId: malte.id, titel: "Meiner" });
    legeAufgabe({ erstellerId: rike.id, titel: "Fremder" });
    await zeige(malte);
    const liste = query("#auftraege");
    expect(liste.textContent).toContain("Meiner");
    expect(liste.textContent).not.toContain("Fremder");
  });

  /**
   * REGEL D NIMMT DIE FLAECHE DER ROLLE AUS (§3.4): „Eigene Auftraege" ist kein VORRAT, aus dem
   * heraus man an einen anderen Ort geht, sondern die Flaeche selbst — `/archiv` zeigt nur die
   * abgeschlossenen und waere fuer die offenen ein Deckel ins Leere.
   */
  it("zeigt alle acht Auftraege ohne Deckel", async () => {
    const malte = legePerson("malte", "auftrag");
    for (let i = 0; i < 8; i++) legeAufgabe({ erstellerId: malte.id, titel: `A${i}` });
    await zeige(malte);
    expect(query("#auftraege h2").textContent).toBe("Eigene Aufträge (8)");
    expect(query("#auftraege").querySelectorAll("li")).toHaveLength(8);
    const deckel = Array.from(query("#auftraege").querySelectorAll("a")).filter((a) =>
      (a.textContent ?? "").includes("weitere"),
    );
    expect(deckel).toEqual([]);
  });

  /** GENAU EINE Angabe je Zeile (§3.6): „Empfänger: X" bzw. „Noch nicht verteilt". */
  it("zeigt je Zeile genau einen Rollenzusatz — Empfaenger oder „Noch nicht verteilt“", async () => {
    const malte = legePerson("malte", "auftrag");
    const alina = legePerson("alina", "bufdi", { name: "Alina" });
    legeAufgabe({ erstellerId: malte.id, titel: "Offen" });
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      titel: "Zugewiesen", status: "verteilt",
    });
    await zeige(malte);
    const zusaetze = queryAll("#auftraege [data-rollen-zusatz]").map((s) => s.textContent);
    expect(zusaetze).toEqual(["Noch nicht verteilt", "Empfänger: Alina"]);
  });

  it("Leerzustand: „Noch keine eigenen Aufträge.“", async () => {
    const malte = legePerson("malte", "auftrag");
    await zeige(malte);
    expect(query("#auftraege").textContent).toContain("Noch keine eigenen Aufträge.");
  });
});

describe("EinstiegAuftrag — kein Weg zum Verteilen (Modulspec §8.3)", () => {
  /**
   * SUCHT AKTIV DANACH, STATT ES ZU BEHAUPTEN. Das ist die andere Haelfte der Kernzusage: nicht
   * nur die 404-Gegenprobe auf `/verteilen`, sondern die Abwesenheit des Verweises AUF DIESER
   * SEITE. „Noch nicht verteilt" bleibt Text, nie Link.
   */
  it("kein `href` und kein Knopf traegt den Teilstring `verteilen`", async () => {
    const malte = legePerson("malte", "auftrag");
    const alina = legePerson("alina", "bufdi", { name: "Alina" });
    legeAufgabe({ erstellerId: malte.id, titel: "Unverteilt" });
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      titel: "Zugewiesen", status: "verteilt",
    });
    await zeige(malte);
    const ziele = queryAll<HTMLAnchorElement>("a").map((a) => a.getAttribute("href") ?? "");
    expect(ziele.filter((z) => z.includes("verteilen"))).toEqual([]);
    expect(queryAll("button").map((b) => b.textContent)).not.toContain("Verteilen");
  });

  it("die Fuehrungskarte des Auftraggebers oeffnet keinen Verteil-Dialog", async () => {
    const malte = legePerson("malte", "auftrag");
    legeAufgabe({ erstellerId: malte.id, titel: "Unverteilt" });
    await zeige(malte);
    expect(queryAll("[data-testid^='verteilen-']")).toHaveLength(0);
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { personen, aufgaben, routinen, type PersonRow, type Rolle } from "../_db/schema";
import { wochenTage } from "../_lib/datum";
import { lage } from "../_lib/lage";
import type { Akteur } from "../_lib/zugang";
import s from "./aufgaben.module.css";

/*
 * MOCK VON `next/navigation` — `EinstiegBufdi` rendert `TagesWaehler` (Client-Insel), die
 * `useRouter`/`usePathname`/`useSearchParams` braucht: einen echten App-Router-Kontext stellt
 * jsdom+`mount()` nicht (dieselbe Form wie `TagesWaehler.test.tsx`/`QrView.test.tsx`).
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const { EinstiegBufdi } = await import("./EinstiegBufdi");

/*
 * „MEINE WOCHE" NACH DER OBERFLAECHEN-SPEC (2026-08-16 §3.4, §5.1).
 *
 * DIE KACHEL-FAELLE SIND MIT DEN KACHELN ENTFALLEN (§11.1) — „eine 0-Kachel bleibt stehen", „jede
 * Kachel mit Zahl > 0 traegt ein Ziel" und die drei Ankerpruefungen (`#freigabe-offen`,
 * `#zurueckgewiesen`) pruefen eine Bauform, die §1.4 aufhebt. AN IHRE STELLE TRITT DIE STAERKERE
 * ZUSAGE AUS `lage.test.ts`: dort ist jede Sprosse jeder Leiter erschoepfend belegt, hier bleibt,
 * was nur ueber das gerenderte DOM pruefbar ist — der Wrapper, die Reihenfolge, die Zahl der
 * Primaerknoepfe und die Zeilenaktionen mit ihren versteckten Feldern.
 *
 * `lage()` WIRD HIER ECHT GERUFEN, nicht von Hand gebaut: `page.tsx` tut dasselbe, und ein Test
 * gegen ein handgereichtes `Lage`-Objekt pruefte die Verdrahtung nicht, sondern setzte sie voraus.
 */

let t: TestDb;
beforeEach(() => {
  t = migrierteTestDb();
});
afterEach(async () => {
  await unmount();
  t.schliessen();
});

const HEUTE = "2026-08-10"; // ein Montag
const MONTAG = "2026-08-10";
const TAGE = wochenTage(MONTAG);

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

/** Der ganze Aufruf, wie `aufgabenInhalt` ihn stellt — `lage()` genau einmal, aus derselben Woche. */
async function zeige(p: PersonRow, params: { woche?: string; tag?: string } = {}): Promise<void> {
  const a = akteur(p);
  const tage = params.woche ? wochenTage(params.woche) : TAGE;
  await mount(
    <EinstiegBufdi
      db={t.db}
      akteur={a}
      heute={HEUTE}
      lage={lage(t.db, a, HEUTE, tage)}
      wocheParam={params.woche}
      tagParam={params.tag}
    />,
  );
}

function flaeche(): HTMLElement {
  return query("[data-testid='aufgaben-flaeche']");
}

describe("EinstiegBufdi — der Aufbau aus §3.4", () => {
  /**
   * DIE ZUSAGE, DIE EINEN EIGENEN WRAPPER UEBERHAUPT NOETIG MACHT (§3.3, §9/S7): „die
   * Fuehrungskarte ist das erste Element in `aufgaben-content`" waere FALSCH — `page.tsx` legt
   * jenen Wrapper um den GANZEN Einstieg, der `SeitenKopf` steht darin. Ein Test, der etwas
   * anderes misst als sein Name sagt, gehoert in dieselbe Familie wie die Fallen 10 und 11.
   */
  it("die Fuehrungskarte ist das ERSTE Kind von `aufgaben-flaeche`", async () => {
    const alina = legePerson("alina", "bufdi", { name: "Alina" });
    legeAufgabe({ erstellerId: alina.id, zugewiesenAn: alina.id, status: "verteilt" });
    await zeige(alina);
    expect(flaeche().firstElementChild?.getAttribute("data-rolle")).toBe("fuehrung");
  });

  /**
   * DER ZAEHLRIEGEL, GEMESSEN IM WRAPPER UND NICHT IN `main` (§1.3): die Suite-Shell bringt eigene
   * Bedienelemente mit. Innerhalb der Flaeche gehoert der eine Primaerknopf der Karte.
   */
  it("traegt in der ganzen Flaeche hoechstens einen `.ant-btn-primary`", async () => {
    const alina = legePerson("alina", "bufdi", { name: "Alina" });
    const malte = legePerson("malte", "auftrag", { name: "Malte" });
    // Drei Zeilen, die frueher drei Kacheln gefuellt haetten: eine ueberfaellige, eine
    // zurueckgewiesene und eine wartende. Genau EINE fuehrt, die uebrigen werden Zonen.
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      titel: "Überfällig", status: "verteilt", faelligAm: "2026-08-01",
    });
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      titel: "Zurück", status: "zurueckgewiesen",
    });
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      titel: "Wartet", status: "verteilt", vorschlagDatum: "2026-08-12",
    });
    await zeige(alina);
    expect(flaeche().querySelectorAll(".ant-btn-primary").length).toBeLessThanOrEqual(1);
  });

  it("der Wochenwaehler steht im Seitenkopf und damit AUSSERHALB der Flaeche", async () => {
    const alina = legePerson("alina", "bufdi");
    await zeige(alina);
    expect(query("[aria-label='Nächste Woche']")).toBeTruthy();
    expect(flaeche().querySelector("[aria-label='Nächste Woche']")).toBeNull();
  });

  /** Die Kontextzeile traegt die Zahlen der gestrichenen Kacheln — inklusive der Nullen als WORT. */
  it("die Kontextzeile kommt aus `lage()` und schreibt die Null als Wort", async () => {
    const alina = legePerson("alina", "bufdi");
    await zeige(alina);
    const kontext = queryAll("p").map((p) => p.textContent ?? "");
    const zeile = kontext.find((z) => z.startsWith("KW "));
    expect(zeile, "keine Kontextzeile gefunden").toBeTruthy();
    expect(zeile).toContain("nichts überfällig");
    expect(zeile).toContain("nichts im Posteingang");
    // DIE NULL ALS WORT, NIE ALS ZIFFER (§3.5) — geprueft an den KENNZAHLEN, nicht am
    // Stundenpaar: „0 von 39 Std." ist EIN Wert mit Nenner, keine Kennzahl mit dem Wert null.
    expect(zeile).not.toMatch(/0 (überfällig|im Posteingang|Aufgaben eingeplant)/);
  });

  /** Die Flaeche der Rolle steht IMMER, auch leer (Regel R2). */
  it("die Wochenachse steht auch ohne jede Aufgabe", async () => {
    const alina = legePerson("alina", "bufdi");
    await zeige(alina);
    expect(queryAll(`.${s.tagSpalte}`).length).toBeGreaterThanOrEqual(5);
    expect(query("[data-rolle='tagesliste']")).toBeTruthy();
    expect(query("[data-rolle='wochengitter']")).toBeTruthy();
  });

  it("liest die Woche aus wocheParam, nicht aus heute", async () => {
    const alina = legePerson("alina", "bufdi");
    await zeige(alina, { woche: "2026-08-17" });
    expect(query("[data-rolle='wochengitter']").textContent).toContain("17.08");
  });
});

describe("EinstiegBufdi — Regel V: die Achse sagt, wenn sie unvollstaendig ist", () => {
  /**
   * DIE FUSSZEILE IST NICHT KOSMETIK, SONDERN DER BELEG FUER DIE PARTITIONSZUSAGE (§4.1): sie ist
   * der Ort, an dem die Restmenge der BuFDi-Leiter sichtbar wird. Ohne sie faellt eine
   * `in_arbeit`-Zeile ohne Plantag durch jede Sprosse UND durch jede Spalte.
   */
  it("nennt eine Aufgabe ohne Plantag als „ohne Termin“", async () => {
    const alina = legePerson("alina", "bufdi");
    const malte = legePerson("malte", "auftrag");
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      titel: "Ohne Termin", status: "in_arbeit", planDatum: null,
    });
    await zeige(alina);
    const text = flaeche().textContent ?? "";
    expect(text).toContain("außerhalb dieser Woche");
    expect(text).toContain("ohne Termin");
  });

  it("nennt eine Aufgabe mit Plantag ausserhalb der Woche mit ihrem Datum", async () => {
    const alina = legePerson("alina", "bufdi");
    const malte = legePerson("malte", "auftrag");
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      titel: "Nächste Woche", status: "verteilt", planDatum: "2026-08-19",
    });
    await zeige(alina);
    expect(flaeche().textContent).toContain("außerhalb dieser Woche");
    expect(flaeche().textContent).toContain("19.08");
  });

  it("sagt nichts, wenn alles in der Achse Platz hat", async () => {
    const alina = legePerson("alina", "bufdi");
    const malte = legePerson("malte", "auftrag");
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      status: "verteilt", planDatum: MONTAG,
    });
    await zeige(alina);
    expect(flaeche().textContent).not.toContain("außerhalb dieser Woche");
  });
});

describe("EinstiegBufdi — die Zone „Einzuplanen“ (Regel R3, Regel D)", () => {
  /**
   * BEI n = 1 NENNT DIE KARTE DIE AUFGABE, UND KEINE ZONE WIEDERHOLT SIE (R3). Das ist genau der
   * Grund, aus dem §3.2 der DOM-Id `#posteingang` die garantierte Anwesenheit entzieht — und aus
   * dem die beiden e2e-Stellen auf `getByRole` umgestellt sind.
   */
  it("bei genau einer wartenden Aufgabe entsteht KEINE Zone — die Karte nennt sie", async () => {
    const alina = legePerson("alina", "bufdi");
    const malte = legePerson("malte", "auftrag");
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      titel: "Einzige", status: "verteilt",
    });
    await zeige(alina);
    expect(queryAll("#posteingang")).toHaveLength(0);
    expect(query("[data-rolle='fuehrung']").textContent).toContain("Einzige");
  });

  it("ab zwei wartenden Aufgaben entsteht die Zone mit ihrer Zahl", async () => {
    const alina = legePerson("alina", "bufdi");
    const malte = legePerson("malte", "auftrag");
    legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id, titel: "A", status: "verteilt" });
    legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id, titel: "B", status: "verteilt" });
    await zeige(alina);
    const zone = query("#posteingang");
    expect(zone.querySelector("h2")?.textContent).toBe("Einzuplanen (2)");
    expect(zone.querySelectorAll("li")).toHaveLength(2);
  });

  /**
   * REGEL D — EIN DECKEL SETZT EINEN AUSGANG VORAUS. „Einzuplanen" hat mit `/plan/<eigene>` ein
   * Sammelziel und wird deshalb bei fuenf Zeilen gekappt.
   */
  it("deckelt bei fuenf Zeilen und nennt den Ausgang", async () => {
    const alina = legePerson("alina", "bufdi");
    const malte = legePerson("malte", "auftrag");
    for (let i = 0; i < 7; i++) {
      legeAufgabe({
        erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
        titel: `A${i}`, status: "verteilt", faelligAm: `2026-08-2${i}`,
      });
    }
    await zeige(alina);
    const zone = query("#posteingang");
    expect(zone.querySelectorAll("li")).toHaveLength(5);
    const deckel = Array.from(zone.querySelectorAll("a")).find((a) =>
      (a.textContent ?? "").includes("weitere"),
    );
    expect(deckel?.textContent).toContain("und 2 weitere");
    expect(deckel?.getAttribute("href")).toBe(`/plan/${alina.id}`);
  });

  /**
   * „ANNEHMEN" BINDET DEN VORSCHLAG IN DIE VERSTECKTEN FELDER UND IN DEN KNOPFTEXT. Eine
   * vertauschte Quelle (`planDatum` statt `vorschlagDatum`) waere `typecheck`, `lint` und `build`
   * unsichtbar geblieben.
   */
  it("die Zeile mit Vorschlag traegt „Annehmen“ samt versteckten Feldern, die ohne nicht", async () => {
    const alina = legePerson("alina", "bufdi");
    const malte = legePerson("malte", "auftrag");
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      titel: "Mit Vorschlag", status: "verteilt", faelligAm: "2026-08-21",
      vorschlagDatum: "2026-08-13", vorschlagUhrzeit: "09:00",
    });
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      titel: "Ohne Vorschlag", status: "verteilt", faelligAm: "2026-08-22",
    });
    await zeige(alina);
    const zeilen = queryAll("#posteingang li");
    expect(zeilen).toHaveLength(2);

    const mit = zeilen[0]!;
    const knopf = mit.querySelector("button");
    expect(knopf?.textContent).toBe("Annehmen: Do, 13.08., 09:00");
    const felder = Array.from(mit.querySelectorAll<HTMLInputElement>("input[type=hidden]")).map(
      (i) => [i.name, i.value] as const,
    );
    expect(felder).toContainEqual(["planDatum", "2026-08-13"]);
    expect(felder).toContainEqual(["planUhrzeit", "09:00"]);

    expect(zeilen[1]!.querySelectorAll("button")).toHaveLength(0);
    expect(zeilen[1]!.querySelector("a[href*='#einplanen-']")).toBeTruthy();
  });

  /**
   * DASSELBE PRAEDIKAT WIE DIE ROUTE (`darfPlanAendern`, mit `istAktiv`): eine ausgeschiedene
   * Person plant nichts mehr, auch nicht sich selbst — sonst liefe der Klick in einen Wurf.
   */
  it("eine ausgeschiedene Person bekommt in der Zone keine Aktionen", async () => {
    const alina = legePerson("alina", "bufdi", { aktivBis: "2026-08-01" });
    const malte = legePerson("malte", "auftrag");
    legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id, titel: "A", status: "verteilt" });
    legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id, titel: "B", status: "verteilt" });
    await zeige(alina);
    expect(query("#posteingang").querySelectorAll("button")).toHaveLength(0);
  });
});

describe("EinstiegBufdi — der Fuss", () => {
  /**
   * „Routinen verwalten" FOLGT DEM RIEGEL DER ZIELSEITE (`darfRoutinenVerwalten`), nicht einer
   * zufaellig gleichwertigen Bedingung — `/routinen` wirft sonst `notFound()`.
   */
  it("zeigt „Routinen verwalten“ und die Zeitplaene der anderen BuFDis, nicht den eigenen", async () => {
    const alina = legePerson("alina", "bufdi", { name: "Alina" });
    const bendix = legePerson("bendix", "bufdi", { name: "Bendix" });
    legePerson("doerte", "bufdi", { name: "Dörte", aktivBis: "2026-01-31" });
    await zeige(alina);
    const ziele = queryAll<HTMLAnchorElement>("a").map((a) => a.getAttribute("href"));
    expect(ziele).toContain("/routinen");
    expect(ziele).toContain(`/plan/${bendix.id}`);
    expect(ziele).not.toContain(`/plan/${alina.id}#`);
    expect(queryAll("a").map((a) => a.textContent)).not.toContain("Zeitplan von Dörte");
  });

  it("laesst „Routinen verwalten“ weg, wenn die Person ausgeschieden ist", async () => {
    const alina = legePerson("alina", "bufdi", { aktivBis: "2026-08-01" });
    await zeige(alina);
    expect(queryAll<HTMLAnchorElement>("a").map((a) => a.getAttribute("href"))).not.toContain(
      "/routinen",
    );
  });
});

describe("EinstiegBufdi — die Achse bleibt, wie sie war", () => {
  it("Routinen tragen keine Rangknoepfe, Aufgaben schon", async () => {
    const alina = legePerson("alina", "bufdi");
    const malte = legePerson("malte", "auftrag");
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      titel: "Geplant", status: "verteilt", planDatum: MONTAG,
    });
    t.db
      .insert(routinen)
      .values({
        personId: alina.id, titel: "Frühbesprechung", wochentage: 0b11111,
        uhrzeit: "08:00", dauerMinuten: 15, aktiv: true,
      })
      .run();
    await zeige(alina);
    const gitter = query("[data-rolle='wochengitter']");
    expect(gitter.textContent).toContain("Frühbesprechung");
    expect(gitter.querySelectorAll("[data-aufgabe-id]").length).toBeGreaterThan(0);
  });
});

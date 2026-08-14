// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { personen, aufgaben, routinen, type PersonRow, type Rolle } from "../_db/schema";
import s from "./aufgaben.module.css";

/*
 * MOCK VON `next/navigation` — `EinstiegBufdi` rendert `TagesWaehler` (Client-Insel), die
 * `useRouter`/`usePathname`/`useSearchParams` braucht: einen echten App-Router-Kontext stellt
 * jsdom+`mount()` nicht (dieselbe Form wie `TagesWaehler.test.tsx`/`QrView.test.tsx`).
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const { EinstiegBufdi } = await import("./EinstiegBufdi");

/*
 * WIDERSPRUCH GEMELDET, NICHT STILL AUFGELOEST (s. Bericht): der Brief-Abschnitt „Was der Test
 * zeigen muss" verlangt „Der Posteingang-Streifen zeigt genau die Aufgaben mit vorschlagOffen" —
 * das ist ENGER als die Definition im selben Brief unter „EinstiegBufdi" UND als Spec §8.1
 * woertlich („was verteilt und noch in keinem Tag liegt", OHNE einen Vorschlag vorauszusetzen).
 * Nach der Vorgabe „wo Brief und Spec sich widersprechen, gilt der Spec" implementiert und testet
 * diese Datei die WEITERE Definition (`wartetAufEinplanung` in `_lib/anzeige.ts`) — eine verteilte,
 * noch nicht eingeplante Aufgabe OHNE Zeitvorschlag gehoert genauso in den Streifen, sie zeigt dort
 * nur keinen Vorschlag und keinen „Annehmen"-Knopf.
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

describe("EinstiegBufdi — Kopf, KPI-Zeile, Posteingang, Wochenplan", () => {
  it("zeigt den Wochenwaehler mit dem Datumsbereich der angezeigten Woche", async () => {
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    await mount(<EinstiegBufdi db={t.db} person={alina} heute={HEUTE} />);
    expect(document.body.textContent).toContain("Mo, 10.08.");
    expect(document.body.textContent).toContain("Fr, 14.08.");
  });

  it("die vier KPI-Kacheln zeigen die richtigen Zahlen, aus DERSELBEN Ableitung wie die Liste darunter", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });

    // Einzuplanen: verteilt, planDatum null — ZWEI Zeilen, eine davon OHNE Vorschlag.
    legeAufgabe({
      titel: "Ohne Vorschlag",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "verteilt",
      planDatum: null,
    });
    legeAufgabe({
      titel: "Mit Vorschlag",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "verteilt",
      planDatum: null,
      vorschlagDatum: "2026-08-12",
      vorschlagUhrzeit: "09:00",
    });
    // Heute offen: planDatum === heute, nicht abgeschlossen.
    legeAufgabe({
      titel: "Heute dran",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "in_arbeit",
      planDatum: HEUTE,
    });
    // Freigabe offen.
    legeAufgabe({
      titel: "Wartet auf Freigabe",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "freigabe_offen",
    });
    // Zurueckgewiesen.
    legeAufgabe({
      titel: "Muss ueberarbeitet werden",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "zurueckgewiesen",
    });

    await mount(<EinstiegBufdi db={t.db} person={alina} heute={HEUTE} />);

    const kacheln = queryAll(`.${s.kpi}`);
    const zahlen = kacheln.map((k) => k.querySelector("span")?.textContent);
    expect(zahlen).toEqual(["2", "1", "1", "1"]);

    // Die Liste darunter (Posteingang) zeigt exakt die zwei "Einzuplanen"-Zeilen — gezielt
    // innerhalb von `#posteingang` gesucht: "Heute dran" traegt einen `planDatum` und erscheint
    // deshalb ZUSAETZLICH im Wochenplan (in BEIDEN Ausprägungen), und `SeitenKopf`s `Breadcrumb`
    // rendert seine Krumen ebenfalls als `<li>` — ein ungezielter `queryAll("li")` zaehlte all das mit.
    const zeilen = queryAll("#posteingang li");
    expect(zeilen.map((z) => z.textContent).join(" ")).toContain("Ohne Vorschlag");
    expect(zeilen.map((z) => z.textContent).join(" ")).toContain("Mit Vorschlag");
    expect(zeilen).toHaveLength(2);
  });

  it("eine 0-Kachel bleibt stehen und wird nicht klickbar (kein <a>)", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    await mount(<EinstiegBufdi db={t.db} person={alina} heute={HEUTE} />);
    // Bei leerem Bestand sind alle vier Kacheln 0. "Einzuplanen" und "Heute offen" waeren sonst
    // verlinkt — hier duerfen sie es nicht sein.
    const kacheln = queryAll(`.${s.kpi}`);
    expect(kacheln).toHaveLength(4);
    for (const kachel of kacheln) {
      expect(kachel.closest("a"), kachel.textContent ?? "").toBeNull();
    }
  });

  it('"Einzuplanen" verlinkt bei einer Zahl > 0 auf den Posteingang-Anker', async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi");
    legeAufgabe({
      titel: "X",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "verteilt",
      planDatum: null,
    });
    await mount(<EinstiegBufdi db={t.db} person={alina} heute={HEUTE} />);
    const verweis = queryAll<HTMLAnchorElement>("a").find((a) => a.getAttribute("href") === "#posteingang");
    expect(verweis, "Verweis auf #posteingang fehlt").toBeTruthy();
  });

  it("Posteingang-Zeile OHNE Vorschlag zeigt nur „Anders einplanen“, keinen „Annehmen“-Knopf", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi");
    legeAufgabe({
      titel: "Ohne Vorschlag",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "verteilt",
      planDatum: null,
    });
    await mount(<EinstiegBufdi db={t.db} person={alina} heute={HEUTE} />);
    // `query("li")` traefe die ERSTE `<li>` im Dokument — und `Breadcrumb` (in `SeitenKopf`)
    // rendert seine Krumen ebenfalls als `<li>`, VOR der Posteingang-Liste. Gezielt die Zeile mit
    // dem Aufgabentitel suchen, statt sich auf die Dokumentreihenfolge zu verlassen.
    const zeile = queryAll("li").find((li) => li.textContent?.includes("Ohne Vorschlag"))!;
    expect(zeile, "Zeile „Ohne Vorschlag“ fehlt").toBeTruthy();
    expect(zeile.textContent).toContain("Anders einplanen");
    expect(zeile.textContent).not.toContain("Annehmen");
  });

  it("Posteingang-Zeile MIT Vorschlag zeigt zusaetzlich „Annehmen“", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi");
    legeAufgabe({
      titel: "Mit Vorschlag",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "verteilt",
      planDatum: null,
      vorschlagDatum: "2026-08-12",
    });
    await mount(<EinstiegBufdi db={t.db} person={alina} heute={HEUTE} />);
    const zeile = queryAll("li").find((li) => li.textContent?.includes("Mit Vorschlag"))!;
    expect(zeile, "Zeile „Mit Vorschlag“ fehlt").toBeTruthy();
    expect(zeile.textContent).toContain("Annehmen");
    expect(zeile.textContent).toContain("Anders einplanen");
  });

  it("leerer Posteingang zeigt den ausgeschriebenen Leerzustand", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    await mount(<EinstiegBufdi db={t.db} person={alina} heute={HEUTE} />);
    expect(document.body.textContent).toContain("Posteingang leer — alles verteilt");
  });

  /*
   * EINE AUSGESCHIEDENE PERSON, DIE SICH SELBST BETRACHTET (Randfall): `zeigeAktionen` haengt an
   * `darfPlanAendern`, das `istAktiv` prueft — ohne diese Kopplung bekaeme eine ausgeschiedene
   * BuFDi trotzdem Annehmen/Anders-einplanen/RangKnoepfe fuer die eigene, laengst historische Woche.
   */
  it("eine ausgeschiedene Person sieht in ihrem Posteingang keine Aktionen mehr", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const doerte = legePerson("dev:doerte@test", "bufdi", { aktivBis: "2020-01-01" });
    legeAufgabe({
      titel: "Alt",
      erstellerId: malte.id,
      zugewiesenAn: doerte.id,
      prueferId: malte.id,
      status: "verteilt",
      planDatum: null,
    });
    await mount(<EinstiegBufdi db={t.db} person={doerte} heute={HEUTE} />);
    const zeile = queryAll("li").find((li) => li.textContent?.includes("Alt"))!;
    expect(zeile, "Zeile „Alt“ fehlt").toBeTruthy();
    expect(zeile.textContent).not.toContain("Annehmen");
    expect(zeile.textContent).not.toContain("Anders einplanen");
  });

  it('zeigt "Routinen verwalten" und die Zeitplaene der anderen aktiven BuFDis im Fuss, nicht sich selbst', async () => {
    legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    const bendix = legePerson("dev:bendix@test", "bufdi", { name: "Bendix" });
    legePerson("dev:doerte@test", "bufdi", { name: "Dörte", aktivBis: "2020-01-01" });

    await mount(<EinstiegBufdi db={t.db} person={alina} heute={HEUTE} />);

    const links = queryAll<HTMLAnchorElement>("a").map((a) => a.getAttribute("href"));
    expect(links).toContain("/routinen");
    expect(links).toContain(`/plan/${bendix.id}`);
    expect(links).not.toContain(`/plan/${alina.id}`);
    expect(document.body.textContent).not.toContain("Dörte");
  });

  it("rendert die fuenf Tagesspalten (Wochenplan) und die Radiogruppe (TagesWaehler)", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    await mount(<EinstiegBufdi db={t.db} person={alina} heute={HEUTE} />);
    expect(query('[data-rolle="wochengitter"]')).toBeTruthy();
    expect(queryAll('input[type="radio"]')).toHaveLength(5);
  });

  it("liest die Woche aus wocheParam, nicht aus heute", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    await mount(<EinstiegBufdi db={t.db} person={alina} heute={HEUTE} wocheParam="2026-08-24" />);
    expect(document.body.textContent).toContain("Mo, 24.08.");
  });

  /*
   * GEGENPROBE (advisor-Fund): die "Heute offen"-Kachel verlinkt auf die Woche, die "heute" ENTHAELT
   * — nicht auf die gerade angezeigte Woche. Ohne diese Trennung fuehrte ein zwei Wochen
   * vorgeblaetterter Aufruf zu einem Verweis auf eine Woche, in der "heute" gar nicht liegt.
   */
  it('"Heute offen" verlinkt auf die Woche von HEUTE, auch wenn eine andere Woche angezeigt wird', async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi");
    legeAufgabe({
      titel: "Heute dran",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "in_arbeit",
      planDatum: HEUTE,
    });
    // Zwei Wochen vorgeblaettert (wocheParam), "Heute offen" bleibt trotzdem > 0 (heuteOffen
    // haengt nicht von der angezeigten Woche ab).
    await mount(
      <EinstiegBufdi db={t.db} person={alina} heute={HEUTE} wocheParam="2026-08-24" />,
    );
    const verweis = queryAll<HTMLAnchorElement>("a").find((a) =>
      a.getAttribute("href")?.startsWith(`/plan/${alina.id}?woche=`),
    );
    expect(verweis, "Verweis auf /plan/<id>?woche=... fehlt").toBeTruthy();
    expect(verweis!.getAttribute("href")).toBe(`/plan/${alina.id}?woche=${MONTAG}`);
  });

  it("routinen-Routine belegt keine Aktionen, RangKnoepfe erscheinen nur fuer Aufgaben", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    t.db
      .insert(routinen)
      .values({
        personId: alina.id,
        titel: "Frühbesprechung",
        wochentage: 0b11111,
        uhrzeit: "08:00",
        dauerMinuten: 15,
      })
      .run();
    await mount(<EinstiegBufdi db={t.db} person={alina} heute={MONTAG} />);
    // Kein Knopf im Wochenplan fuer die Routine allein (kein Aufgabeneintrag vorhanden).
    const routineZeile = queryAll('[class*="routineZeile"]')[0];
    expect(routineZeile?.querySelector("button")).toBeFalsy();
  });
});

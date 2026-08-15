// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { personen, aufgaben, type PersonRow, type Rolle } from "../_db/schema";
import s from "./aufgaben.module.css";

const { EinstiegKoordination } = await import("./EinstiegKoordination");

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

function kpiZahlen(): (string | null | undefined)[] {
  return queryAll(`.${s.kpi}`).map((k) => k.querySelector("span")?.textContent);
}

describe("EinstiegKoordination — KPI-Zeile, Posteingang, Freigabe-Warteschlange, Ueberfaelligkeit", () => {
  /**
   * FIX-RUNDE 1, IMPORTANT 3: die vier Fixturzahlen sind ABSICHTLICH VERSCHIEDEN (2/3/1/4), nicht
   * mehr drei gleiche Werte — sonst kann eine Vertauschung zwischen „Freigabe offen", „Überfällig"
   * und „Zurückgewiesen" nicht rot werden. Zusaetzlich werden jetzt ALLE Listen, die eine Kachel
   * traegt, im SELBEN Mount gegen ihre Kachelzahl gehalten (Posteingang-Tabelle, beide
   * Freigabe-Listen, Ueberfaelligkeitsliste) — nicht nur die Ueberfaelligkeitsliste wie zuvor.
   */
  it("die KPI-Zahlen stimmen mit den Listen darunter ueberein — Frist zaehlt, nicht der Zeitplan", async () => {
    const rike = legePerson("dev:rike@test", "koordination", { name: "Rike" });
    const malte = legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi");

    // Zu verteilen: ZWEI Aufgaben im Posteingang.
    legeAufgabe({ titel: "Posteingang 1", erstellerId: malte.id, status: "eingegangen" });
    legeAufgabe({ titel: "Posteingang 2", erstellerId: malte.id, status: "eingegangen" });

    // UEBERFAELLIG, TROTZ PLANDATUM IN DER ZUKUNFT: die Frist zaehlt, nicht der Zeitplan (Spec
    // §8.2, Brief). faelligAm liegt VOR heute, planDatum NACH heute. EINE Aufgabe.
    legeAufgabe({
      titel: "Ueberfaellig trotz Planung",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "verteilt",
      faelligAm: "2026-08-12",
      planDatum: "2026-08-14",
    });
    // NICHT UEBERFAELLIG: ungeplant, aber Frist liegt in der Zukunft.
    legeAufgabe({
      titel: "Ungeplant, aber nicht ueberfaellig",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "verteilt",
      faelligAm: "2026-08-20",
      planDatum: null,
    });

    // Freigabe offen: DREI Aufgaben — zwei "meine" (Rike ist Pruefer), eine "in Vertretung"
    // (Malte ist Pruefer, Rike sieht sie trotzdem als koordination).
    legeAufgabe({
      titel: "Meine Freigabe 1",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: rike.id,
      status: "freigabe_offen",
    });
    legeAufgabe({
      titel: "Meine Freigabe 2",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: rike.id,
      status: "freigabe_offen",
    });
    legeAufgabe({
      titel: "Vertretungsfall",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "freigabe_offen",
    });

    // Zurueckgewiesen: VIER Aufgaben.
    for (let i = 1; i <= 4; i++) {
      legeAufgabe({
        titel: `Zurueckgewiesen ${i}`,
        erstellerId: malte.id,
        zugewiesenAn: alina.id,
        prueferId: malte.id,
        status: "zurueckgewiesen",
      });
    }

    await mount(<EinstiegKoordination db={t.db} person={rike} heute={HEUTE} />);

    expect(kpiZahlen()).toEqual(["2", "3", "1", "4"]);

    // Posteingang-Tabelle: GENAU die zwei Zeilen der Kachel "Zu verteilen".
    expect(queryAll("tbody tr[data-row-key]")).toHaveLength(2);

    // Freigabe-Listen: zwei "meine" plus eine "in Vertretung" — zusammen die DREI der Kachel.
    const freigabeListen = query("#freigabe").querySelectorAll("ul");
    expect(freigabeListen[0]!.querySelectorAll("li")).toHaveLength(2);
    expect(freigabeListen[1]!.querySelectorAll("li")).toHaveLength(1);

    // DIESELBE ZAHL, DIESELBE LISTE, IM SELBEN RENDER: die Ueberfaelligkeitsliste enthaelt GENAU
    // die eine Aufgabe mit verstrichener Frist, nicht die ungeplante mit Frist in der Zukunft.
    const ueberfaelligZeilen = queryAll("#ueberfaellig li");
    expect(ueberfaelligZeilen).toHaveLength(1);
    expect(ueberfaelligZeilen[0]!.textContent).toContain("Ueberfaellig trotz Planung");
    expect(ueberfaelligZeilen[0]!.textContent).not.toContain("Ungeplant, aber nicht ueberfaellig");

    // DIE VIERTE LISTE, SEIT W4 VORHANDEN — dieselbe Regel wie fuer die drei darueber: die Zahl
    // der Kachel und die Liste darunter kommen aus derselben Ableitung, im selben Render.
    expect(queryAll("#zurueckgewiesen li")).toHaveLength(4);
  });

  /**
   * FIX-RUNDE 1, MINOR 1: „Meine Freigabe" traegt jetzt `erstellerId: malte`, NICHT mehr
   * `erstellerId: rike` — vorher koppelten beide Fixturzeilen `erstellerId` an `prueferId`
   * (`erstellerId === prueferId` fuer „meine", `erstellerId === prueferId` fuer „Vertretung"), und
   * eine falsche Implementierung ueber `a.erstellerId !== person.id` statt
   * `istVertretungsfreigabe` haette den Test unveraendert bestanden. Jetzt bindet nur noch
   * `prueferId`.
   */
  it("die Freigabe-Warteschlange trennt „meine“ von „in Vertretung“", async () => {
    const rike = legePerson("dev:rike@test", "koordination");
    const malte = legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi");

    // MEINE: Rike ist die eingetragene Pruefer — ABER NICHT die Erstellerin (entkoppelt von
    // `erstellerId`, s. Kopfkommentar).
    legeAufgabe({
      titel: "Meine Freigabe",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: rike.id,
      status: "freigabe_offen",
    });
    // IN VERTRETUNG: Malte ist der eingetragene Pruefer, Rike sieht sie trotzdem (Vertretung).
    legeAufgabe({
      titel: "Vertretungsfall",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "freigabe_offen",
    });

    await mount(<EinstiegKoordination db={t.db} person={rike} heute={HEUTE} />);

    const abschnitt = query("#freigabe");
    const ueberschriften = Array.from(abschnitt.querySelectorAll("h3")).map((h) => h.textContent);
    expect(ueberschriften).toEqual(["Meine", "In Vertretung"]);

    const listen = abschnitt.querySelectorAll("ul");
    expect(listen[0]!.textContent).toContain("Meine Freigabe");
    expect(listen[0]!.textContent).not.toContain("Vertretungsfall");
    expect(listen[1]!.textContent).toContain("Vertretungsfall");
    expect(listen[1]!.textContent).not.toContain("Meine Freigabe");
  });

  it("Leerzustaende: jede der vier Listen traegt ihren eigenen ausgeschriebenen Satz", async () => {
    const rike = legePerson("dev:rike@test", "koordination");
    await mount(<EinstiegKoordination db={t.db} person={rike} heute={HEUTE} />);
    expect(document.body.textContent).toContain("Posteingang leer — alles verteilt");
    expect(document.body.textContent).toContain("Keine Freigabe offen");
    expect(document.body.textContent).toContain("Keine Freigabe in Vertretung offen");
    expect(document.body.textContent).toContain("Keine überfälligen Aufgaben");
    expect(document.body.textContent).toContain("Keine zurückgewiesene Aufgabe.");
  });

  it("0-Kacheln bleiben stehen und sind nicht verlinkt (kein <a>)", async () => {
    const rike = legePerson("dev:rike@test", "koordination");
    await mount(<EinstiegKoordination db={t.db} person={rike} heute={HEUTE} />);
    const kacheln = queryAll(`.${s.kpi}`);
    expect(kacheln).toHaveLength(4);
    for (const kachel of kacheln) {
      expect(kachel.closest("a"), kachel.textContent ?? "").toBeNull();
    }
  });

  /**
   * DIE NAHT KACHEL → ZIEL, UEBER ALLE VIER KACHELN HINWEG (Abschlussreview W4) — kein Test je
   * Kachel: genau diese Naht ist zweimal durchgerutscht (Aufgabe 13 vertagte zwei Kacheln ohne
   * `href`, Aufgabe 16 loeste es nur fuer `EinstiegBufdi.tsx` auf, und „Zurückgewiesen" blieb hier
   * ohne Ziel UND ohne Abschnitt). Vier Einzeltests haetten dieselbe Luecke ein drittes Mal offen
   * gelassen — dieser hier zaehlt die Kacheln selbst ab und verlangt von JEDER mit Zahl > 0 ein
   * Ziel, das es auf der Seite auch WIRKLICH GIBT (`getElementById`, nicht nur ein `href`, das
   * plausibel aussieht).
   */
  it("jede Kachel mit Zahl > 0 traegt ein Ziel, das auf dieser Seite existiert — alle vier", async () => {
    const rike = legePerson("dev:rike@test", "koordination");
    const malte = legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi");
    legeAufgabe({ titel: "P", erstellerId: malte.id, status: "eingegangen" });
    legeAufgabe({
      titel: "F", erstellerId: rike.id, zugewiesenAn: alina.id, prueferId: rike.id,
      status: "freigabe_offen",
    });
    legeAufgabe({
      titel: "U", erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      status: "verteilt", faelligAm: "2026-08-01",
    });
    legeAufgabe({
      titel: "Z", erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      status: "zurueckgewiesen",
    });

    await mount(<EinstiegKoordination db={t.db} person={rike} heute={HEUTE} />);

    const kacheln = queryAll(`.${s.kpi}`);
    expect(kacheln).toHaveLength(4);
    for (const kachel of kacheln) {
      const beschriftung = kachel.textContent ?? "";
      // Jede Kachel dieses Aufbaus traegt eine 1 — keine darf ohne Ziel bleiben.
      const verweis = kachel.closest("a");
      expect(verweis, `Kachel ohne Verweis: ${beschriftung}`).not.toBeNull();
      const ziel = verweis!.getAttribute("href") ?? "";
      expect(ziel, `Kachel mit leerem Verweis: ${beschriftung}`).not.toBe("");
      // ERREICHBAR, NICHT NUR VORHANDEN: ein Anker ohne Abschnitt ist genau der Zustand vor W4.
      if (ziel.startsWith("#")) {
        expect(
          document.getElementById(ziel.slice(1)),
          `Anker ${ziel} hat keinen Abschnitt (Kachel: ${beschriftung})`,
        ).not.toBeNull();
      }
    }

    const hrefs = kacheln.map((k) => k.closest("a")!.getAttribute("href"));
    expect(hrefs).toEqual(["#posteingang", "#freigabe", "#ueberfaellig", "#zurueckgewiesen"]);
  });

  it("verlinkt die Personenverwaltung UND das Archiv (Aufgabe 16)", async () => {
    const rike = legePerson("dev:rike@test", "koordination");
    await mount(<EinstiegKoordination db={t.db} person={rike} heute={HEUTE} />);
    const hrefs = queryAll<HTMLAnchorElement>("a").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/personen");
    expect(hrefs).toContain("/archiv");
  });

  /**
   * DIE FREIGABE-SEKTION IST SEIT AUFGABE 16 SCHREIBFAEHIG (vorher schreibgeschuetzt, Aufgabe
   * 15s offen gelassene Beobachtung) — sie zeigt jetzt dieselben Freigeben-/Zurueckweisen-Knoepfe
   * wie `/freigaben`/`EinstiegAuftrag.tsx` (`FreigabeAktionen` aus `FreigabeZone.tsx`), statt einer
   * schreibgeschuetzten Liste.
   */
  it("die Freigabe-Sektion traegt jetzt Freigeben-/Zurueckweisen-Knoepfe (FreigabeZone, nicht mehr schreibgeschuetzt)", async () => {
    const rike = legePerson("dev:rike@test", "koordination");
    const malte = legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi");
    const meineFreigabe = legeAufgabe({
      titel: "Meine Freigabe",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: rike.id,
      status: "freigabe_offen",
    });

    await mount(<EinstiegKoordination db={t.db} person={rike} heute={HEUTE} />);

    expect(queryAll(`[data-testid='freigeben-${meineFreigabe.id}']`)).toHaveLength(1);
    expect(queryAll(`[data-testid='zurueckweisen-${meineFreigabe.id}']`)).toHaveLength(1);
  });

  it("die Kontextzeile nennt beide Zahlen (Spec §9.4-Beispiel)", async () => {
    const rike = legePerson("dev:rike@test", "koordination");
    const malte = legePerson("dev:malte@test", "auftrag");
    legeAufgabe({ titel: "P1", erstellerId: malte.id, status: "eingegangen" });
    legeAufgabe({ titel: "P2", erstellerId: malte.id, status: "eingegangen" });
    await mount(<EinstiegKoordination db={t.db} person={rike} heute={HEUTE} />);
    expect(document.body.textContent).toContain("2 zu verteilen");
    expect(document.body.textContent).toContain("0 warten auf Freigabe");
  });
});

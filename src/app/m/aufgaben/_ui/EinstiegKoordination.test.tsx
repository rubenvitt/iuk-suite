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

const { EinstiegKoordination } = await import("./EinstiegKoordination");

/*
 * „VERTEILUNG" NACH DER OBERFLAECHEN-SPEC (2026-08-16 §3.4, §5.2).
 *
 * DIE KACHEL-FAELLE SIND MIT DEN KACHELN ENTFALLEN (§11.1) — „0-Kacheln bleiben stehen" und „jede
 * Kachel mit Zahl > 0 traegt ein Ziel" pruefen eine Bauform, die §1.4 aufhebt. An ihre Stelle
 * tritt die staerkere Zusage aus `lage.test.ts`; hier bleibt, was nur ueber das gerenderte DOM
 * pruefbar ist.
 *
 * `lage()` WIRD ECHT GERUFEN, wie `page.tsx` es tut — ein Test gegen ein handgereichtes
 * `Lage`-Objekt pruefte die Verdrahtung nicht, sondern setzte sie voraus.
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

/**
 * `istKoordination` STEHT AUSDRUECKLICH AM AUFRUF (Quellenwechsel 2026-08-15): die Koordination
 * kommt aus der Auth-Gruppe und liegt auf einer ANDEREN Achse als `rolle`. Rike traegt deshalb
 * `auftrag` in der Tabelle und wird hier durchgehend als koordinierend gereicht — DIESE Seite IST
 * der Koordinationseinstieg.
 */
function akteur(p: PersonRow, istKoordination = true): Akteur {
  return { person: p, istKoordination };
}

async function zeige(p: PersonRow, istKoordination = true): Promise<void> {
  const a = akteur(p, istKoordination);
  await mount(
    <EinstiegKoordination db={t.db} akteur={a} heute={HEUTE} lage={lage(t.db, a, HEUTE, TAGE)} />,
  );
}

function flaeche(): HTMLElement {
  return query("[data-testid='aufgaben-flaeche']");
}

describe("EinstiegKoordination — der Aufbau aus §3.4", () => {
  it("die Fuehrungskarte ist das ERSTE Kind von `aufgaben-flaeche`", async () => {
    const rike = legePerson("rike", "auftrag", { name: "Rike" });
    legeAufgabe({ erstellerId: rike.id, titel: "Posteingang" });
    await zeige(rike);
    expect(flaeche().firstElementChild?.getAttribute("data-rolle")).toBe("fuehrung");
  });

  /**
   * DER ZAEHLRIEGEL — gemessen im Wrapper und nicht in `main`. Die Lage unten ist bewusst voll:
   * Posteingang, Freigabe, Ueberfaelliges und Zurueckgewiesenes gleichzeitig. Genau eine Sprosse
   * fuehrt, die uebrigen werden Zonen — und Zonen tragen keine Primaerknoepfe.
   */
  it("traegt in der ganzen Flaeche hoechstens einen `.ant-btn-primary`", async () => {
    const rike = legePerson("rike", "auftrag", { name: "Rike" });
    const malte = legePerson("malte", "auftrag", { name: "Malte" });
    const alina = legePerson("alina", "bufdi", { name: "Alina" });
    legeAufgabe({ erstellerId: malte.id, titel: "Posteingang" });
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: rike.id,
      titel: "Freigabe", status: "freigabe_offen",
    });
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      titel: "Überfällig", status: "verteilt", faelligAm: "2026-08-01",
    });
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      titel: "Zurück", status: "zurueckgewiesen",
    });
    await zeige(rike);
    expect(flaeche().querySelectorAll(".ant-btn-primary").length).toBeLessThanOrEqual(1);
  });

  /**
   * DERSELBE RIEGEL FUER DIE EINE LAGE, IN DER ER SEIT SCHRITT 6 UEBERHAUPT REISSEN KANN: eine
   * fuehrende Karte UND eine Zone, die DIESELBE Aktion als Zeilenweg traegt.
   *
   * DIE FIXTUR IST GENAU DAFUER GEBAUT — DREI ueberfaellige, `verteilt`e Aufgaben. Damit fuehrt
   * `koordUeberfaelligVerteilt` mit n = 3, wird nach R3 zugleich Zone (Position 1 mit mehr als
   * einer Aufgabe), und jede der drei Zeilen bekommt „Anders zuweisen" (§3.2). Die Karte selbst
   * traegt bei n > 1 keinen Primaerknopf; waere `UmverteilenKnopf` wie `VerteilenKnopf` fest auf
   * `type="primary"` verdrahtet, stuenden hier DREI. Der e2e-Zaehlriegel faende das erst nach
   * einem vollen Playwright-Lauf, und `typecheck`/`lint`/`build` fielen gar nicht darauf.
   */
  it("zaehlt auch dann hoechstens einen Primaerknopf, wenn Karte UND Zone „Anders zuweisen“ tragen", async () => {
    const rike = legePerson("rike", "auftrag", { name: "Rike" });
    const malte = legePerson("malte", "auftrag", { name: "Malte" });
    const alina = legePerson("alina", "bufdi", { name: "Alina" });
    for (const titel of ["Ueberfaellig A", "Ueberfaellig B", "Ueberfaellig C"]) {
      legeAufgabe({
        erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
        titel, status: "verteilt", faelligAm: "2026-08-01",
      });
    }
    await zeige(rike);

    // Die Vorbedingung wird MITGEPRUEFT: ohne die drei Zeilenknoepfe bewiese die Zaehlung nichts.
    const zuweisen = queryAll("button").filter((b) =>
      (b.textContent ?? "").includes("Anders zuweisen"),
    );
    expect(zuweisen).toHaveLength(3);
    expect(flaeche().querySelectorAll(".ant-btn-primary").length).toBeLessThanOrEqual(1);
  });

  /**
   * DER TEXTKNOPF DES SEITENKOPFS STEHT AUSSERHALB DES WRAPPERS (§3.3, §9/S9) — der Zaehlriegel
   * faende ihn gar nicht, und genau deshalb ist seine Demotion mit einer ANDEREN Begruendung
   * belegt als die des „Annehmen"-Knopfs: „hoechstens ein Primaerknopf" gilt fuer die GANZE Seite.
   *
   * DER RUHEFALL IST BEWUSST AUSGESCHLOSSEN: dort traegt die Karte SELBST „Aufgabe einstellen" als
   * ihren Primaerknopf (§4.3) — mit einer leeren Datenbank pruefte dieser Test also das Gegenteil
   * dessen, was sein Name sagt.
   */
  it("„Aufgabe einstellen“ steht im Seitenkopf und dort als Textknopf, nicht als Primaerknopf", async () => {
    const rike = legePerson("rike", "auftrag");
    legeAufgabe({ erstellerId: rike.id });
    await zeige(rike);
    const neu = queryAll<HTMLAnchorElement>("a").filter((a) => a.getAttribute("href") === "/neu");
    expect(neu).toHaveLength(1);
    expect(neu[0]!.className).not.toContain("ant-btn-primary");
    expect(flaeche().contains(neu[0]!)).toBe(false);
  });

  /** Die Kontextzeile traegt die Zahlen der gestrichenen Kacheln — die Null als WORT (§3.5). */
  it("die Kontextzeile nennt alle vier Kennzahlen und schreibt die Null als Wort", async () => {
    const rike = legePerson("rike", "auftrag");
    const malte = legePerson("malte", "auftrag");
    legeAufgabe({ erstellerId: malte.id });
    await zeige(rike);
    const zeile = queryAll("p")
      .map((p) => p.textContent ?? "")
      .find((z) => z.includes("zu verteilen"));
    expect(zeile).toBe(
      "1 zu verteilen · nichts wartet auf Freigabe · nichts überfällig · nichts zurückgewiesen",
    );
  });
});

describe("EinstiegKoordination — „Die Woche der drei“ (Flaeche der Rolle, §5.2)", () => {
  /**
   * DIE ZAHL MUSS VOR DER ENTSCHEIDUNG SICHTBAR SEIN, ein Modal ueberhaupt zu oeffnen (§5.2/S10) —
   * bis hierhin existierte die Auslastung nur INNERHALB des Verteilen-Dialogs.
   */
  it("zeigt je aktiver BuFDi eine adressierbare Zeile mit Wochenwert und Zeitplan-Verweis", async () => {
    const rike = legePerson("rike", "auftrag");
    const alina = legePerson("alina", "bufdi", { name: "Alina" });
    const bendix = legePerson("bendix", "bufdi", { name: "Bendix" });
    legePerson("doerte", "bufdi", { name: "Dörte", aktivBis: "2026-01-31" });
    await zeige(rike);

    const personen = queryAll("[data-person]");
    expect(personen.map((p) => p.getAttribute("data-person")).sort()).toEqual(
      [alina.id, bendix.id].sort(),
    );
    for (const abschnitt of personen) {
      expect(abschnitt.getAttribute("aria-labelledby")).toBe(
        `lage-${abschnitt.getAttribute("data-person")}`,
      );
      expect(abschnitt.textContent).toContain("/ 39 Std.");
      expect(abschnitt.querySelector("a[href^='/plan/']")).toBeTruthy();
    }
  });

  /**
   * DER LEERFALL DER FLAECHE (§10 Prueffrage 6) — ein ausgeschriebener Satz mit dem Weg, ihn zu
   * beheben, kein leerer Kasten, der wie ein Ladefehler aussieht.
   */
  it("ohne aktive BuFDi steht der ausgeschriebene Satz samt Weg", async () => {
    const rike = legePerson("rike", "auftrag");
    await zeige(rike);
    expect(flaeche().textContent).toContain("Es ist noch keine BuFDi eingetragen.");
  });

  /**
   * AUSLASTUNG IST NEUTRAL, NIE STATUSFARBE (Modulspec §9.3): der ueberbuchte Tag bekommt Kante
   * PLUS Wort. Das Wort ist die Zusage, die ein Test treffen kann — die Kante steht im CSS und
   * wird dort geprueft.
   */
  it("nennt einen ueberbuchten Tag beim Namen, statt ihn nur einzufaerben", async () => {
    const rike = legePerson("rike", "auftrag");
    const alina = legePerson("alina", "bufdi", { name: "Alina", sollMinutenTag: 60 });
    legeAufgabe({
      erstellerId: rike.id, zugewiesenAn: alina.id, prueferId: rike.id,
      status: "verteilt", planDatum: TAGE[0]!, dauerMinuten: 600,
    });
    await zeige(rike);
    const abschnitt = query(`[data-person='${alina.id}']`);
    expect(abschnitt.textContent).toContain("überbucht");
    expect(abschnitt.textContent).not.toContain("kein Tag überbucht");
  });
});

describe("EinstiegKoordination — die Zonen (Regel R3, Regel D)", () => {
  it("bei genau einer Aufgabe im Posteingang entsteht KEINE Zone — die Karte nennt sie", async () => {
    const rike = legePerson("rike", "auftrag");
    const malte = legePerson("malte", "auftrag", { name: "Malte" });
    legeAufgabe({ erstellerId: malte.id, titel: "Verbandskästen" });
    await zeige(rike);
    expect(queryAll("#posteingang")).toHaveLength(0);
    expect(query("[data-rolle='fuehrung']").textContent).toContain("Verbandskästen");
  });

  it("ab zwei Aufgaben traegt die Zone die Zahl in ihrer Ueberschrift", async () => {
    const rike = legePerson("rike", "auftrag");
    const malte = legePerson("malte", "auftrag");
    legeAufgabe({ erstellerId: malte.id, titel: "A" });
    legeAufgabe({ erstellerId: malte.id, titel: "B" });
    await zeige(rike);
    expect(query("#posteingang h2").textContent).toBe("Zu verteilen (2)");
  });

  it("deckelt den Posteingang bei fuenf Zeilen und nennt `/verteilen` als Ausgang", async () => {
    const rike = legePerson("rike", "auftrag");
    const malte = legePerson("malte", "auftrag");
    for (let i = 0; i < 8; i++) legeAufgabe({ erstellerId: malte.id, titel: `A${i}`, faelligAm: `2026-08-2${i}` });
    await zeige(rike);
    const zone = query("#posteingang");
    expect(zone.querySelectorAll("li")).toHaveLength(5);
    const deckel = Array.from(zone.querySelectorAll("a")).find((a) =>
      (a.textContent ?? "").includes("weitere"),
    );
    expect(deckel?.getAttribute("href")).toBe("/verteilen");
    expect(deckel?.textContent).toContain("und 3 weitere");
  });

  /**
   * ZWEI GETRENNTE UEBERSCHRIFTEN FUER 5a UND 5b (§3.5): sie koennen GLEICHZEITIG Zonen sein, und
   * zwei Zonen mit derselben Ueberschrift waeren ein Anzeigefehler, den kein Riegel faende.
   */
  it("trennt „Ueberfaellig, noch nicht begonnen“ von „Ueberfaellig, in Bearbeitung“", async () => {
    const rike = legePerson("rike", "auftrag");
    const malte = legePerson("malte", "auftrag");
    const alina = legePerson("alina", "bufdi", { name: "Alina" });
    legeAufgabe({ erstellerId: malte.id, titel: "Posteingang" });
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      titel: "Nicht begonnen", status: "verteilt", faelligAm: "2026-08-01",
    });
    legeAufgabe({
      erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id,
      titel: "In Arbeit", status: "in_arbeit", faelligAm: "2026-08-02",
    });
    await zeige(rike);
    const ueberschriften = queryAll("h2").map((h) => h.textContent);
    expect(ueberschriften).toContain("Überfällig, noch nicht begonnen (1)");
    expect(ueberschriften).toContain("Überfällig, in Bearbeitung (1)");
  });

  /** GENAU EINE Angabe je Zeile (§3.6) — hier der Zugewiesene bzw. der Auftraggeber. */
  it("jede Zonenzeile traegt genau einen Rollenzusatz", async () => {
    const rike = legePerson("rike", "auftrag");
    const malte = legePerson("malte", "auftrag", { name: "Malte" });
    legeAufgabe({ erstellerId: malte.id, titel: "A" });
    legeAufgabe({ erstellerId: malte.id, titel: "B" });
    await zeige(rike);
    for (const li of queryAll("#posteingang li")) {
      expect(li.querySelectorAll("[data-rollen-zusatz]")).toHaveLength(1);
      expect(li.querySelector("[data-rollen-zusatz]")?.textContent).toBe("Von Malte");
    }
  });
});

describe("EinstiegKoordination — der Fuss", () => {
  it("verlinkt Personenverwaltung und Archiv", async () => {
    const rike = legePerson("rike", "auftrag");
    await zeige(rike);
    const ziele = queryAll<HTMLAnchorElement>("a").map((a) => a.getAttribute("href"));
    expect(ziele).toContain("/personen");
    expect(ziele).toContain("/archiv");
  });
});

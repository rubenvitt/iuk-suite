import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestDb } from "../_db/testdb";
import { migrierteTestDb } from "../_db/testdb";
import { personen, aufgaben, type PersonRow, type Rolle } from "../_db/schema";

/**
 * ZWEI MOCKS:
 *
 * `next/navigation`: `notFound()` wirft in der echten Laufzeit einen Next-internen Fehler. Fuer die
 * Unit-Aussage reicht ein ERKENNBARER Wurf — dieselbe Form wie `lagerbuch/_lib/zugang.test.ts` und
 * `files/_lib/access.test.ts`.
 *
 * `@/core/auth`: `personFuerSession` ruft `auth()`. Der Test steuert die Sitzung ueber `sitzung`.
 */
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));

import {
  personFuerSession,
  istAktiv,
  darfVerteilen,
  darfEinstellenFuerAndere,
  darfPersonenVerwalten,
  darfPlanAendern,
  darfFreigeben,
  darfPlanSehen,
  darfNachweisSehen,
  istVertretungsfreigabe,
} from "./zugang";

let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb();
  sitzung = null;
});
afterEach(() => t.schliessen());

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

function legeAufgabe(extra: Partial<typeof aufgaben.$inferInsert>) {
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

describe("personFuerSession", () => {
  it("ohne Sitzung: notFound(), kein Wurf einer anderen Fehlerform", async () => {
    sitzung = null;
    await expect(personFuerSession(t.db)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("Sitzung ohne passende personen-Zeile: notFound(), nicht 403", async () => {
    sitzung = { user: { id: "dev:unbekannt@localtest.me" } };
    await expect(personFuerSession(t.db)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("Sitzung mit passender Zeile: die Person, aufgeloest ueber sub", async () => {
    const sarah = legePerson("dev:sarah@localtest.me", "koordination");
    sitzung = { user: { id: "dev:sarah@localtest.me" } };
    await expect(personFuerSession(t.db)).resolves.toEqual(sarah);
  });
});

describe("istAktiv — aktivBis ist EINSCHLIESSEND", () => {
  it("aktivBis === heute: noch aktiv", () => {
    const p = legePerson("s1", "bufdi", { aktivBis: HEUTE });
    expect(istAktiv(p, HEUTE)).toBe(true);
  });

  it("aktivBis vor heute: nicht mehr aktiv", () => {
    const p = legePerson("s2", "bufdi", { aktivBis: "2026-08-12" });
    expect(istAktiv(p, HEUTE)).toBe(false);
  });

  it("aktivBis === null: unbefristet aktiv", () => {
    const p = legePerson("s3", "bufdi", { aktivBis: null });
    expect(istAktiv(p, HEUTE)).toBe(true);
  });

  it("aktivVon in der Zukunft: noch nicht aktiv", () => {
    const p = legePerson("s4", "bufdi", { aktivVon: "2026-09-01" });
    expect(istAktiv(p, HEUTE)).toBe(false);
  });
});

/**
 * ERSCHOEPFEND UEBER DIE DREI ROLLEN, nicht stichprobenweise (Brief-Vorgabe): jedes
 * Handlungspraedikat wird fuer koordination/auftrag/bufdi UND einmal fuer eine ausgeschiedene
 * Person geprueft. Handlungspraedikate pruefen istAktiv SELBST statt hinter einem vorgeschalteten
 * Gate — sonst ist der ausgeschiedene Fall genau der, den niemand testet.
 */
describe("darfVerteilen — nur koordination, und aktiv", () => {
  it.each<[Rolle, boolean]>([
    ["koordination", true],
    ["auftrag", false],
    ["bufdi", false],
  ])("Rolle %s → %s", (rolle, erwartet) => {
    const p = legePerson(`v-${rolle}`, rolle);
    expect(darfVerteilen(p, HEUTE)).toBe(erwartet);
  });

  it("ausgeschiedene Koordination darf nicht mehr verteilen", () => {
    const p = legePerson("v-inaktiv", "koordination", { aktivBis: "2026-08-01" });
    expect(darfVerteilen(p, HEUTE)).toBe(false);
  });
});

describe("darfEinstellenFuerAndere — auftrag oder koordination, und aktiv", () => {
  it.each<[Rolle, boolean]>([
    ["koordination", true],
    ["auftrag", true],
    ["bufdi", false],
  ])("Rolle %s → %s", (rolle, erwartet) => {
    const p = legePerson(`e-${rolle}`, rolle);
    expect(darfEinstellenFuerAndere(p, HEUTE)).toBe(erwartet);
  });

  it("ausgeschiedener auftrag darf nicht mehr fremd einstellen", () => {
    const p = legePerson("e-inaktiv", "auftrag", { aktivBis: "2026-08-01" });
    expect(darfEinstellenFuerAndere(p, HEUTE)).toBe(false);
  });
});

describe("darfPersonenVerwalten — nur koordination, und aktiv", () => {
  it.each<[Rolle, boolean]>([
    ["koordination", true],
    ["auftrag", false],
    ["bufdi", false],
  ])("Rolle %s → %s", (rolle, erwartet) => {
    const p = legePerson(`pv-${rolle}`, rolle);
    expect(darfPersonenVerwalten(p, HEUTE)).toBe(erwartet);
  });

  it("ausgeschiedene Koordination darf Personen nicht mehr verwalten", () => {
    const p = legePerson("pv-inaktiv", "koordination", { aktivBis: "2026-08-01" });
    expect(darfPersonenVerwalten(p, HEUTE)).toBe(false);
  });
});

describe("darfPlanAendern — ausschliesslich die Zielperson selbst, auch nicht koordination", () => {
  /*
   * Das Praedikat fragt NUR nach Identitaet (`p.id === zielPersonId`), nicht nach Rolle — jede
   * Rolle aendert IHREN EIGENEN Plan. Die eigentliche Aussage der Regel ("auch koordination nicht
   * FREMDE Plaene") steht im Test direkt darunter, mit Sarah und Leas Plan.
   */
  it.each<Rolle>(["koordination", "auftrag", "bufdi"])(
    "Rolle %s auf den EIGENEN Plan → true",
    (rolle) => {
      const p = legePerson(`pa-${rolle}`, rolle);
      expect(darfPlanAendern(p, p.id, HEUTE)).toBe(true);
    },
  );

  it("Sarah (koordination) darf Leas Plan nicht aendern — sie schlaegt nur vor", () => {
    const sarah = legePerson("pa-sarah", "koordination");
    const lea = legePerson("pa-lea", "bufdi");
    expect(darfPlanAendern(sarah, lea.id, HEUTE)).toBe(false);
  });

  it("ausgeschiedener BuFDi aendert den eigenen Plan nicht mehr", () => {
    const p = legePerson("pa-inaktiv", "bufdi", { aktivBis: "2026-08-01" });
    expect(darfPlanAendern(p, p.id, HEUTE)).toBe(false);
  });
});

describe("darfFreigeben", () => {
  /**
   * DIE KREUZPROBE: Selbstaufgabe × alle drei Rollen. `istSelbst` gewinnt IMMER, auch gegen
   * `rolle === "koordination"` und selbst wenn `prueferId` zufaellig auf die pruefende Person
   * zeigt — ohne diese erste Zeile stimmten `prueferId === null` (Selbstaufgaben haben keinen
   * Pruefer) und `rolle === "koordination"` je fuer sich, und Sarah bekaeme einen Freigabeknopf
   * fuer eine Aufgabe, die gar keine Freigabestufe hat.
   */
  it.each<Rolle>(["koordination", "auftrag", "bufdi"])(
    "Selbstaufgabe: IMMER false, auch fuer %s",
    (rolle) => {
      const p = legePerson(`sa-${rolle}`, rolle);
      const a = legeAufgabe({
        erstellerId: p.id,
        zugewiesenAn: p.id,
        istSelbst: true,
        prueferId: null,
        status: "in_arbeit",
      });
      expect(darfFreigeben(p, a, HEUTE)).toBe(false);
    },
  );

  it("Fremdaufgabe: der eingetragene Pruefer darf freigeben", () => {
    const ersteller = legePerson("fr-ersteller", "auftrag");
    const pruefer = legePerson("fr-pruefer", "auftrag");
    const bufdi = legePerson("fr-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      prueferId: pruefer.id,
      status: "freigabe_offen",
    });
    expect(darfFreigeben(pruefer, a, HEUTE)).toBe(true);
  });

  it("Fremdaufgabe: koordination darf freigeben, auch ohne selbst Pruefer zu sein", () => {
    const ersteller = legePerson("fr2-ersteller", "auftrag");
    const pruefer = legePerson("fr2-pruefer", "auftrag");
    const bufdi = legePerson("fr2-bufdi", "bufdi");
    const sarah = legePerson("fr2-sarah", "koordination");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      prueferId: pruefer.id,
      status: "freigabe_offen",
    });
    expect(darfFreigeben(sarah, a, HEUTE)).toBe(true);
  });

  it("Fremdaufgabe: ein Dritter (weder Pruefer noch koordination) darf nicht", () => {
    const ersteller = legePerson("fr3-ersteller", "auftrag");
    const pruefer = legePerson("fr3-pruefer", "auftrag");
    const bufdi = legePerson("fr3-bufdi", "bufdi");
    const dritter = legePerson("fr3-dritter", "auftrag");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      prueferId: pruefer.id,
      status: "freigabe_offen",
    });
    expect(darfFreigeben(dritter, a, HEUTE)).toBe(false);
  });

  it("ausgeschiedener Pruefer darf nicht mehr freigeben", () => {
    const ersteller = legePerson("fr4-ersteller", "auftrag");
    const pruefer = legePerson("fr4-pruefer", "auftrag", { aktivBis: "2026-08-01" });
    const bufdi = legePerson("fr4-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      prueferId: pruefer.id,
      status: "freigabe_offen",
    });
    expect(darfFreigeben(pruefer, a, HEUTE)).toBe(false);
  });
});

/**
 * SICHTPRAEDIKATE PRUEFEN istAktiv NICHT — eine ausgeschiedene Person liest ihre Geschichte,
 * bewegt aber nichts (Spec §7). Deshalb tragen die folgenden Praedikate bewusst KEIN
 * `heute`-Argument. Der eigentliche Beweis dafuer steht NICHT in der Abwesenheit eines Parameters,
 * sondern im eigenen Testblock weiter unten ("Sichtpraedikate gelten weiter fuer Ausgeschiedene"):
 * ohne ihn koennte jemand `istAktiv` still IN eine dieser Funktionen einbauen (etwa so, wie
 * `freigabenFuer` `heute` selbst ermittelt) — die Signatur bliebe gleich, der Typecheck bliebe
 * gruen, und genau der Fall aus Spec §7 (ein ehemaliger BuFDi sieht seine eigene Dokumentation
 * nicht mehr) waere ungetestet kaputt.
 */
describe("darfPlanSehen — fuer alle wahr", () => {
  it.each<Rolle>(["koordination", "auftrag", "bufdi"])(
    "Rolle %s sieht den Plan jeder anderen Person",
    (rolle) => {
      const p = legePerson(`ps-${rolle}`, rolle);
      const andere = legePerson(`ps-ziel-${rolle}`, "bufdi");
      expect(darfPlanSehen(p, andere.id)).toBe(true);
    },
  );
});

describe("darfNachweisSehen — Verfasser, koordination, oder Ersteller; nicht jeder BuFDi", () => {
  it("koordination sieht jeden Nachweis", () => {
    const sarah = legePerson("ns-sarah", "koordination");
    const ersteller = legePerson("ns-ersteller", "auftrag");
    const bufdi = legePerson("ns-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      status: "freigabe_offen",
    });
    expect(darfNachweisSehen(sarah, a)).toBe(true);
  });

  it("der Ersteller der Aufgabe sieht den Nachweis", () => {
    const ersteller = legePerson("ns2-ersteller", "auftrag");
    const bufdi = legePerson("ns2-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      status: "freigabe_offen",
    });
    expect(darfNachweisSehen(ersteller, a)).toBe(true);
  });

  it("die zugewiesene Person (Verfasserin des Nachweises) sieht ihn", () => {
    const ersteller = legePerson("ns3-ersteller", "auftrag");
    const bufdi = legePerson("ns3-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      status: "freigabe_offen",
    });
    expect(darfNachweisSehen(bufdi, a)).toBe(true);
  });

  it("ein fremder BuFDi sieht ihn NICHT — Leistungsnachweise sind kein Aushang", () => {
    const ersteller = legePerson("ns4-ersteller", "auftrag");
    const bufdi = legePerson("ns4-bufdi", "bufdi");
    const fremd = legePerson("ns4-fremd", "bufdi");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      status: "freigabe_offen",
    });
    expect(darfNachweisSehen(fremd, a)).toBe(false);
  });
});

describe("Sichtpraedikate gelten weiter fuer Ausgeschiedene", () => {
  it("eine ausgeschiedene Person sieht den Plan anderer weiterhin", () => {
    const ex = legePerson("sicht-ex", "bufdi", { aktivBis: "2026-08-01" });
    const andere = legePerson("sicht-ziel", "bufdi");
    expect(darfPlanSehen(ex, andere.id)).toBe(true);
  });

  it("eine ausgeschiedene Person sieht den Nachweis ihrer eigenen (abgeschlossenen) Aufgabe weiterhin", () => {
    const ex = legePerson("sicht-ex2", "bufdi", { aktivBis: "2026-08-01" });
    const ersteller = legePerson("sicht-ersteller", "auftrag");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: ex.id,
      status: "abgeschlossen",
    });
    expect(darfNachweisSehen(ex, a)).toBe(true);
  });
});

describe("istVertretungsfreigabe — koordination gibt frei, ohne Pruefer zu sein", () => {
  it("koordination !== Pruefer: Vertretung", () => {
    const pruefer = legePerson("vf-pruefer", "auftrag");
    const sarah = legePerson("vf-sarah", "koordination");
    const bufdi = legePerson("vf-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: pruefer.id,
      zugewiesenAn: bufdi.id,
      prueferId: pruefer.id,
      status: "freigabe_offen",
    });
    expect(istVertretungsfreigabe(sarah, a)).toBe(true);
  });

  it("koordination === Pruefer: keine Vertretung", () => {
    const sarah = legePerson("vf2-sarah", "koordination");
    const bufdi = legePerson("vf2-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: sarah.id,
      zugewiesenAn: bufdi.id,
      prueferId: sarah.id,
      status: "freigabe_offen",
    });
    expect(istVertretungsfreigabe(sarah, a)).toBe(false);
  });

  it("kein koordination-Freigeber: nie Vertretung, egal wer Pruefer ist", () => {
    const pruefer = legePerson("vf3-pruefer", "auftrag");
    const anderer = legePerson("vf3-anderer", "auftrag");
    const bufdi = legePerson("vf3-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: pruefer.id,
      zugewiesenAn: bufdi.id,
      prueferId: pruefer.id,
      status: "freigabe_offen",
    });
    expect(istVertretungsfreigabe(anderer, a)).toBe(false);
  });
});

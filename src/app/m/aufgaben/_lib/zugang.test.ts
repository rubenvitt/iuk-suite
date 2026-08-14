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
  personFuerSeite,
  personFuerSession,
  subFuerSitzung,
  istAktiv,
  darfVerteilen,
  darfEinstellenFuerAndere,
  darfPersonenVerwalten,
  darfRoutinenVerwalten,
  darfPlanAendern,
  darfNachweisHochladen,
  darfFreigeben,
  darfPlanSehen,
  darfNachweisSehen,
  darfAufgabeSehen,
  darfFreigabenSehen,
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
    const rike = legePerson("dev:rike@localtest.me", "koordination");
    sitzung = { user: { id: "dev:rike@localtest.me" } };
    await expect(personFuerSession(t.db)).resolves.toEqual(rike);
  });
});

/*
 * `personFuerSeite` (Spec-Nachtrag 2026-08-14, `1d36008`): dieselbe Aufloesung wie
 * `personFuerSession`, ausser dass eine fehlende `personen`-Zeile `null` statt `notFound()` ergibt
 * — jede Seite waehlt selbst, was sie mit `null` macht (heute: `NichtEingetragenSeite`).
 */
describe("personFuerSeite", () => {
  it("ohne Sitzung: weiterhin notFound(), kein `null`", async () => {
    sitzung = null;
    await expect(personFuerSeite(t.db)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("Sitzung ohne passende personen-Zeile: `null`, KEIN notFound() (die Ausnahme)", async () => {
    sitzung = { user: { id: "dev:unbekannt@localtest.me" } };
    await expect(personFuerSeite(t.db)).resolves.toBeNull();
  });

  it("Sitzung mit passender Zeile: die Person, aufgeloest ueber sub", async () => {
    const rike = legePerson("dev:rike@localtest.me", "koordination");
    sitzung = { user: { id: "dev:rike@localtest.me" } };
    await expect(personFuerSeite(t.db)).resolves.toEqual(rike);
  });
});

/**
 * `subFuerSitzung` (Aufgabe 14) — der Ausgang aus `NichtEingetragenSeite`: isoliert aus
 * `personFuerSeite`, OHNE Datenbank, OHNE Wurf. Keine dritte Fassung: beide Funktionen lesen
 * `session?.user?.id` ueber denselben `sitzung`-Mock.
 */
describe("subFuerSitzung", () => {
  it("ohne Sitzung: `null`, KEIN notFound()", async () => {
    sitzung = null;
    await expect(subFuerSitzung()).resolves.toBeNull();
  });

  it("mit Sitzung, unabhaengig von einer personen-Zeile: der `sub`", async () => {
    sitzung = { user: { id: "dev:unbekannt@localtest.me" } };
    await expect(subFuerSitzung()).resolves.toBe("dev:unbekannt@localtest.me");
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

describe("darfFreigabenSehen — auftrag oder koordination, und aktiv (Aufgabe 15, Spec §8: '/freigaben')", () => {
  it.each<[Rolle, boolean]>([
    ["koordination", true],
    ["auftrag", true],
    ["bufdi", false],
  ])("Rolle %s → %s", (rolle, erwartet) => {
    const p = legePerson(`fs-${rolle}`, rolle);
    expect(darfFreigabenSehen(p, HEUTE)).toBe(erwartet);
  });

  it("ausgeschiedener auftrag darf die Warteschlange nicht mehr sehen", () => {
    const p = legePerson("fs-inaktiv", "auftrag", { aktivBis: "2026-08-01" });
    expect(darfFreigabenSehen(p, HEUTE)).toBe(false);
  });
});

describe("darfRoutinenVerwalten — nur bufdi, und aktiv (Aufgabe 13, Spec §8: '/routinen' fuer bufdi)", () => {
  it.each<[Rolle, boolean]>([
    ["koordination", false],
    ["auftrag", false],
    ["bufdi", true],
  ])("Rolle %s → %s", (rolle, erwartet) => {
    const p = legePerson(`rv-${rolle}`, rolle);
    expect(darfRoutinenVerwalten(p, HEUTE)).toBe(erwartet);
  });

  it("ein ausgeschiedener BuFDi darf keine Routinen mehr verwalten", () => {
    const p = legePerson("rv-inaktiv", "bufdi", { aktivBis: "2026-08-01" });
    expect(darfRoutinenVerwalten(p, HEUTE)).toBe(false);
  });
});

describe("darfPlanAendern — ausschliesslich die Zielperson selbst, auch nicht koordination", () => {
  /*
   * Das Praedikat fragt NUR nach Identitaet (`p.id === zielPersonId`), nicht nach Rolle — jede
   * Rolle aendert IHREN EIGENEN Plan. Die eigentliche Aussage der Regel ("auch koordination nicht
   * FREMDE Plaene") steht im Test direkt darunter, mit Rike und Alinas Plan.
   */
  it.each<Rolle>(["koordination", "auftrag", "bufdi"])(
    "Rolle %s auf den EIGENEN Plan → true",
    (rolle) => {
      const p = legePerson(`pa-${rolle}`, rolle);
      expect(darfPlanAendern(p, p.id, HEUTE)).toBe(true);
    },
  );

  it("Rike (koordination) darf Alinas Plan nicht aendern — sie schlaegt nur vor", () => {
    const rike = legePerson("pa-rike", "koordination");
    const alina = legePerson("pa-alina", "bufdi");
    expect(darfPlanAendern(rike, alina.id, HEUTE)).toBe(false);
  });

  it("ausgeschiedener BuFDi aendert den eigenen Plan nicht mehr", () => {
    const p = legePerson("pa-inaktiv", "bufdi", { aktivBis: "2026-08-01" });
    expect(darfPlanAendern(p, p.id, HEUTE)).toBe(false);
  });
});

/**
 * `darfNachweisHochladen` TRAEGT BEWUSST KEINE ZUSTANDSBEDINGUNG (Aufgabe 19, Kopfkommentar der
 * Funktion) — der `in_arbeit`-Check steht in `_lib/aktionsOptionen.ts`, nicht hier. Diese Tests
 * pruefen deshalb ausschliesslich die Personen-Frage; eine Fixtur mit `status` waere hier
 * KONFUNDIERT, weil das Praedikat den Status gar nicht liest.
 */
describe("darfNachweisHochladen — die zugewiesene Person, aktiv; der Zustand ist nicht ihre Sache", () => {
  it("die zugewiesene, aktive Person darf", () => {
    const bufdi = legePerson("nh-bufdi", "bufdi");
    const a = legeAufgabe({ erstellerId: bufdi.id, zugewiesenAn: bufdi.id });
    expect(darfNachweisHochladen(bufdi, a, HEUTE)).toBe(true);
  });

  it("eine andere Person — auch koordination — darf nicht, auch wenn sie erstellt hat", () => {
    const bufdi = legePerson("nh-bufdi2", "bufdi");
    const koordination = legePerson("nh-koord", "koordination");
    const a = legeAufgabe({ erstellerId: koordination.id, zugewiesenAn: bufdi.id });
    expect(darfNachweisHochladen(koordination, a, HEUTE)).toBe(false);
  });

  it("die zugewiesene, aber ausgeschiedene Person darf nicht mehr", () => {
    const bufdi = legePerson("nh-ex", "bufdi", { aktivBis: "2026-08-01" });
    const a = legeAufgabe({ erstellerId: bufdi.id, zugewiesenAn: bufdi.id });
    expect(darfNachweisHochladen(bufdi, a, HEUTE)).toBe(false);
  });

  it("eine unzugewiesene Aufgabe (zugewiesenAn: null) hat niemanden, der duerfte", () => {
    const bufdi = legePerson("nh-bufdi3", "bufdi");
    const a = legeAufgabe({ erstellerId: bufdi.id, zugewiesenAn: null });
    expect(darfNachweisHochladen(bufdi, a, HEUTE)).toBe(false);
  });
});

describe("darfFreigeben", () => {
  /**
   * DIE KREUZPROBE: Selbstaufgabe × alle drei Rollen. `istSelbst` gewinnt IMMER, auch gegen
   * `rolle === "koordination"` und selbst wenn `prueferId` zufaellig auf die pruefende Person
   * zeigt — ohne diese erste Zeile stimmten `prueferId === null` (Selbstaufgaben haben keinen
   * Pruefer) und `rolle === "koordination"` je fuer sich, und Rike bekaeme einen Freigabeknopf
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
    const rike = legePerson("fr2-rike", "koordination");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      prueferId: pruefer.id,
      status: "freigabe_offen",
    });
    expect(darfFreigeben(rike, a, HEUTE)).toBe(true);
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

  /*
   * BETREIBERENTSCHEIDUNG 2026-08-13: die Koordination verteilt, sie arbeitet nicht mit. Ohne
   * diese Klausel waere hier ein begehbarer Pfad: Ersteller fremd (`ersteller !== zugewiesenAn`,
   * `istSelbst` bleibt `false`), die Koordination verteilt die Aufgabe an SICH SELBST, bearbeitet
   * sie und gibt am Ende ihre eigene Arbeit frei — das Vier-Augen-Prinzip fiele fuer genau diesen
   * Fall aus, obwohl es mit dem Ersteller einen regulaeren Pruefer gaebe.
   */
  it("die Koordination gibt eine ihr selbst zugewiesene Fremdaufgabe NICHT frei", () => {
    const ersteller = legePerson("fr5-ersteller", "auftrag");
    const rike = legePerson("fr5-rike", "koordination");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: rike.id,
      prueferId: ersteller.id,
      status: "freigabe_offen",
    });
    expect(darfFreigeben(rike, a, HEUTE)).toBe(false);
  });
});

/**
 * SICHTPRAEDIKATE PRUEFEN istAktiv NICHT — eine ausgeschiedene Person liest ihre Geschichte,
 * bewegt aber nichts (Spec §7). Deshalb tragen die folgenden Praedikate bewusst KEIN
 * `heute`-Argument. Der eigentliche Beweis dafuer steht NICHT in der Abwesenheit eines Parameters,
 * sondern im eigenen Testblock weiter unten ("Sichtpraedikate gelten weiter fuer Ausgeschiedene"):
 * ohne ihn koennte jemand `istAktiv` still IN eine dieser Funktionen einbauen — die Signatur
 * bliebe gleich, der Typecheck bliebe gruen, und genau der Fall aus Spec §7 (ein ehemaliger BuFDi
 * sieht seine eigene Dokumentation nicht mehr) waere ungetestet kaputt.
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
    const rike = legePerson("ns-rike", "koordination");
    const ersteller = legePerson("ns-ersteller", "auftrag");
    const bufdi = legePerson("ns-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      status: "freigabe_offen",
    });
    expect(darfNachweisSehen(rike, a)).toBe(true);
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

  /**
   * DIE NEUE KLAUSEL (Aufgabe 16, Widerspruch — s. Bericht): der eingetragene Pruefer ist WEDER
   * Ersteller NOCH Zugewiesener und sah den Nachweis vorher trotzdem schon auf `/freigaben`
   * (`_db/queries.ts`s `freigabeDaten` haengt ihn ueber `darfFreigeben` an, nicht ueber
   * `darfNachweisSehen`) — ohne diese Klausel haette `/a/<id>` (Aufgabe 16) ihm denselben Nachweis
   * verweigert, den er auf der Freigabe-Warteschlange bereits sieht.
   */
  it("der eingetragene Pruefer sieht den Nachweis, auch wenn er weder Ersteller noch Zugewiesener ist", () => {
    const ersteller = legePerson("ns5-ersteller", "auftrag");
    const pruefer = legePerson("ns5-pruefer", "auftrag");
    const bufdi = legePerson("ns5-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      prueferId: pruefer.id,
      status: "freigabe_offen",
    });
    expect(darfNachweisSehen(pruefer, a)).toBe(true);
  });

  /**
   * BETREIBERENTSCHEIDUNG AUS FIX-RUNDE 1 (`_lib/zugang.ts`s Kopfkommentar zur Pruefer-Klausel):
   * die Klausel traegt bewusst KEIN `istAktiv` — ein ausgeschiedener Pruefer sieht den Nachweis
   * WEITERHIN, obwohl er ihn auf `/freigaben` nie sah (`darfFreigeben` prueft `istAktiv`, diese
   * Funktion nicht). Die Handlungsseite bleibt trotzdem geschuetzt: `darfFreigeben(exPruefer, a,
   * heute)` bleibt `false`, s. den eigenen `darfFreigeben`-Testblock.
   */
  it("ein AUSGESCHIEDENER Pruefer sieht den Nachweis trotzdem — Sichtpraedikat, kein istAktiv-Gefaelle", () => {
    const ersteller = legePerson("ns6-ersteller", "auftrag");
    const exPruefer = legePerson("ns6-expruefer", "auftrag", { aktivBis: "2020-01-01" });
    const bufdi = legePerson("ns6-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      prueferId: exPruefer.id,
      status: "freigabe_offen",
    });
    expect(darfNachweisSehen(exPruefer, a)).toBe(true);
    expect(darfFreigeben(exPruefer, a, HEUTE)).toBe(false);
  });
});

describe("darfAufgabeSehen — koordination und jeder BuFDi sehen jede Aufgabe; auftrag nur die eigene", () => {
  it("koordination sieht jede Aufgabe", () => {
    const rike = legePerson("das-rike", "koordination");
    const ersteller = legePerson("das-ersteller", "auftrag");
    const a = legeAufgabe({ erstellerId: ersteller.id });
    expect(darfAufgabeSehen(rike, a)).toBe(true);
  });

  it("JEDER BuFDi sieht jede Aufgabe — das Spiegelbild zu darfPlanSehen", () => {
    const ersteller = legePerson("das2-ersteller", "auftrag");
    const zugewiesen = legePerson("das2-zugewiesen", "bufdi");
    const fremderBufdi = legePerson("das2-fremd", "bufdi");
    const a = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: zugewiesen.id });
    expect(darfAufgabeSehen(fremderBufdi, a)).toBe(true);
  });

  it("ein Auftraggeber sieht eine FREMDE Aufgabe (anderer Ersteller, kein Pruefer) NICHT", () => {
    const ersteller = legePerson("das3-ersteller", "auftrag");
    const fremderAuftrag = legePerson("das3-fremd", "auftrag");
    const a = legeAufgabe({ erstellerId: ersteller.id, prueferId: ersteller.id });
    expect(darfAufgabeSehen(fremderAuftrag, a)).toBe(false);
  });

  it("der Ersteller sieht die eigene Aufgabe", () => {
    const ersteller = legePerson("das4-ersteller", "auftrag");
    const a = legeAufgabe({ erstellerId: ersteller.id, prueferId: ersteller.id });
    expect(darfAufgabeSehen(ersteller, a)).toBe(true);
  });

  it("der eingetragene Pruefer sieht die Aufgabe, auch ohne Ersteller oder Zugewiesener zu sein", () => {
    const ersteller = legePerson("das5-ersteller", "auftrag");
    const pruefer = legePerson("das5-pruefer", "auftrag");
    const bufdi = legePerson("das5-bufdi", "bufdi");
    const a = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id, prueferId: pruefer.id });
    expect(darfAufgabeSehen(pruefer, a)).toBe(true);
  });

  it("gilt unabhaengig von istAktiv — Sichtpraedikat, kein Handlungspraedikat", () => {
    const ersteller = legePerson("das6-ersteller", "auftrag");
    const exBufdi = legePerson("das6-ex", "bufdi", { aktivBis: "2020-01-01" });
    const a = legeAufgabe({ erstellerId: ersteller.id });
    expect(darfAufgabeSehen(exBufdi, a)).toBe(true);
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
    const rike = legePerson("vf-rike", "koordination");
    const bufdi = legePerson("vf-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: pruefer.id,
      zugewiesenAn: bufdi.id,
      prueferId: pruefer.id,
      status: "freigabe_offen",
    });
    expect(istVertretungsfreigabe(rike, a)).toBe(true);
  });

  it("koordination === Pruefer: keine Vertretung", () => {
    const rike = legePerson("vf2-rike", "koordination");
    const bufdi = legePerson("vf2-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: rike.id,
      zugewiesenAn: bufdi.id,
      prueferId: rike.id,
      status: "freigabe_offen",
    });
    expect(istVertretungsfreigabe(rike, a)).toBe(false);
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

  /*
   * `prueferId === null` gehoert zu einer SELBSTAUFGABE (Schema-Kommentar: "Null genau dann, wenn
   * istSelbst"). Kein heutiger Pfad erzeugt eine FREMDAUFGABE ohne Pruefer, aber die Funktion
   * verlaesst sich sonst auf eine Zusage, die anderswo gehalten werden muss — ohne die Klausel
   * `&& a.prueferId !== null` waere dieser Fall `true` und Aufgabe 10 schriebe daraus
   * "Freigegeben von X in Vertretung fuer —".
   */
  it("kein eingetragener Pruefer: keine Vertretung, auch fuer koordination", () => {
    const rike = legePerson("vf4-rike", "koordination");
    const bufdi = legePerson("vf4-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: bufdi.id,
      zugewiesenAn: bufdi.id,
      prueferId: null,
      istSelbst: true,
      status: "in_arbeit",
    });
    expect(istVertretungsfreigabe(rike, a)).toBe(false);
  });
});

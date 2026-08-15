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
  akteurFuerSeite,
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
  type Akteur,
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

/**
 * DIE FIXTUR-ZEILE ALS `Akteur`. `istKoordination` STEHT AUSDRUECKLICH AM AUFRUF, NICHT ABGELEITET
 * AUS DER ZEILE: seit dem Quellenwechsel (2026-08-15) liegt die Koordination auf einer ANDEREN
 * ACHSE als `rolle` — sie kommt aus der Auth-Gruppe, und `ROLLEN` kennt `koordination` gar nicht
 * mehr. Genau deshalb pruefen die Tabellen unten VIER Kombinationen (zwei Rollen × mit/ohne
 * Gruppe) statt der bisherigen drei Rollen: die frueher gar nicht darstellbaren Faelle
 * ("auftrag MIT Gruppe", "bufdi MIT Gruppe") sind die interessanten.
 */
function akteur(p: PersonRow, istKoordination = false): Akteur {
  return { person: p, istKoordination };
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
    const rike = legePerson("dev:rike@localtest.me", "auftrag");
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
    const rike = legePerson("dev:rike@localtest.me", "auftrag");
    sitzung = { user: { id: "dev:rike@localtest.me" } };
    await expect(personFuerSeite(t.db)).resolves.toEqual(rike);
  });
});

/**
 * DIE KOORDINATION KOMMT AUS DER AUTH-GRUPPE, NICHT AUS DER ZEILE (Entwurf 2026-08-15).
 *
 * Die drei Faelle sind genau die drei Aussagen des Quellenwechsels: die Gruppe traegt die Rolle,
 * die Zeile traegt sie NICHT mehr, und der Suite-Admin kommt mit durch. Sie brauchen keinen
 * zusaetzlichen Mock — `canAdminModule` (`core/auth/guards.ts`) liest dieselbe `auth()`-Attrappe
 * wie `personFuerSeite` und gleicht `session.user.groups` gegen die `adminGroups` des Moduls aus
 * `core/registry.ts` ab. `iuk-aufgaben-koordination` und `dashboard-admins` sind deren
 * Vorgabewerte; sie stehen hier woertlich, weil `SUITE_ADMIN_GROUP_AUFGABEN`/`ADMIN_GROUP` in der
 * Testumgebung nicht gesetzt sind (der Fall, den der Betrieb per Env ueberschreibt, ist Sache von
 * `core/groups.test.ts`, nicht dieser Datei).
 */
describe("akteurFuerSeite — die Koordination kommt aus der Gruppe, nicht aus der Zeile", () => {
  it("eine auftrag-Zeile MIT Koordinationsgruppe koordiniert", async () => {
    legePerson("dev:malte@localtest.me", "auftrag");
    sitzung = { user: { id: "dev:malte@localtest.me", groups: ["iuk-aufgaben-koordination"] } };
    const a = await akteurFuerSeite(t.db);
    expect(a?.istKoordination).toBe(true);
  });

  /*
   * FRUEHER HIESS DIESER FALL "eine koordination-Zeile OHNE Gruppe koordiniert NICHT" — die Zeile
   * gibt es seit `ROLLEN = ["auftrag", "bufdi"]` nicht mehr, die AUSSAGE bleibt dieselbe und wiegt
   * sogar schwerer: KEIN Wert der Modultabelle verleiht die Koordination, auch nicht der, den die
   * frueher koordinierenden Zeilen per Migration `0002` bekommen haben.
   */
  it("eine auftrag-Zeile OHNE Gruppe koordiniert NICHT", async () => {
    legePerson("dev:rike@localtest.me", "auftrag");
    sitzung = { user: { id: "dev:rike@localtest.me", groups: [] } };
    const a = await akteurFuerSeite(t.db);
    expect(a?.istKoordination).toBe(false);
  });

  it("der Suite-Admin koordiniert — der Notausgang aus personen/page.tsx gilt jetzt modulweit", async () => {
    legePerson("dev:betreiber@localtest.me", "bufdi");
    sitzung = { user: { id: "dev:betreiber@localtest.me", groups: ["dashboard-admins"] } };
    const a = await akteurFuerSeite(t.db);
    expect(a?.istKoordination).toBe(true);
  });

  it("die Personenzeile selbst bleibt unberuehrt — nur `istKoordination` wechselt die Quelle", async () => {
    const malte = legePerson("dev:malte2@localtest.me", "auftrag");
    sitzung = { user: { id: "dev:malte2@localtest.me", groups: ["iuk-aufgaben-koordination"] } };
    const a = await akteurFuerSeite(t.db);
    expect(a?.person).toEqual(malte);
    expect(a?.person.rolle).toBe("auftrag");
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
 * ERSCHOEPFEND UEBER DIE VIER KOMBINATIONEN, nicht stichprobenweise (Brief-Vorgabe): jedes
 * Handlungspraedikat wird fuer `auftrag`/`bufdi` × mit/ohne Koordinationsgruppe UND einmal fuer eine
 * ausgeschiedene Person geprueft. Handlungspraedikate pruefen istAktiv SELBST statt hinter einem
 * vorgeschalteten Gate — sonst ist der ausgeschiedene Fall genau der, den niemand testet.
 *
 * VIER ZEILEN STATT DREI SEIT DEM QUELLENWECHSEL (2026-08-15): die Achsen `rolle` und
 * `istKoordination` sind unabhaengig geworden, also wird ueber BEIDE erschoepft. Die frueher gar
 * nicht darstellbaren Zeilen ("auftrag MIT Gruppe", "bufdi MIT Gruppe") sind dabei die
 * interessanten — sie beschreiben genau die Personen, die es im Betrieb ab jetzt gibt. Eine
 * Tabelle, die nach dem Umbau kuerzer waere als vorher, haette Deckung verloren statt gewonnen.
 */
describe("darfVerteilen — nur die Koordination, und aktiv", () => {
  it.each<[Rolle, boolean, boolean]>([
    ["auftrag", false, false],
    ["auftrag", true, true],
    ["bufdi", false, false],
    ["bufdi", true, true],
  ])("Rolle %s, koordiniert %s → %s", (rolle, istKoordination, erwartet) => {
    const p = legePerson(`v-${rolle}-${istKoordination}`, rolle);
    expect(darfVerteilen(akteur(p, istKoordination), HEUTE)).toBe(erwartet);
  });

  it("ausgeschiedene Koordination darf nicht mehr verteilen", () => {
    const p = legePerson("v-inaktiv", "auftrag", { aktivBis: "2026-08-01" });
    expect(darfVerteilen(akteur(p, true), HEUTE)).toBe(false);
  });
});

describe("darfEinstellenFuerAndere — auftrag oder die Koordination, und aktiv", () => {
  it.each<[Rolle, boolean, boolean]>([
    ["auftrag", false, true],
    ["auftrag", true, true],
    ["bufdi", false, false],
    ["bufdi", true, true],
  ])("Rolle %s, koordiniert %s → %s", (rolle, istKoordination, erwartet) => {
    const p = legePerson(`e-${rolle}-${istKoordination}`, rolle);
    expect(darfEinstellenFuerAndere(akteur(p, istKoordination), HEUTE)).toBe(erwartet);
  });

  it("ausgeschiedener auftrag darf nicht mehr fremd einstellen", () => {
    const p = legePerson("e-inaktiv", "auftrag", { aktivBis: "2026-08-01" });
    expect(darfEinstellenFuerAndere(akteur(p), HEUTE)).toBe(false);
  });
});

describe("darfPersonenVerwalten — nur die Koordination, und aktiv", () => {
  it.each<[Rolle, boolean, boolean]>([
    ["auftrag", false, false],
    ["auftrag", true, true],
    ["bufdi", false, false],
    ["bufdi", true, true],
  ])("Rolle %s, koordiniert %s → %s", (rolle, istKoordination, erwartet) => {
    const p = legePerson(`pv-${rolle}-${istKoordination}`, rolle);
    expect(darfPersonenVerwalten(akteur(p, istKoordination), HEUTE)).toBe(erwartet);
  });

  it("ausgeschiedene Koordination darf Personen nicht mehr verwalten", () => {
    const p = legePerson("pv-inaktiv", "auftrag", { aktivBis: "2026-08-01" });
    expect(darfPersonenVerwalten(akteur(p, true), HEUTE)).toBe(false);
  });
});

describe("darfFreigabenSehen — auftrag oder die Koordination, und aktiv (Aufgabe 15, Spec §8: '/freigaben')", () => {
  it.each<[Rolle, boolean, boolean]>([
    ["auftrag", false, true],
    ["auftrag", true, true],
    ["bufdi", false, false],
    ["bufdi", true, true],
  ])("Rolle %s, koordiniert %s → %s", (rolle, istKoordination, erwartet) => {
    const p = legePerson(`fs-${rolle}-${istKoordination}`, rolle);
    expect(darfFreigabenSehen(akteur(p, istKoordination), HEUTE)).toBe(erwartet);
  });

  it("ausgeschiedener auftrag darf die Warteschlange nicht mehr sehen", () => {
    const p = legePerson("fs-inaktiv", "auftrag", { aktivBis: "2026-08-01" });
    expect(darfFreigabenSehen(akteur(p), HEUTE)).toBe(false);
  });
});

/*
 * `/routinen` BLEIBT AN DER ZEILE, NICHT AN DER GRUPPE (Entwurf 2026-08-15, "bewusst nicht Teil"):
 * die Koordinationsgruppe oeffnet die Routinenverwaltung NICHT — die Tabelle nennt "bufdi MIT
 * Gruppe" trotzdem, weil `true` dort aus der ROLLE folgt und nicht aus der Gruppe. Faellt die Zeile
 * je auf `istKoordination` zurueck, wird "auftrag, koordiniert true" rot.
 */
describe("darfRoutinenVerwalten — nur bufdi, und aktiv (Aufgabe 13, Spec §8: '/routinen' fuer bufdi)", () => {
  it.each<[Rolle, boolean, boolean]>([
    ["auftrag", false, false],
    ["auftrag", true, false],
    ["bufdi", false, true],
    ["bufdi", true, true],
  ])("Rolle %s, koordiniert %s → %s", (rolle, istKoordination, erwartet) => {
    const p = legePerson(`rv-${rolle}-${istKoordination}`, rolle);
    expect(darfRoutinenVerwalten(akteur(p, istKoordination), HEUTE)).toBe(erwartet);
  });

  it("ein ausgeschiedener BuFDi darf keine Routinen mehr verwalten", () => {
    const p = legePerson("rv-inaktiv", "bufdi", { aktivBis: "2026-08-01" });
    expect(darfRoutinenVerwalten(akteur(p), HEUTE)).toBe(false);
  });
});

describe("darfPlanAendern — ausschliesslich die Zielperson selbst, auch nicht die Koordination", () => {
  /*
   * Das Praedikat fragt NUR nach Identitaet (`p.id === zielPersonId`), nicht nach Rolle und nicht
   * nach der Gruppe — jede Person aendert IHREN EIGENEN Plan. Die eigentliche Aussage der Regel
   * ("auch die Koordination nicht FREMDE Plaene") steht im Test direkt darunter, mit Rike und
   * Alinas Plan.
   */
  it.each<[Rolle, boolean]>([
    ["auftrag", false],
    ["auftrag", true],
    ["bufdi", false],
    ["bufdi", true],
  ])("Rolle %s, koordiniert %s, auf den EIGENEN Plan → true", (rolle, istKoordination) => {
    const p = legePerson(`pa-${rolle}-${istKoordination}`, rolle);
    expect(darfPlanAendern(akteur(p, istKoordination), p.id, HEUTE)).toBe(true);
  });

  it("Rike (koordiniert) darf Alinas Plan nicht aendern — sie schlaegt nur vor", () => {
    const rike = legePerson("pa-rike", "auftrag");
    const alina = legePerson("pa-alina", "bufdi");
    expect(darfPlanAendern(akteur(rike, true), alina.id, HEUTE)).toBe(false);
  });

  it("ausgeschiedener BuFDi aendert den eigenen Plan nicht mehr", () => {
    const p = legePerson("pa-inaktiv", "bufdi", { aktivBis: "2026-08-01" });
    expect(darfPlanAendern(akteur(p), p.id, HEUTE)).toBe(false);
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
    expect(darfNachweisHochladen(akteur(bufdi), a, HEUTE)).toBe(true);
  });

  it("eine andere Person — auch koordination — darf nicht, auch wenn sie erstellt hat", () => {
    const bufdi = legePerson("nh-bufdi2", "bufdi");
    const koordination = legePerson("nh-koord", "auftrag");
    const a = legeAufgabe({ erstellerId: koordination.id, zugewiesenAn: bufdi.id });
    expect(darfNachweisHochladen(akteur(koordination, true), a, HEUTE)).toBe(false);
  });

  it("die zugewiesene, aber ausgeschiedene Person darf nicht mehr", () => {
    const bufdi = legePerson("nh-ex", "bufdi", { aktivBis: "2026-08-01" });
    const a = legeAufgabe({ erstellerId: bufdi.id, zugewiesenAn: bufdi.id });
    expect(darfNachweisHochladen(akteur(bufdi), a, HEUTE)).toBe(false);
  });

  it("eine unzugewiesene Aufgabe (zugewiesenAn: null) hat niemanden, der duerfte", () => {
    const bufdi = legePerson("nh-bufdi3", "bufdi");
    const a = legeAufgabe({ erstellerId: bufdi.id, zugewiesenAn: null });
    expect(darfNachweisHochladen(akteur(bufdi), a, HEUTE)).toBe(false);
  });
});

describe("darfFreigeben", () => {
  /**
   * DIE KREUZPROBE: Selbstaufgabe × alle vier Kombinationen. `istSelbst` gewinnt IMMER, auch gegen
   * `istKoordination` und selbst wenn `prueferId` zufaellig auf die pruefende Person zeigt — ohne
   * diese erste Zeile stimmten `prueferId === null` (Selbstaufgaben haben keinen Pruefer) und
   * `istKoordination` je fuer sich, und Rike bekaeme einen Freigabeknopf fuer eine Aufgabe, die gar
   * keine Freigabestufe hat.
   */
  it.each<[Rolle, boolean]>([
    ["auftrag", false],
    ["auftrag", true],
    ["bufdi", false],
    ["bufdi", true],
  ])("Selbstaufgabe: IMMER false, auch fuer %s (koordiniert %s)", (rolle, istKoordination) => {
    const p = legePerson(`sa-${rolle}-${istKoordination}`, rolle);
    const a = legeAufgabe({
      erstellerId: p.id,
      zugewiesenAn: p.id,
      istSelbst: true,
      prueferId: null,
      status: "in_arbeit",
    });
    expect(darfFreigeben(akteur(p, istKoordination), a, HEUTE)).toBe(false);
  });

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
    expect(darfFreigeben(akteur(pruefer), a, HEUTE)).toBe(true);
  });

  it("Fremdaufgabe: koordination darf freigeben, auch ohne selbst Pruefer zu sein", () => {
    const ersteller = legePerson("fr2-ersteller", "auftrag");
    const pruefer = legePerson("fr2-pruefer", "auftrag");
    const bufdi = legePerson("fr2-bufdi", "bufdi");
    const rike = legePerson("fr2-rike", "auftrag");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      prueferId: pruefer.id,
      status: "freigabe_offen",
    });
    expect(darfFreigeben(akteur(rike, true), a, HEUTE)).toBe(true);
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
    expect(darfFreigeben(akteur(dritter), a, HEUTE)).toBe(false);
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
    expect(darfFreigeben(akteur(pruefer), a, HEUTE)).toBe(false);
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
    const rike = legePerson("fr5-rike", "auftrag");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: rike.id,
      prueferId: ersteller.id,
      status: "freigabe_offen",
    });
    expect(darfFreigeben(akteur(rike, true), a, HEUTE)).toBe(false);
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
  it.each<[Rolle, boolean]>([
    ["auftrag", false],
    ["auftrag", true],
    ["bufdi", false],
    ["bufdi", true],
  ])("Rolle %s (koordiniert %s) sieht den Plan jeder anderen Person", (rolle, istKoordination) => {
    const p = legePerson(`ps-${rolle}-${istKoordination}`, rolle);
    const andere = legePerson(`ps-ziel-${rolle}-${istKoordination}`, "bufdi");
    expect(darfPlanSehen(akteur(p, istKoordination), andere.id)).toBe(true);
  });
});

describe("darfNachweisSehen — Verfasser, koordination, oder Ersteller; nicht jeder BuFDi", () => {
  it("koordination sieht jeden Nachweis", () => {
    const rike = legePerson("ns-rike", "auftrag");
    const ersteller = legePerson("ns-ersteller", "auftrag");
    const bufdi = legePerson("ns-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      status: "freigabe_offen",
    });
    expect(darfNachweisSehen(akteur(rike, true), a)).toBe(true);
  });

  it("der Ersteller der Aufgabe sieht den Nachweis", () => {
    const ersteller = legePerson("ns2-ersteller", "auftrag");
    const bufdi = legePerson("ns2-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      status: "freigabe_offen",
    });
    expect(darfNachweisSehen(akteur(ersteller), a)).toBe(true);
  });

  it("die zugewiesene Person (Verfasserin des Nachweises) sieht ihn", () => {
    const ersteller = legePerson("ns3-ersteller", "auftrag");
    const bufdi = legePerson("ns3-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      status: "freigabe_offen",
    });
    expect(darfNachweisSehen(akteur(bufdi), a)).toBe(true);
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
    expect(darfNachweisSehen(akteur(fremd), a)).toBe(false);
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
    expect(darfNachweisSehen(akteur(pruefer), a)).toBe(true);
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
    expect(darfNachweisSehen(akteur(exPruefer), a)).toBe(true);
    expect(darfFreigeben(akteur(exPruefer), a, HEUTE)).toBe(false);
  });
});

describe("darfAufgabeSehen — koordination und jeder BuFDi sehen jede Aufgabe; auftrag nur die eigene", () => {
  it("koordination sieht jede Aufgabe", () => {
    const rike = legePerson("das-rike", "auftrag");
    const ersteller = legePerson("das-ersteller", "auftrag");
    const a = legeAufgabe({ erstellerId: ersteller.id });
    expect(darfAufgabeSehen(akteur(rike, true), a)).toBe(true);
  });

  it("JEDER BuFDi sieht jede Aufgabe — das Spiegelbild zu darfPlanSehen", () => {
    const ersteller = legePerson("das2-ersteller", "auftrag");
    const zugewiesen = legePerson("das2-zugewiesen", "bufdi");
    const fremderBufdi = legePerson("das2-fremd", "bufdi");
    const a = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: zugewiesen.id });
    expect(darfAufgabeSehen(akteur(fremderBufdi), a)).toBe(true);
  });

  it("ein Auftraggeber sieht eine FREMDE Aufgabe (anderer Ersteller, kein Pruefer) NICHT", () => {
    const ersteller = legePerson("das3-ersteller", "auftrag");
    const fremderAuftrag = legePerson("das3-fremd", "auftrag");
    const a = legeAufgabe({ erstellerId: ersteller.id, prueferId: ersteller.id });
    expect(darfAufgabeSehen(akteur(fremderAuftrag), a)).toBe(false);
  });

  it("der Ersteller sieht die eigene Aufgabe", () => {
    const ersteller = legePerson("das4-ersteller", "auftrag");
    const a = legeAufgabe({ erstellerId: ersteller.id, prueferId: ersteller.id });
    expect(darfAufgabeSehen(akteur(ersteller), a)).toBe(true);
  });

  it("der eingetragene Pruefer sieht die Aufgabe, auch ohne Ersteller oder Zugewiesener zu sein", () => {
    const ersteller = legePerson("das5-ersteller", "auftrag");
    const pruefer = legePerson("das5-pruefer", "auftrag");
    const bufdi = legePerson("das5-bufdi", "bufdi");
    const a = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id, prueferId: pruefer.id });
    expect(darfAufgabeSehen(akteur(pruefer), a)).toBe(true);
  });

  it("gilt unabhaengig von istAktiv — Sichtpraedikat, kein Handlungspraedikat", () => {
    const ersteller = legePerson("das6-ersteller", "auftrag");
    const exBufdi = legePerson("das6-ex", "bufdi", { aktivBis: "2020-01-01" });
    const a = legeAufgabe({ erstellerId: ersteller.id });
    expect(darfAufgabeSehen(akteur(exBufdi), a)).toBe(true);
  });
});

describe("Sichtpraedikate gelten weiter fuer Ausgeschiedene", () => {
  it("eine ausgeschiedene Person sieht den Plan anderer weiterhin", () => {
    const ex = legePerson("sicht-ex", "bufdi", { aktivBis: "2026-08-01" });
    const andere = legePerson("sicht-ziel", "bufdi");
    expect(darfPlanSehen(akteur(ex), andere.id)).toBe(true);
  });

  it("eine ausgeschiedene Person sieht den Nachweis ihrer eigenen (abgeschlossenen) Aufgabe weiterhin", () => {
    const ex = legePerson("sicht-ex2", "bufdi", { aktivBis: "2026-08-01" });
    const ersteller = legePerson("sicht-ersteller", "auftrag");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: ex.id,
      status: "abgeschlossen",
    });
    expect(darfNachweisSehen(akteur(ex), a)).toBe(true);
  });
});

describe("istVertretungsfreigabe — koordination gibt frei, ohne Pruefer zu sein", () => {
  it("koordination !== Pruefer: Vertretung", () => {
    const pruefer = legePerson("vf-pruefer", "auftrag");
    const rike = legePerson("vf-rike", "auftrag");
    const bufdi = legePerson("vf-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: pruefer.id,
      zugewiesenAn: bufdi.id,
      prueferId: pruefer.id,
      status: "freigabe_offen",
    });
    expect(istVertretungsfreigabe(akteur(rike, true), a)).toBe(true);
  });

  it("koordination === Pruefer: keine Vertretung", () => {
    const rike = legePerson("vf2-rike", "auftrag");
    const bufdi = legePerson("vf2-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: rike.id,
      zugewiesenAn: bufdi.id,
      prueferId: rike.id,
      status: "freigabe_offen",
    });
    expect(istVertretungsfreigabe(akteur(rike, true), a)).toBe(false);
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
    expect(istVertretungsfreigabe(akteur(anderer), a)).toBe(false);
  });

  /*
   * `prueferId === null` gehoert zu einer SELBSTAUFGABE (Schema-Kommentar: "Null genau dann, wenn
   * istSelbst"). Kein heutiger Pfad erzeugt eine FREMDAUFGABE ohne Pruefer, aber die Funktion
   * verlaesst sich sonst auf eine Zusage, die anderswo gehalten werden muss — ohne die Klausel
   * `&& a.prueferId !== null` waere dieser Fall `true` und Aufgabe 10 schriebe daraus
   * "Freigegeben von X in Vertretung fuer —".
   */
  it("kein eingetragener Pruefer: keine Vertretung, auch fuer koordination", () => {
    const rike = legePerson("vf4-rike", "auftrag");
    const bufdi = legePerson("vf4-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: bufdi.id,
      zugewiesenAn: bufdi.id,
      prueferId: null,
      istSelbst: true,
      status: "in_arbeit",
    });
    expect(istVertretungsfreigabe(akteur(rike, true), a)).toBe(false);
  });
});

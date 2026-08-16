// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { alleQuellDateien, ohneKommentare } from "../_ui/testQuellscan";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { personen, type PersonRow, type Rolle } from "../_db/schema";
import type { Akteur } from "./zugang";

/*
 * DIE ANLEITUNG IST EIN VERSPRECHEN UEBER DIE OBERFLAECHE — und dieser Riegel ist der Grund, aus
 * dem man ihr glauben darf.
 *
 * EIN HANDBUCH ALTERT STILL. Es wird nicht rot, es wird nur unwahr, und zwar an dem Tag, an dem
 * jemand eine Tabellenzeile ergaenzt oder ein Praedikat verschiebt. Die vier Aussagen dieser
 * Datei sind deshalb genau die, die man NICHT nachlesen kann, ohne beide Seiten zu vergleichen:
 *
 *   1. Jedes Kapitel ist vollstaendig (Skizze, Schritte, Grenzen) und in sich stimmig.
 *   2. Das Lebenszyklusbild deckt sich mit `_lib/lebenszyklus.ts`s Tabelle — in BEIDE Richtungen.
 *   3. Wem ein Kapitel angeboten wird, der erreicht die beschriebene Sicht auch wirklich (die
 *      Gegenprobe zur Navigationszusage aus Spec §7, mit ECHTEN Seitenabrufen wie `nav.test.ts`).
 *   4. Jedes Kapitel haengt an seiner Sicht: `SeitenKopf hilfe="…"` steht auf jeder Seite, und
 *      jeder gesetzte Wert ist ein echter Schluessel.
 *
 * DIESELBEN DREI MOCKS WIE IN JEDEM `page.test.tsx` DES MODULS (aufgeloester Pfad, nicht
 * Spezifizierer-String) — die importierten Seiten unten laufen ueber dieselben Dateien.
 */
let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
let mockDb: TestDb;
vi.mock("../_db/client", () => ({ getDb: () => mockDb.db }));

import { UEBERGAENGE } from "./lebenszyklus";
import {
  BILD_NAMEN,
  FADEN,
  HILFE_SICHTEN,
  ROLLEN,
  SICHT_SCHLUESSEL,
  ZUSTAND_TEXT,
  ZYKLUS_KANTEN,
  einstiegsSicht,
  hilfeSichten,
  sichtFuerSchluessel,
  zielHref,
  type SichtSchluessel,
} from "./hilfe";
import { aufgabenInhalt } from "../page";
import NeuPage from "../neu/page";
import VerteilenPage from "../verteilen/page";
import FreigabenPage from "../freigaben/page";
import RoutinenPage from "../routinen/page";
import PersonenPage from "../personen/page";
import ArchivPage from "../archiv/page";
import HilfePage from "../hilfe/page";
import HilfeKapitelPage from "../hilfe/[sicht]/page";

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

function akteur(p: PersonRow, istKoordination = false): Akteur {
  return { person: p, istKoordination };
}

/** `iuk-aufgaben-koordination` ist der Registry-Vorgabewert — dieselbe Fixtur wie `nav.test.ts`. */
function anmelden(p: PersonRow, koordiniert = false): void {
  sitzung = { user: { id: p.sub, groups: koordiniert ? ["iuk-aufgaben-koordination"] : [] } };
}

/* ── 1 · JEDES KAPITEL IST VOLLSTAENDIG UND IN SICH STIMMIG ─────────────────────────────────── */

describe("HILFE_SICHTEN — jedes Kapitel traegt, was ein Kapitel braucht", () => {
  it("fuehrt genau die Schluessel aus SICHT_SCHLUESSEL, jeder Eintrag kennt seinen eigenen", () => {
    expect(Object.keys(HILFE_SICHTEN).sort()).toEqual([...SICHT_SCHLUESSEL].sort());
    for (const schluessel of SICHT_SCHLUESSEL) {
      expect(HILFE_SICHTEN[schluessel].schluessel).toBe(schluessel);
    }
  });

  for (const schluessel of SICHT_SCHLUESSEL) {
    describe(`${schluessel}`, () => {
      const sicht = HILFE_SICHTEN[schluessel];

      it("hat Titel, Rollenmarke und einen Satz zum Zweck", () => {
        expect(sicht.titel.length).toBeGreaterThan(2);
        expect(sicht.fuer.length).toBeGreaterThan(2);
        expect(sicht.wofuer.length).toBeGreaterThan(30);
      });

      /*
       * DIE SZENE IST DER EINSTIEG, UND EIN EINSTIEG MIT EINEM HALBEN SATZ IST KEINER: die
       * Untergrenze haelt fest, dass hier eine LAGE steht und nicht die Ueberschrift noch einmal.
       * Die Obergrenze ist genauso wichtig — wer drei Absaetze schreibt, hat den Abschnitt
       * „Schritt fuer Schritt" vorweggenommen, und die Szene wird ueberblaettert.
       */
      it("beginnt mit einer Szene, die die Lage beschreibt — nicht zu knapp, nicht zu lang", () => {
        expect(sicht.szene.length, `${schluessel}: Szene zu knapp`).toBeGreaterThan(120);
        expect(sicht.szene.length, `${schluessel}: Szene zu lang`).toBeLessThan(420);
        expect(sicht.szene, `${schluessel}: die Szene wiederholt nur den Titel`).not.toBe(
          sicht.wofuer,
        );
      });

      /*
       * DIE ROLLENMARKE BENUTZT DIE DREI NAMEN AUS `ROLLEN` — sonst stuenden auf den Karten des
       * Verzeichnisses drei Vokabulare nebeneinander („BuFDi", „Koordination", „Auftraggeber"),
       * und genau das nimmt die Anleitung der Leserin ab (s. Kopfkommentar von `_lib/hilfe.ts`).
       */
      it("nennt in der Rollenmarke nur Namen aus ROLLEN", () => {
        const genannt = ROLLEN.filter((r) => sicht.fuer.includes(r.name));
        expect(
          genannt.length > 0 || sicht.fuer.startsWith("alle"),
          `${schluessel}: „${sicht.fuer}" ist keiner der drei Rollennamen`,
        ).toBe(true);
      });

      /*
       * ZWEI BLOECKE SIND DIE UNTERGRENZE, UNTER DER EINE SKIZZE NICHTS MEHR ZEIGT: sie erklaert
       * die ANORDNUNG, und eine Anordnung braucht mindestens zwei Dinge, die uebereinander liegen.
       */
      it("hat eine Skizze mit mindestens zwei Bloecken, jeder mit eigener Erklaerung", () => {
        expect(sicht.skizze.length).toBeGreaterThanOrEqual(2);
        for (const block of sicht.skizze) {
          expect(block.titel.length, `${schluessel}: leerer Blocktitel`).toBeGreaterThan(2);
          expect(block.erklaerung.length, `${schluessel}/${block.titel}`).toBeGreaterThan(20);
        }
      });

      /*
       * DIE BLOCKTITEL SIND DIE REACT-`key`s DER SKIZZE (`_ui/hilfe/Skizze.tsx`) UND DIE
       * ZEILEN IHRER LEGENDE. Zwei gleiche Titel ergaeben einen doppelten Schluessel — React
       * warnt in der Konsole, rendert aber weiter, und die Legende zeigte zweimal dasselbe.
       */
      it("hat eindeutige Blocktitel, Schritt-Titel und Grenzen", () => {
        const titel = sicht.skizze.map((b) => b.titel);
        expect(new Set(titel).size, `${schluessel}: doppelter Blocktitel`).toBe(titel.length);
        const schritte = sicht.schritte.map((s) => s.titel);
        expect(new Set(schritte).size, `${schluessel}: doppelter Schritt`).toBe(schritte.length);
        expect(new Set(sicht.grenzen).size).toBe(sicht.grenzen.length);
      });

      /*
       * EINE SPALTENZEICHNUNG OHNE SPALTENNAMEN ZEICHNET NICHTS (`Spalten` in `Skizze.tsx`
       * iteriert ueber `spalten`) — der Block waere ein leerer Kasten, und kein Tor saehe es.
       */
      it("gibt jedem Spaltenblock seine Spaltenkoepfe", () => {
        for (const block of sicht.skizze) {
          if (block.form === "spalten") {
            expect(block.spalten, `${schluessel}/${block.titel}`).toBeDefined();
            expect(block.spalten!.length).toBeGreaterThan(1);
          }
        }
      });

      it("hat mindestens zwei Schritte und mindestens eine begruendete Grenze", () => {
        expect(sicht.schritte.length).toBeGreaterThanOrEqual(2);
        for (const schritt of sicht.schritte) {
          expect(schritt.text.length, `${schluessel}/${schritt.titel}`).toBeGreaterThan(40);
        }
        expect(sicht.grenzen.length).toBeGreaterThanOrEqual(1);
      });

      it("verweist nur auf existierende Kapitel und nie auf sich selbst", () => {
        for (const verweis of sicht.verweise) {
          expect(SICHT_SCHLUESSEL, `${schluessel} -> ${verweis}`).toContain(verweis);
          expect(verweis).not.toBe(schluessel);
        }
      });

      it("benennt nur Bilder, die es gibt", () => {
        for (const bild of sicht.bilder) {
          expect(BILD_NAMEN).toContain(bild);
        }
      });
    });
  }

  it("erkennt einen unbekannten Schluessel als solchen", () => {
    expect(sichtFuerSchluessel("gibt-es-nicht")).toBeNull();
    expect(sichtFuerSchluessel(undefined)).toBeNull();
    expect(sichtFuerSchluessel("freigaben")?.titel).toBe("Freigaben");
  });

  it("loest `eigenerPlan` auf die lesende Person auf, `kein` auf keine Adresse", () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    expect(zielHref(HILFE_SICHTEN.zeitplan, akteur(alina))).toBe(`/plan/${alina.id}`);
    expect(zielHref(HILFE_SICHTEN.aufgabe, akteur(alina))).toBeNull();
    expect(zielHref(HILFE_SICHTEN.archiv, akteur(alina))).toBe("/archiv");
  });
});

describe("ROLLEN und FADEN — die Erzaehlform traegt, was die Oberflaeche wirklich tut", () => {
  it("fuehrt genau drei Rollen mit eindeutigen Namen", () => {
    expect(ROLLEN).toHaveLength(3);
    expect(new Set(ROLLEN.map((r) => r.name)).size).toBe(3);
    for (const rolle of ROLLEN) {
      expect(rolle.satz.length, rolle.name).toBeGreaterThan(40);
      expect(rolle.imModul.length, rolle.name).toBeGreaterThan(20);
    }
  });

  /*
   * DIE DREI ROLLEN UND DIE DREI EINSTIEGE SIND DIESELBE MENGE, und das ist keine Redundanz,
   * sondern die Zusage: es gibt keine vierte Rolle ohne Startseite und keine Startseite ohne
   * Rolle. Ein Rollenbild, das eine Rolle nennt, die unter `/` nirgends ankommt, waere eine
   * Behauptung ueber ein Modul, das es nicht gibt.
   */
  it("gibt jeder Rolle genau einen Einstieg, und die drei Einstiege sind vergeben", () => {
    const einstiege = ROLLEN.map((r) => r.einstieg);
    expect(new Set(einstiege).size).toBe(3);
    for (const einstieg of einstiege) {
      expect(SICHT_SCHLUESSEL).toContain(einstieg);
      expect(HILFE_SICHTEN[einstieg].ziel).toEqual({ art: "fest", href: "/" });
    }
    expect([...einstiege].sort()).toEqual(["meine-auftraege", "meine-woche", "verteilung"]);
  });

  /*
   * JEDE ROLLE BEKOMMT WIRKLICH IHREN EINSTIEG: die Behauptung der Rollenkarte wird gegen
   * `einstiegsSicht` gehalten, also gegen die Verzweigung, die `page.tsx` nachbildet — und die
   * ihrerseits gegen die echte Seite geprueft wird (weiter unten in dieser Datei).
   */
  it("stimmt mit der tatsaechlichen Verzweigung ueberein", () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    const malte = legePerson("dev:malte@test", "auftrag");
    const rike = legePerson("dev:rike@test", "auftrag");
    const zuordnung: Record<string, SichtSchluessel> = {
      Auftragnehmer: einstiegsSicht(akteur(alina)),
      Auftraggeber: einstiegsSicht(akteur(malte)),
      Koordinatorin: einstiegsSicht(akteur(rike, true)),
    };
    for (const rolle of ROLLEN) {
      expect(zuordnung[rolle.name], rolle.name).toBe(rolle.einstieg);
    }
  });

  it("erzaehlt den durchgehenden Fall in mindestens vier Schritten, jeder mit Rolle und Handlung", () => {
    expect(FADEN.length).toBeGreaterThanOrEqual(4);
    for (const schritt of FADEN) {
      expect(schritt.rolle.length).toBeGreaterThan(3);
      expect(schritt.tut.length).toBeGreaterThan(30);
    }
    // Der Fall laeuft ueber alle drei Rollen — sonst waere er die Geschichte einer einzigen.
    const text = FADEN.map((f) => `${f.rolle} ${f.tut}`).join(" ");
    for (const rolle of ["Auftraggeber", "Koordinatorin", "Auftragnehmerin"]) {
      expect(text, rolle).toContain(rolle);
    }
  });
});

/* ── 2 · DAS LEBENSZYKLUSBILD DECKT SICH MIT DER UEBERGANGSTABELLE ──────────────────────────── */

describe("ZYKLUS_KANTEN gegen _lib/lebenszyklus.ts — das Bild darf nicht still unwahr werden", () => {
  const echteKanten = ZYKLUS_KANTEN.filter((k) => k.schluessel !== null);

  it("hat genau ZWEI Sonderfaelle ohne Tabellenzeile: einstellen und zurueckziehen", () => {
    const sonderfaelle = ZYKLUS_KANTEN.filter((k) => k.schluessel === null);
    expect(sonderfaelle.map((k) => k.aktion)).toEqual([
      "einstellen (für andere)",
      "einstellen (für sich selbst)",
      "zurückziehen (löscht die Aufgabe)",
    ]);
    // `einstellen` hat KEINEN Ausgangszustand, `zurueckziehen` KEINEN Zielzustand — beides ist in
    // `lebenszyklus.ts` ausgeschrieben (Entscheidung 1 bzw. `anfangsZustand`).
    for (const kante of sonderfaelle) {
      expect(kante.von === "start" || kante.nach === "geloescht").toBe(true);
    }
  });

  it("zeichnet JEDE Tabellenzeile — keine fehlt im Bild", () => {
    const gezeichnet = new Set(
      echteKanten.map((k) => `${k.von}|${k.schluessel}|${k.nach}`),
    );
    const fehlend = UEBERGAENGE.filter(
      (u) => !gezeichnet.has(`${u.von}|${u.aktion}|${u.nach}`),
    );
    expect(
      fehlend.map((u) => `${u.von} --${u.aktion}--> ${u.nach}`),
      "Diese Uebergaenge stehen in TABELLE, aber nicht im Anleitungsbild",
    ).toEqual([]);
  });

  it("erfindet KEINEN Uebergang, den die Tabelle nicht kennt", () => {
    const tabelle = new Set(UEBERGAENGE.map((u) => `${u.von}|${u.aktion}|${u.nach}`));
    const erfunden = echteKanten.filter(
      (k) => !tabelle.has(`${k.von}|${k.schluessel}|${k.nach}`),
    );
    expect(
      erfunden.map((k) => `${k.von} --${k.aktion}--> ${k.nach}`),
      "Diese Kanten stehen im Bild, aber in keiner Tabellenzeile",
    ).toEqual([]);
  });

  it("nennt jeden gezeichneten Zustand mit einem Anzeigenamen", () => {
    for (const kante of ZYKLUS_KANTEN) {
      expect(ZUSTAND_TEXT[kante.von], `${kante.von}`).toBeTruthy();
      expect(ZUSTAND_TEXT[kante.nach], `${kante.nach}`).toBeTruthy();
      expect(kante.wer.length).toBeGreaterThan(3);
    }
  });
});

/* ── 3 · WEM WELCHES KAPITEL ANGEBOTEN WIRD — UND OB ER DIE SICHT ERREICHT ──────────────────── */

const ROUTEN: Record<string, () => Promise<unknown>> = {
  "/neu": () => NeuPage(),
  "/verteilen": () => VerteilenPage({ searchParams: Promise.resolve({}) }),
  "/freigaben": () => FreigabenPage(),
  "/routinen": () => RoutinenPage({ searchParams: Promise.resolve({}) }),
  "/personen": () => PersonenPage({ searchParams: Promise.resolve({}) }),
  "/archiv": () => ArchivPage({ searchParams: Promise.resolve({}) }),
};

describe("hilfeSichten — je Person genau die Kapitel ihrer Sichten", () => {
  it("koordination: Verteilung, Einstellen, Verteilen, Freigaben, Personen, Zeitplan, Aufgabe, Archiv", () => {
    const rike = legePerson("dev:rike@test", "auftrag");
    expect(hilfeSichten(akteur(rike, true), HEUTE).map((s) => s.schluessel)).toEqual([
      "verteilung",
      "einstellen",
      "verteilen",
      "freigaben",
      "personen",
      "zeitplan",
      "aufgabe",
      "archiv",
    ]);
  });

  it("bufdi: Meine Woche, Einstellen, Routinen, Zeitplan, Aufgabe, Archiv — kein Verteilen, keine Freigaben", () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    expect(hilfeSichten(akteur(alina), HEUTE).map((s) => s.schluessel)).toEqual([
      "meine-woche",
      "einstellen",
      "routinen",
      "zeitplan",
      "aufgabe",
      "archiv",
    ]);
  });

  it("auftrag: Meine Auftraege, Einstellen, Freigaben, Zeitplan, Aufgabe, Archiv", () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    expect(hilfeSichten(akteur(malte), HEUTE).map((s) => s.schluessel)).toEqual([
      "meine-auftraege",
      "einstellen",
      "freigaben",
      "zeitplan",
      "aufgabe",
      "archiv",
    ]);
  });

  /*
   * DIE PERSON, DIE ES ERST SEIT DEM QUELLENWECHSEL (2026-08-15) GIBT: eine `bufdi`-ZEILE mit
   * Koordinationsgruppe. Sie ist der Fall, an dem sich die Sichtbarkeit NICHT aus der Rolle allein
   * ableiten laesst — `routinen` kommt aus der Zeile, alles andere aus der Gruppe.
   */
  it("bufdi MIT Koordinationsgruppe bekommt den Koordinationseinstieg UND das Routinenkapitel", () => {
    const alina = legePerson("dev:alina-koord@test", "bufdi");
    const schluessel = hilfeSichten(akteur(alina, true), HEUTE).map((s) => s.schluessel);
    expect(schluessel).toContain("verteilung");
    expect(schluessel).not.toContain("meine-woche");
    expect(schluessel).toContain("routinen");
  });

  it("bietet jeder Person genau EINEN Einstieg an", () => {
    const einstiege: SichtSchluessel[] = ["meine-woche", "verteilung", "meine-auftraege"];
    const faelle: [PersonRow, boolean][] = [
      [legePerson("dev:a@test", "bufdi"), false],
      [legePerson("dev:b@test", "auftrag"), false],
      [legePerson("dev:c@test", "auftrag"), true],
      [legePerson("dev:d@test", "bufdi"), true],
    ];
    for (const [person, koordiniert] of faelle) {
      const gefunden = hilfeSichten(akteur(person, koordiniert), HEUTE)
        .map((s) => s.schluessel)
        .filter((s) => einstiege.includes(s));
      expect(gefunden, `${person.sub}`).toHaveLength(1);
      expect(gefunden[0]).toBe(einstiegsSicht(akteur(person, koordiniert)));
    }
  });
});

describe("DIE KERNZUSAGE: wem ein Kapitel angeboten wird, der erreicht die Sicht auch", () => {
  const PERSONEN: { bezeichnung: string; rolle: Rolle; koordiniert: boolean; sub: string }[] = [
    { bezeichnung: "koordination", rolle: "auftrag", koordiniert: true, sub: "dev:rike@test" },
    { bezeichnung: "auftrag", rolle: "auftrag", koordiniert: false, sub: "dev:malte@test" },
    { bezeichnung: "bufdi", rolle: "bufdi", koordiniert: false, sub: "dev:alina@test" },
    { bezeichnung: "bufdi+koordination", rolle: "bufdi", koordiniert: true, sub: "dev:ak@test" },
  ];

  for (const { bezeichnung, rolle, koordiniert, sub } of PERSONEN) {
    it(`${bezeichnung}: jede angebotene Sicht antwortet — kein notFound()`, async () => {
      const person = legePerson(sub, rolle);
      anmelden(person, koordiniert);
      const sichten = hilfeSichten(akteur(person, koordiniert), HEUTE);
      expect(sichten.length).toBeGreaterThan(3);
      for (const sicht of sichten) {
        if (sicht.ziel.art !== "fest" || sicht.ziel.href === "/") continue;
        const route = ROUTEN[sicht.ziel.href];
        if (!route) throw new Error(`Keine Test-Route fuer "${sicht.ziel.href}" hinterlegt.`);
        await expect(
          route(),
          `Kapitel "${sicht.schluessel}" (${sicht.ziel.href}) fuer "${bezeichnung}"`,
        ).resolves.toBeTruthy();
      }
    });
  }

  /*
   * DIE GEGENPROBE, DIE DEN LAUF DARUEBER ERST SCHARF MACHT (Muster `nav.test.ts`): ohne sie
   * bliebe er auch dann gruen, wenn KEINE Route je ablehnte.
   */
  it("die Kapitel, die eine BuFDi NICHT bekommt, gehoeren zu Routen, die sie wirklich abweisen", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    anmelden(alina);
    const angeboten = hilfeSichten(akteur(alina), HEUTE).map((s) => s.schluessel);
    expect(angeboten).not.toContain("verteilen");
    expect(angeboten).not.toContain("freigaben");
    expect(angeboten).not.toContain("personen");
    await expect(VerteilenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(FreigabenPage()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(PersonenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  /*
   * DIE ANLEITUNGSSEITEN SELBST GATEN NICHT (s. `hilfe/[sicht]/page.tsx`) — das ist eine
   * Entscheidung und steht deshalb als Fall da, nicht als Nebenwirkung: eine BuFDi darf
   * NACHLESEN, was mit ihrer fertig gemeldeten Aufgabe passiert, auch wenn die Freigabeflaeche
   * ihr 404 antwortet. Was sie NICHT bekommt, ist der Weg dorthin (Test darueber).
   */
  it("ein Kapitel ist lesbar, auch wo die beschriebene Sicht 404 antwortet", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    anmelden(alina);
    await expect(
      HilfeKapitelPage({ params: Promise.resolve({ sicht: "freigaben" }) }),
    ).resolves.toBeTruthy();
    await expect(
      HilfeKapitelPage({ params: Promise.resolve({ sicht: "gibt-es-nicht" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("/hilfe antwortet jeder Rolle", async () => {
    for (const { rolle, koordiniert, sub } of PERSONEN) {
      const t2 = migrierteTestDb();
      mockDb = t2;
      const person = t2.db
        .insert(personen)
        .values({ sub, name: sub, initialen: "XX", rolle, aktivVon: "2026-01-01" })
        .returning()
        .get();
      anmelden(person, koordiniert);
      await expect(HilfePage()).resolves.toBeTruthy();
      t2.schliessen();
    }
  });
});

/* ── 4 · DIE VERZWEIGUNG DES EINSTIEGS UND DIE VERDRAHTUNG IN DER OBERFLAECHE ───────────────── */

describe("einstiegsSicht gegen die echte Verzweigung in page.tsx", () => {
  /*
   * `aufgabenInhalt` LIEFERT JSX UND KEIN KENNZEICHEN — es gibt nichts, was man vergleichen
   * koennte, ohne die Seite zu rendern. Genau das tut dieser Test: er rendert und liest die `<h1>`.
   * Laeuft die zweite Verzweigung in `_lib/hilfe.ts` je von der ersten weg, faellt er hier — nicht
   * im Betrieb, wo das Kapitel dann eine andere Sicht beschriebe als die, auf der man steht.
   */
  const FAELLE: { rolle: Rolle; koordiniert: boolean; sub: string }[] = [
    { rolle: "bufdi", koordiniert: false, sub: "dev:alina@test" },
    { rolle: "auftrag", koordiniert: false, sub: "dev:malte@test" },
    { rolle: "auftrag", koordiniert: true, sub: "dev:rike@test" },
    { rolle: "bufdi", koordiniert: true, sub: "dev:ak@test" },
  ];

  for (const fall of FAELLE) {
    it(`${fall.rolle}${fall.koordiniert ? " + Koordination" : ""}: die <h1> heisst wie das Kapitel`, async () => {
      const person = legePerson(fall.sub, fall.rolle);
      const wer = akteur(person, fall.koordiniert);
      await mount(aufgabenInhalt(t.db, wer, HEUTE, {}));
      expect(query("h1").textContent).toBe(HILFE_SICHTEN[einstiegsSicht(wer)].titel);
    });
  }
});

describe("Die Verdrahtung: jede Sicht verweist auf ihr Kapitel", () => {
  const WURZEL = "src/app/m/aufgaben";
  const dateien = alleQuellDateien(WURZEL);
  const gesetzte = dateien.flatMap((datei) => {
    const quelle = ohneKommentare(readFileSync(datei, "utf8"));
    return [...quelle.matchAll(/hilfe="([^"]+)"/g)].map((m) => ({ datei, wert: m[1] }));
  });

  it("findet ueberhaupt gesetzte Verweise (sonst prueft der Scan nichts)", () => {
    expect(gesetzte.length).toBeGreaterThan(5);
  });

  it("setzt nur echte Schluessel", () => {
    const unbekannt = gesetzte.filter(
      (g) => !(SICHT_SCHLUESSEL as readonly string[]).includes(g.wert),
    );
    expect(unbekannt.map((g) => `${g.datei} -> hilfe="${g.wert}"`)).toEqual([]);
  });

  /*
   * DIE EIGENTLICHE ZUSAGE DIESES ABSCHNITTS: ein Kapitel ohne Verweis auf seiner Sicht ist ein
   * Text, den nur findet, wer das Inhaltsverzeichnis durchsieht — und die Frage entsteht auf der
   * Flaeche, nicht im Verzeichnis. Umgekehrt gilt: schreibt jemand ein Kapitel und haengt es
   * nirgends ein, faellt dieser Test, nicht erst die Rueckfrage im Betrieb.
   */
  it("haengt JEDES Kapitel an mindestens einer Sicht ein", () => {
    const eingehaengt = new Set(gesetzte.map((g) => g.wert));
    const ohne = SICHT_SCHLUESSEL.filter((k) => !eingehaengt.has(k));
    expect(ohne, "Diese Kapitel haengen an keiner Sicht").toEqual([]);
  });
});

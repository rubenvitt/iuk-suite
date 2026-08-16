/**
 * Aufgabe 18 — die modul-eigene Scan-Warteschlange (Spec §2, §5.3, §6, §7).
 *
 * DIE ABSOLUTE ZUSAGE VON `core/av/scanner.scanne` GILT AUCH HIER: settelt
 * immer, genau einmal, wirft nie asynchron. Diese Suite lässt deshalb einen
 * ECHTEN `net.createServer` sprechen — dieselbe Begründung wie
 * `core/av/scanner.test.ts`: ein Stub kann den tödlichen Pfad (Wurf AUSSERHALB
 * der synchronen Promise-Ausführung) nicht herstellen, ein Socket schon.
 *
 * Vier Aussagen stehen im Zentrum, und jede hat eine benannte Gegenprobe
 * (siehe Bericht):
 * - nur `scanStatus = "offen"` wird vom Arbeiter angefasst;
 * - `sauber`/`befund`/`fehler` sind PAARWEISE verschieden — keine Umformung
 *   von `istFreigegeben` bleibt unbemerkt, wenn alle vier Werte einzeln
 *   geprüft werden;
 * - ein Scan-Fehler (Server unerreichbar) landet als `fehler`, NICHT als
 *   `sauber` — das ist die Zeile, die ein `catch`, das Fehler verschluckt,
 *   sofort verraten würde;
 * - die Konfiguration kommt von AUSSEN: zwei verschiedene, unerreichbare Ports
 *   erzeugen zwei verschiedene `grund`-Texte, nicht denselben.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import net from "node:net";
import { nanoid } from "nanoid";

import type { AvKonfig } from "@/core/av/scanner";

import type { TestDb } from "../_db/testdb";
import { migrierteTestDb } from "../_db/testdb";
import { aufgaben, dateien, personen, type PersonRow, type ScanStatus } from "../_db/schema";

import { avKonfigAusEnv, bearbeiteOffeneDateien, istFreigegeben } from "./scan";
import { nachweisPfad } from "./ablage";

// ---------------------------------------------------------------------------
// Ein echter clamd-Sprecher — Vorbild `core/av/scanner.test.ts`.
// ---------------------------------------------------------------------------

interface Lauscher {
  readonly port: number;
  /**
   * Fix Runde 1 (Review), Important 2/Minor 3: eine reine ANZAHL maskiert
   * hinter dem `WHERE scan_status = 'offen'`-Vorbehalt beim Schreiben — ein
   * Arbeiter, der versehentlich ALLE Zeilen selektiert, hinterließe wegen des
   * Vorbehalts trotzdem einen unveränderten DB-Zustand, und nur die ANZAHL der
   * beim Server angekommenen Befehle würde den Fehler zeigen. Der vollständige
   * BEFEHL macht die Prüfung zusätzlich UNABHÄNGIG vom Vorbehalt: er beweist
   * nicht nur "wie viele", sondern "welcher Pfad" — die Naht zwischen
   * `ablage.ts` (`nachweisPfad`) und `scan.ts`.
   */
  befehle(): string[];
  stoppe(): Promise<void>;
}

type Reaktion = (befehl: string) => string;

async function lausche(reagiere: Reaktion): Promise<Lauscher> {
  const empfangen: string[] = [];
  const server = net.createServer((verbindung) => {
    let puffer = "";
    verbindung.on("data", (stueck) => {
      puffer += stueck.toString("utf8");
      const ende = puffer.indexOf("\0");
      if (ende < 0) return;
      const befehl = puffer.slice(0, ende);
      puffer = puffer.slice(ende + 1);
      empfangen.push(befehl);
      verbindung.end(`${reagiere(befehl)}\0`);
    });
    verbindung.on("error", () => {});
  });
  await new Promise<void>((fertig) => server.listen(0, "127.0.0.1", fertig));
  const adresse = server.address() as net.AddressInfo;
  return {
    port: adresse.port,
    befehle: () => [...empfangen],
    stoppe: () => new Promise<void>((fertig) => server.close(() => fertig())),
  };
}

/** Ein Port, auf dem sicher niemand lauscht — der ECONNREFUSED-Ausgang. */
async function freierPort(): Promise<number> {
  const leer = await lausche(() => "");
  const port = leer.port;
  await leer.stoppe();
  return port;
}

/**
 * Mehrere freie Ports auf einmal — und der Plural ist der ganze Punkt.
 *
 * `freierPort()` GIBT SEINEN PORT FREI, BEVOR ES IHN ZURUECKGIBT. Zweimal
 * nacheinander gerufen darf das Betriebssystem deshalb zweimal dieselbe Nummer
 * aus dem ephemeren Bereich vergeben — nichts verbietet es, und genau das
 * passierte am 16.08.2026 in der CI: `expected 45031 not to be 45031`. Die
 * Zusicherung `portA !== portB` sicherte damit eine Eigenschaft zu, die keine
 * Stelle herstellte; der Test war latent zufallsabhaengig, nicht der Ausfall.
 *
 * Hier lauschen erst ALLE gleichzeitig — solange sie offen sind, kann das
 * Betriebssystem keine Nummer zweimal vergeben, die Ports sind also paarweise
 * verschieden — und werden erst danach geschlossen. Nach der Rueckgabe ist
 * wieder keiner belegt, der ECONNREFUSED-Ausgang bleibt also unveraendert.
 */
async function freiePorts(anzahl: number): Promise<number[]> {
  const lauscher = await Promise.all(
    Array.from({ length: anzahl }, () => lausche(() => "")),
  );
  const ports = lauscher.map((l) => l.port);
  await Promise.all(lauscher.map((l) => l.stoppe()));
  return ports;
}

function pfadAusBefehl(befehl: string): string {
  // Transport ist `zSCAN <pfad>` (core/av/scanner.ts).
  return befehl.replace(/^zSCAN /, "");
}

function konfigFuer(port: number, timeoutMs = 2000): AvKonfig {
  return { host: "127.0.0.1", port, timeoutMs };
}

// ---------------------------------------------------------------------------
// Testdaten — dieselbe Bauform wie `_db/queries.test.ts`.
// ---------------------------------------------------------------------------

let t: TestDb;
beforeEach(() => {
  t = migrierteTestDb();
});
afterEach(() => t.schliessen());

function legePerson(sub: string): PersonRow {
  return t.db
    .insert(personen)
    .values({ sub, name: sub, initialen: "XX", rolle: "bufdi", aktivVon: "2026-01-01" })
    .returning()
    .get();
}

function legeAufgabeFuer(erstellerId: string): string {
  return t.db
    .insert(aufgaben)
    .values({
      titel: "T",
      beschreibung: "B",
      prioritaet: "mittel",
      erstellerId,
      status: "eingegangen",
      faelligAm: "2026-08-20",
      dauerMinuten: 60,
    })
    .returning({ id: aufgaben.id })
    .get().id;
}

/** Eine `dateien`-Zeile mit gegebenem `scanStatus`, angebunden an eine frische Aufgabe. */
function legeDatei(aufgabeId: string, scanStatus: ScanStatus): { id: string } {
  return t.db
    .insert(dateien)
    .values({ id: nanoid(), aufgabeId, dateiname: "nachweis.jpg", mime: "image/jpeg", groesse: 1024, scanStatus })
    .returning({ id: dateien.id })
    .get();
}

/**
 * Fix Runde 1 (Review), Important 1: simuliert ein DAUERHAFT scheiterndes
 * Schreiben (z. B. `SQLITE_FULL`/`SQLITE_READONLY`) — genau der Fall, der ohne
 * den Fortschrittsvorbehalt in `fuehreDurchlaufAus` eine Endlosschleife wäre.
 * `select` bleibt unangetastet (echte Datenbank), nur `update(...).set(...)
 * .where(...).run()` wirft — dieselbe Kette, die `scan.ts` tatsächlich ruft.
 */
function dbMitFehlschlagendemUpdate(basis: TestDb["db"]): TestDb["db"] {
  return new Proxy(basis, {
    get(target, prop, receiver) {
      if (prop === "update") {
        return () => ({
          set: () => ({
            where: () => ({
              run: () => {
                throw Object.assign(new Error("simulierter Schreibfehler (SQLITE_FULL)"), {
                  code: "SQLITE_FULL",
                });
              },
            }),
          }),
        });
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as TestDb["db"];
}

describe("istFreigegeben — nur 'sauber' liefert aus, alle vier Werte einzeln geprüft", () => {
  it.each([
    ["offen", false],
    ["sauber", true],
    ["befund", false],
    ["fehler", false],
  ] satisfies [ScanStatus, boolean][])("scanStatus=%s -> %s", (status, erwartet) => {
    expect(istFreigegeben(status)).toBe(erwartet);
  });
});

describe("bearbeiteOffeneDateien — nimmt nur 'offen'e Dateien, lässt die übrigen in Ruhe", () => {
  it("scannt genau die offene Zeile und lässt sauber/befund/fehler unverändert", async () => {
    const person = legePerson("dev:a@b");
    const aufgabeId = legeAufgabeFuer(person.id);

    const offen = legeDatei(aufgabeId, "offen");
    const bereitsSauber = legeDatei(aufgabeId, "sauber");
    const bereitsBefund = legeDatei(aufgabeId, "befund");
    const bereitsFehler = legeDatei(aufgabeId, "fehler");

    const server = await lausche((befehl) => `${pfadAusBefehl(befehl)}: OK`);
    try {
      const befunde = await bearbeiteOffeneDateien(t.db, konfigFuer(server.port));

      expect(befunde).toEqual([{ id: offen.id, status: "sauber", grund: undefined }]);
      // GENAU EIN Befehl beim Server, UND fuer GENAU den Pfad der offenen
      // Zeile — die drei anderen Zeilen wurden nicht einmal angefragt, nicht
      // nur "nicht geschrieben" (der `WHERE scan_status = 'offen'`-Vorbehalt
      // beim Schreiben wuerde einen Fehler hier sonst maskieren, siehe
      // Kommentar an `Lauscher.befehle`).
      expect(server.befehle()).toEqual([`zSCAN ${nachweisPfad(offen.id)}`]);

      const alle = t.db.select().from(dateien).all();
      const nachId = new Map(alle.map((z) => [z.id, z]));
      expect(nachId.get(offen.id)?.scanStatus).toBe("sauber");
      expect(nachId.get(offen.id)?.scanGeprueftAm).not.toBeNull();
      expect(nachId.get(bereitsSauber.id)?.scanStatus).toBe("sauber");
      expect(nachId.get(bereitsBefund.id)?.scanStatus).toBe("befund");
      expect(nachId.get(bereitsFehler.id)?.scanStatus).toBe("fehler");
    } finally {
      await server.stoppe();
    }
  });

  it("ein Durchlauf ohne offene Dateien meldet keine Befunde und fragt den Scanner nicht an", async () => {
    const person = legePerson("dev:a@b");
    const aufgabeId = legeAufgabeFuer(person.id);
    legeDatei(aufgabeId, "sauber");

    const server = await lausche(() => "sollte nie aufgerufen werden: OK");
    try {
      const befunde = await bearbeiteOffeneDateien(t.db, konfigFuer(server.port));
      expect(befunde).toEqual([]);
      expect(server.befehle()).toEqual([]);
    } finally {
      await server.stoppe();
    }
  });
});

describe("ein dauerhaft scheiterndes Schreiben beendet den Durchlauf, statt endlos zu drehen", () => {
  /*
   * Fix Runde 1, Important 1 — die Gegenprobe, die der Reviewer verlangt hat:
   * OHNE den Fortschrittsvorbehalt in `fuehreDurchlaufAus` würde dieselbe
   * Zeile (weiterhin `offen`, weil das Schreiben nie gelingt) bei jeder
   * Iteration der äußeren Schleife erneut selektiert und erneut gescannt —
   * unbegrenzt. Der Beweis ist die Anzahl der beim Server angekommenen
   * Befehle: GENAU EINER, nicht mehr.
   */
  it("scannt genau einmal, bricht dann laut ab, und die Zeile bleibt 'offen'", async () => {
    const person = legePerson("dev:a@b");
    const aufgabeId = legeAufgabeFuer(person.id);
    legeDatei(aufgabeId, "offen");

    const konsoleFehler = vi.spyOn(console, "error").mockImplementation(() => {});
    const server = await lausche((befehl) => `${pfadAusBefehl(befehl)}: OK`);
    try {
      const kaputteDb = dbMitFehlschlagendemUpdate(t.db);
      const befunde = await bearbeiteOffeneDateien(kaputteDb, konfigFuer(server.port));

      // Kein Befund — kein Schreiben ist je gelungen.
      expect(befunde).toEqual([]);
      // GENAU EIN Scan-Versuch. Wäre die Schleife nicht durch den
      // Fortschrittsvorbehalt begrenzt, stünde hier eine beliebig hohe Zahl —
      // dieser Test würde nie fertig, statt rot zu werden.
      expect(server.befehle().length).toBe(1);
      // Der Abbruch ist LAUT, nicht still.
      expect(konsoleFehler).toHaveBeenCalledWith(expect.stringContaining("Durchlauf abgebrochen"));

      const zeile = t.db.select().from(dateien).all()[0];
      expect(zeile.scanStatus).toBe("offen");
    } finally {
      await server.stoppe();
      konsoleFehler.mockRestore();
    }
  });
});

describe("ein Fund landet als 'befund'", () => {
  it("schreibt die Signatur als Grund", async () => {
    const person = legePerson("dev:a@b");
    const aufgabeId = legeAufgabeFuer(person.id);
    const datei = legeDatei(aufgabeId, "offen");

    const server = await lausche((befehl) => `${pfadAusBefehl(befehl)}: Eicar-Test-Signature FOUND`);
    try {
      const [befund] = await bearbeiteOffeneDateien(t.db, konfigFuer(server.port));
      expect(befund).toEqual({ id: datei.id, status: "befund", grund: "Eicar-Test-Signature" });

      const zeile = t.db.select().from(dateien).all().find((z) => z.id === datei.id);
      expect(zeile?.scanStatus).toBe("befund");
    } finally {
      await server.stoppe();
    }
  });
});

describe("ein Scanfehler landet als 'fehler', nicht als 'sauber' — und die Datei bleibt gesperrt", () => {
  it("ECONNREFUSED schreibt 'fehler', kein 'catch' verwandelt es in 'sauber'", async () => {
    const person = legePerson("dev:a@b");
    const aufgabeId = legeAufgabeFuer(person.id);
    const datei = legeDatei(aufgabeId, "offen");

    const port = await freierPort();
    const [befund] = await bearbeiteOffeneDateien(t.db, konfigFuer(port));

    expect(befund?.status).toBe("fehler");
    expect(befund?.grund).toMatch(/ECONNREFUSED/);

    const zeile = t.db.select().from(dateien).all().find((z) => z.id === datei.id);
    expect(zeile?.scanStatus).toBe("fehler");
    expect(zeile ? istFreigegeben(zeile.scanStatus) : true).toBe(false);
  });
});

describe("Konfiguration kommt von außen — zwei verschiedene Konfigurationen ergeben zwei verschiedene Ergebnisse", () => {
  it("zwei unerreichbare Ports erzeugen zwei verschiedene Fehlergründe", async () => {
    const person = legePerson("dev:a@b");
    const aufgabeId = legeAufgabeFuer(person.id);

    // Beide Nummern in EINEM Zug, sonst duerfen sie gleich sein — Begruendung
    // steht an `freiePorts`.
    const [portA, portB] = await freiePorts(2);

    const dateiA = legeDatei(aufgabeId, "offen");
    const [befundA] = await bearbeiteOffeneDateien(t.db, konfigFuer(portA));

    const dateiB = legeDatei(aufgabeId, "offen");
    const [befundB] = await bearbeiteOffeneDateien(t.db, konfigFuer(portB));

    expect(portA).not.toBe(portB);
    expect(befundA?.id).toBe(dateiA.id);
    expect(befundB?.id).toBe(dateiB.id);
    expect(befundA?.grund).toContain(String(portA));
    expect(befundB?.grund).toContain(String(portB));
    expect(befundA?.grund).not.toBe(befundB?.grund);
  });
});

describe("avKonfigAusEnv — die Zahlen kommen aus den eigenen AUFGABEN_AV_*-Variablen", () => {
  it("liefert die dokumentierten Vorgaben ohne gesetzte Umgebung", () => {
    expect(avKonfigAusEnv({})).toEqual({ host: "clamav", port: 3310, timeoutMs: 60_000 });
  });

  it("übernimmt gesetzte Werte", () => {
    expect(
      avKonfigAusEnv({
        AUFGABEN_AV_HOST: "clamav-test",
        AUFGABEN_AV_PORT: "4000",
        AUFGABEN_AV_TIMEOUT_MS: "5000",
      }),
    ).toEqual({ host: "clamav-test", port: 4000, timeoutMs: 5000 });
  });

  it("fällt bei einer ungültigen Zahl auf die Vorgabe zurück, statt NaN durchzureichen", () => {
    expect(avKonfigAusEnv({ AUFGABEN_AV_PORT: "nicht-numerisch" }).port).toBe(3310);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Faelligkeit } from "@/core/faelligkeiten";
import type { FaelligkeitenAbo } from "@/app/m/portal/_db/schema";
import { artSchluessel, auswahlOptionen, bereinigeAuswahl, fuerPerson } from "./auswahl";
import {
  _warnsperreZuruecksetzen, aboFuer, FAELLIG_INTERN_ENV, FAELLIG_PRAEFIX_ENV, FAELLIG_SERVER_ENV, FAELLIG_TOKEN_ENV,
  neuesThema, sendeZielFuer, STANDARD_PRAEFIX, versand, ZUFALL_LAENGE,
} from "./konfiguration";
import { personenGruppen } from "./personenGruppen";
import { baueNachricht, ZEILEN_JE_MODUL } from "./nachricht";
import type { FaelligkeitsQuelle } from "./quellen";
import { sammle, sichtbareQuellen, zaehle, type FaelligkeitsGruppe } from "./sammeln";
import { sendeAnNtfy } from "./senden";
import { _meldesperreZuruecksetzen, nachrichtFuerPerson, sendefenster, wochenschritt, type SchrittAbhaengigkeiten } from "./takt";

/* Ausgedachtes Thema und Token — die echten stehen nur in der Server-`.env`. */
const THEMA = "beispiel-faellig_42";
const TOKEN = "tk_beispielbeispielbeispielbeis";
const ZONE = "Europe/Berlin";

function f(teil: Partial<Faelligkeit> & { id: string }): Faelligkeit {
  return {
    art: "Verfall", titel: teil.id, wo: null, zustand: "abgelaufen", dringlichkeit: "ueberfaellig",
    sortierung: "", pfad: "/verwaltung/verfall", ...teil,
  };
}

function gruppe(teil: Partial<FaelligkeitsGruppe>): FaelligkeitsGruppe {
  return { modul: "lagerbuch", titel: "Lagerbuch", basisUrl: "https://lager.example", eintraege: [], fehler: false, ...teil };
}

describe("Konfiguration", () => {
  beforeEach(() => _warnsperreZuruecksetzen());
  const SERVER = "https://ntfy.example.org";

  it("ist ohne Server aus, und zwar still", () => {
    const warnen = vi.fn();
    expect(versand({ [FAELLIG_TOKEN_ENV]: TOKEN }, warnen)).toBeNull();
    expect(warnen).not.toHaveBeenCalled();
  });

  it("ohne Token aus — und warnt, ohne Werte zu nennen", () => {
    const warnen = vi.fn();
    expect(versand({ [FAELLIG_SERVER_ENV]: SERVER }, warnen)).toBeNull();
    expect(warnen).toHaveBeenCalledTimes(1);
    expect(String(warnen.mock.calls[0][0])).not.toContain("example");
  });

  it("nimmt nur eine Server-Wurzel, kein Thema in der Adresse", () => {
    const warnen = vi.fn();
    expect(versand({ [FAELLIG_SERVER_ENV]: `${SERVER}/${THEMA}`, [FAELLIG_TOKEN_ENV]: TOKEN }, warnen)).toBeNull();
    expect(warnen).toHaveBeenCalledTimes(1);
  });

  it("sendet an den öffentlichen Server oder an die interne Adresse", () => {
    const env = { [FAELLIG_SERVER_ENV]: `${SERVER}/`, [FAELLIG_TOKEN_ENV]: ` ${TOKEN} ` };
    expect(versand(env)).toEqual({ serverUrl: SERVER, basis: SERVER, token: TOKEN, praefix: STANDARD_PRAEFIX });
    const v = versand({ ...env, [FAELLIG_INTERN_ENV]: "http://ntfy/" })!;
    expect(sendeZielFuer(v, THEMA)).toEqual({ basis: "http://ntfy", thema: THEMA, token: TOKEN });
  });

  it("eine kaputte interne Adresse fällt auf den öffentlichen Server zurück, ein kaputtes Präfix auf den Standard", () => {
    const warnen = vi.fn();
    const v = versand({ [FAELLIG_SERVER_ENV]: SERVER, [FAELLIG_TOKEN_ENV]: TOKEN, [FAELLIG_INTERN_ENV]: "javascript:alert(1)" }, warnen);
    expect(v?.basis).toBe(SERVER);
    _warnsperreZuruecksetzen();
    expect(versand({ [FAELLIG_SERVER_ENV]: SERVER, [FAELLIG_TOKEN_ENV]: TOKEN, [FAELLIG_PRAEFIX_ENV]: "mit leerzeichen" }, warnen)?.praefix).toBe(STANDARD_PRAEFIX);
    expect(versand({ [FAELLIG_SERVER_ENV]: SERVER, [FAELLIG_TOKEN_ENV]: TOKEN, [FAELLIG_PRAEFIX_ENV]: "drk-" })?.praefix).toBe("drk-");
    expect(warnen).toHaveBeenCalledTimes(2);
  });

  it("schickt das Token nie an einen fremden Host, auch nicht als „interne“ Adresse", () => {
    const warnen = vi.fn();
    const env = { [FAELLIG_SERVER_ENV]: SERVER, [FAELLIG_TOKEN_ENV]: TOKEN };
    expect(versand({ ...env, [FAELLIG_INTERN_ENV]: "https://ntfy.fremd.example" }, warnen)?.basis).toBe(SERVER);
    expect(warnen).toHaveBeenCalledTimes(1);
    expect(versand({ ...env, [FAELLIG_INTERN_ENV]: "http://127.0.0.1:3399" })?.basis).toBe("http://127.0.0.1:3399");
    expect(versand({ ...env, [FAELLIG_INTERN_ENV]: "http://ntfy-intern" })?.basis).toBe("http://ntfy-intern");
  });

  it("das Abo einer Person: App-Link auf ihr Thema", () => {
    const v = versand({ [FAELLIG_SERVER_ENV]: SERVER, [FAELLIG_TOKEN_ENV]: TOKEN })!;
    expect(aboFuer(v, THEMA)?.appLink).toBe(`ntfy://ntfy.example.org/${THEMA}?display=I%26K%20Was%20steht%20an`);
  });
});

describe("neuesThema", () => {
  it("Präfix plus 20 Zeichen a–z0–9, gültig für ntfy, und jedes Mal anders", () => {
    const a = neuesThema("iuk-faellig-");
    expect(a).toMatch(new RegExp(`^iuk-faellig-[a-z0-9]{${ZUFALL_LAENGE}}$`));
    expect(a.length).toBeLessThanOrEqual(64);
    expect(neuesThema("iuk-faellig-")).not.toBe(a);
  });

  it("verwirft Bytes ab 252, damit kein Zeichen öfter vorkommt", () => {
    let runde = 0;
    const zufall = (n: number) => new Uint8Array(n).fill(runde++ === 0 ? 255 : 37);
    expect(neuesThema("x-", zufall)).toBe(`x-${"b".repeat(ZUFALL_LAENGE)}`);
  });
});

describe("sammeln", () => {
  const lager: FaelligkeitsQuelle = {
    modul: "lagerbuch", titel: "Lagerbuch", arten: ["Verfall"], darfSehen: (g) => !!g?.includes("lager"),
    lesen: () => [f({ id: "b", dringlichkeit: "bald" }), f({ id: "a" })],
  };
  const kaputt: FaelligkeitsQuelle = {
    modul: "radio", titel: "Funkgeräte", arten: ["Ausleihe"], darfSehen: (g) => !!g?.includes("funk"),
    lesen: () => { throw new Error("database is locked"); },
  };

  it("filtert nach dem Prädikat der Quelle", () => {
    expect(sichtbareQuellen(["lager"], [lager, kaputt]).map((q) => q.modul)).toEqual(["lagerbuch"]);
    expect(sichtbareQuellen(null, [lager, kaputt])).toEqual([]);
  });

  it("sortiert überfällig zuerst, und eine kaputte Quelle reißt die anderen nicht mit", () => {
    const melden = vi.fn();
    const gruppen = sammle([lager, kaputt], new Date(), (m) => `https://${m}.example`, melden);
    expect(gruppen[0].eintraege.map((e) => e.id)).toEqual(["a", "b"]);
    expect(gruppen[1]).toMatchObject({ modul: "radio", fehler: true, eintraege: [], basisUrl: "https://radio.example" });
    expect(melden).toHaveBeenCalledTimes(1);
    expect(zaehle(gruppen)).toEqual({ ueberfaellig: 1, bald: 1 });
  });
});

describe("baueNachricht", () => {
  it("nichts fällig, nichts ausgefallen: keine Nachricht", () => {
    expect(baueNachricht([gruppe({})], null)).toBeNull();
  });

  it("Titel mit Zahlen, je Modul ein Block, hohe Priorität bei Überfälligem, Link auf die Seite", () => {
    const n = baueNachricht([
      gruppe({ eintraege: [f({ id: "x", titel: "NaCl", wo: "RTW 1" })] }),
      gruppe({ modul: "radio", titel: "Funkgeräte", eintraege: [f({ id: "y", art: "Ausleihe", titel: "Funkgerät 1", zustand: "seit 1 Tag ausgeliehen", dringlichkeit: "bald", person: "Anna Beispiel" })] }),
    ], "https://portal.example/faelligkeiten")!;
    expect(n.title).toBe("Was steht an: 1 überfällig, 1 bald fällig");
    expect(n.message).toBe("Lagerbuch\n• Verfall: NaCl (RTW 1) — abgelaufen\n\nFunkgeräte\n• Ausleihe: Funkgerät 1 — seit 1 Tag ausgeliehen");
    expect(n.priority).toBe(4);
    expect(n.click).toBe("https://portal.example/faelligkeiten");
  });

  it("nennt nie eine Person", () => {
    const n = baueNachricht([gruppe({ eintraege: [f({ id: "y", person: "Anna Beispiel", dringlichkeit: "bald" })] })], null)!;
    expect(JSON.stringify(n)).not.toContain("Anna");
    expect(n.priority).toBe(3);
    expect(n).not.toHaveProperty("click");
  });

  it("kürzt je Modul und sagt, wie viele fehlen; eine ausgefallene Quelle steht drin", () => {
    const viele = Array.from({ length: ZEILEN_JE_MODUL + 3 }, (_, i) => f({ id: `e${i}` }));
    const n = baueNachricht([gruppe({ eintraege: viele }), gruppe({ modul: "radio", titel: "Funkgeräte", fehler: true })], null)!;
    expect(n.message.split("\n").filter((z) => z.startsWith("•"))).toHaveLength(ZEILEN_JE_MODUL);
    expect(n.message).toContain("… und 3 weitere");
    expect(n.message).toContain("Funkgeräte: konnte nicht gelesen werden");
  });
});

describe("sendeAnNtfy", () => {
  it("postet JSON mit Thema an die Wurzel, Token als Bearer", async () => {
    const holen = vi.fn(async () => new Response("{}", { status: 200 }));
    await sendeAnNtfy({ basis: "http://ntfy", thema: THEMA, token: TOKEN }, { title: "Ä", message: "…", priority: 3, tags: ["date"] }, holen);
    const [url, init] = holen.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://ntfy/");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(init.body))).toEqual({ topic: THEMA, title: "Ä", message: "…", priority: 3, tags: ["date"] });
  });

  it("wirft bei einer Fehlerantwort", async () => {
    const holen = vi.fn(async () => new Response("nope", { status: 403 }));
    await expect(sendeAnNtfy({ basis: "http://ntfy", thema: THEMA, token: TOKEN }, { title: "t", message: "m", priority: 3, tags: [] }, holen))
      .rejects.toThrow("HTTP 403");
  });
});

describe("sendefenster", () => {
  it.each([
    ["Montag 06:59 Berlin (Sommerzeit)", "2026-07-06T04:59:00Z", "2026-W28", false],
    ["Montag 07:00 Berlin", "2026-07-06T05:00:00Z", "2026-W28", true],
    ["Sonntag 23:59 Berlin", "2026-07-12T21:59:00Z", "2026-W28", true],
    ["Montag 00:30 Berlin, in UTC noch Sonntag", "2026-07-05T22:30:00Z", "2026-W28", false],
    ["Jahreswechsel: Do 31.12.2026 gehört zu 2026-W53", "2026-12-31T12:00:00Z", "2026-W53", true],
    ["Fr 1.1.2027 gehört noch zu 2026-W53", "2027-01-01T12:00:00Z", "2026-W53", true],
    ["Mo 4.1.2027 ist 2027-W01", "2027-01-04T08:00:00Z", "2027-W01", true],
  ])("%s", (_fall, iso, woche, erreicht) => {
    expect(sendefenster(new Date(iso), ZONE)).toEqual({ woche, erreicht });
  });
});

const LAGER: FaelligkeitsQuelle = {
  modul: "lagerbuch", titel: "Lagerbuch", arten: ["Verfall", "Plombe"], darfSehen: (g) => !!g?.includes("lager"), lesen: () => [],
};
const FUNK: FaelligkeitsQuelle = {
  modul: "radio", titel: "Funkgeräte", arten: ["Ausleihe"], darfSehen: (g) => !!g?.includes("funk"), lesen: () => [],
};
const ALLE = [
  gruppe({ eintraege: [f({ id: "v" }), f({ id: "p", art: "Plombe", dringlichkeit: "bald" })] }),
  gruppe({ modul: "radio", titel: "Funkgeräte", eintraege: [f({ id: "l", art: "Ausleihe", dringlichkeit: "bald" })] }),
];

describe("Auswahl", () => {
  it("bietet je Modul alle Arten an, auch ohne Fälliges", () => {
    expect(auswahlOptionen([FUNK])).toEqual([{ modul: "radio", titel: "Funkgeräte", arten: [{ schluessel: "radio:Ausleihe", art: "Ausleihe" }] }]);
  });

  it("nimmt aus dem Browser nur bekannte Schlüssel, ohne Doppel", () => {
    expect(bereinigeAuswahl(["radio:Ausleihe", "radio:Ausleihe", "radio:Erfunden", 3, null], [LAGER, FUNK])).toEqual(["radio:Ausleihe"]);
    expect(bereinigeAuswahl("radio:Ausleihe", [FUNK])).toEqual([]);
  });

  it("filtert nach sichtbaren Modulen und abgewählten Arten", () => {
    const g = fuerPerson(ALLE, [LAGER, FUNK], new Set(["lagerbuch"]), [artSchluessel("lagerbuch", "Plombe")]);
    expect(g.map((x) => x.modul)).toEqual(["lagerbuch"]);
    expect(g[0].eintraege.map((e) => e.id)).toEqual(["v"]);
  });

  it("ein Modul ganz abgewählt: auch seine Fehlermeldung bleibt draußen", () => {
    const kaputt = [gruppe({ modul: "radio", titel: "Funkgeräte", fehler: true })];
    expect(fuerPerson(kaputt, [FUNK], new Set(["radio"]), ["radio:Ausleihe"])).toEqual([]);
    expect(fuerPerson(kaputt, [FUNK], new Set(["radio"]), [])).toHaveLength(1);
  });

  it("nachrichtFuerPerson: ohne sichtbares Modul nichts, sonst nur das eigene", () => {
    expect(nachrichtFuerPerson({ abgewaehlt: [] }, ["andere"], ALLE, [LAGER, FUNK], null)).toBeNull();
    const n = nachrichtFuerPerson({ abgewaehlt: [] }, ["funk"], ALLE, [LAGER, FUNK], null)!;
    expect(n.message).toContain("Funkgeräte");
    expect(n.message).not.toContain("Lagerbuch");
  });
});

describe("personenGruppen", () => {
  it("ohne Verzeichnis null, bei Ausfall wirft es", async () => {
    expect(await personenGruppen(async () => ({ status: "unconfigured", gruppen: [], personen: [] }))).toBeNull();
    await expect(personenGruppen(async () => ({ status: "error", gruppen: [], personen: [] }))).rejects.toThrow();
  });

  it("Gruppennamen je Person, gesperrt heißt null", async () => {
    const m = await personenGruppen(async () => ({
      status: "ok",
      gruppen: [{ id: "g1", name: "lager", anzeige: "Lager", ldap: false }],
      personen: [
        { id: "p1", name: "A", email: null, gruppenIds: ["g1", "weg"], gesperrt: false },
        { id: "p2", name: "B", email: null, gruppenIds: ["g1"], gesperrt: true },
      ],
    }));
    expect(m?.get("p1")).toEqual(["lager"]);
    expect(m?.get("p2")).toBeNull();
    expect(m?.has("p3")).toBe(false);
  });
});

describe("wochenschritt", () => {
  const SERVER = "https://ntfy.example.org";
  const VERSAND = { serverUrl: SERVER, basis: "http://ntfy", token: TOKEN, praefix: STANDARD_PRAEFIX };
  const MONTAG_8 = new Date("2026-07-06T06:00:00Z");

  function abo(personId: string, teil: Partial<FaelligkeitenAbo> = {}): FaelligkeitenAbo {
    return {
      personId, thema: `${STANDARD_PRAEFIX}${personId}`, push: true, abgewaehlt: [], gruppen: [],
      gesendeteWoche: null, erstelltAm: new Date(0), ...teil,
    };
  }

  function abh(teil: Partial<SchrittAbhaengigkeiten> & { liste?: FaelligkeitenAbo[] } = {}) {
    const liste = teil.liste ?? [abo("p1", { gruppen: ["lager"] })];
    const d: SchrittAbhaengigkeiten = {
      jetzt: MONTAG_8, zone: ZONE, versand: VERSAND,
      abos: () => liste,
      verzeichnis: async () => null,
      quellen: [LAGER, FUNK],
      sammeln: vi.fn(() => ALLE),
      vermerkeWoche: vi.fn((p: string, w: string) => {
        const a = liste.find((x) => x.personId === p);
        if (a) a.gesendeteWoche = w;
      }),
      seitenUrl: null,
      senden: vi.fn(async () => {}),
      melden: vi.fn(),
      ...teil,
    };
    return d;
  }

  beforeEach(() => _meldesperreZuruecksetzen());

  it("ohne Versand aus, vor Montag 7 Uhr wartet er", async () => {
    expect((await wochenschritt(abh({ versand: null }))).stand).toBe("aus");
    expect((await wochenschritt(abh({ jetzt: new Date("2026-07-06T04:00:00Z") }))).stand).toBe("wartet");
  });

  it("sendet jeder Person an ihr Thema, nur ihre Module, einmal je Woche", async () => {
    const d = abh({ liste: [abo("p1", { gruppen: ["lager"] }), abo("p2", { gruppen: ["funk"] })] });
    expect(await wochenschritt(d)).toEqual({ stand: "fertig", gesendet: 2, leer: 0, gescheitert: 0 });
    const aufrufe = vi.mocked(d.senden).mock.calls;
    expect(aufrufe.map(([z]) => z.thema)).toEqual([`${STANDARD_PRAEFIX}p1`, `${STANDARD_PRAEFIX}p2`]);
    expect(aufrufe[0][1].message).not.toContain("Funkgeräte");
    expect(aufrufe[1][1].message).not.toContain("Lagerbuch");
    expect(aufrufe[0][0].basis).toBe("http://ntfy");
    expect((await wochenschritt(d)).stand).toBe("schon");
    expect(d.senden).toHaveBeenCalledTimes(2);
  });

  it("mit Verzeichnis gilt dessen Stand, nicht der vom letzten Besuch — entzogen, gesperrt oder gelöscht heißt nichts", async () => {
    const liste = [abo("p1", { gruppen: ["lager"] }), abo("p2", { gruppen: ["lager"] }), abo("p3", { gruppen: ["funk"] })];
    const d = abh({ liste, verzeichnis: async () => new Map([["p1", []], ["p2", null], ["p4", ["lager"]]]) });
    expect(await wochenschritt(d)).toEqual({ stand: "fertig", gesendet: 0, leer: 3, gescheitert: 0 });
    expect(d.senden).not.toHaveBeenCalled();
    expect(liste.every((a) => a.gesendeteWoche === "2026-W28")).toBe(true);
  });

  it("antwortet das Verzeichnis nicht, geht an niemanden etwas, und die Woche bleibt offen", async () => {
    const d = abh({ verzeichnis: async () => { throw new Error("Pocket ID nicht erreichbar"); } });
    expect((await wochenschritt(d)).stand).toBe("fehler");
    expect(d.senden).not.toHaveBeenCalled();
    expect(d.vermerkeWoche).not.toHaveBeenCalled();
    expect(d.melden).toHaveBeenCalledTimes(1);
  });

  it("abgewählte Arten fehlen; alles abgewählt heißt keine Nachricht, Woche trotzdem erledigt", async () => {
    const d = abh({ liste: [abo("p1", { gruppen: ["lager"], abgewaehlt: ["lagerbuch:Plombe"] }), abo("p2", { gruppen: ["lager"], abgewaehlt: ["lagerbuch:Verfall", "lagerbuch:Plombe"] })] });
    expect(await wochenschritt(d)).toEqual({ stand: "fertig", gesendet: 1, leer: 1, gescheitert: 0 });
    expect(vi.mocked(d.senden).mock.calls[0][1].title).toBe("Was steht an: 1 überfällig");
    expect(d.vermerkeWoche).toHaveBeenCalledTimes(2);
  });

  it("scheitert der Versand an eine Person, bekommen die anderen ihre trotzdem; ihre Woche bleibt offen, eine Logzeile je Woche", async () => {
    const liste = [abo("p1", { gruppen: ["lager"] }), abo("p2", { gruppen: ["lager"] })];
    const senden = vi.fn(async (z: { thema: string }) => { if (z.thema.endsWith("p1")) throw new Error("HTTP 502"); });
    const d = abh({ liste, senden });
    expect(await wochenschritt(d)).toEqual({ stand: "fehler", gesendet: 1, leer: 0, gescheitert: 1 });
    expect(await wochenschritt(d)).toEqual({ stand: "fehler", gesendet: 0, leer: 0, gescheitert: 1 });
    expect(liste.map((a) => a.gesendeteWoche)).toEqual([null, "2026-W28"]);
    expect(d.melden).toHaveBeenCalledTimes(1);
  });

  it("gesendet, aber Woche nicht vermerkt: der nächste Schritt sendet nicht noch einmal", async () => {
    let gesperrt = true;
    const liste = [abo("p1", { gruppen: ["lager"] })];
    const d = abh({ liste, vermerkeWoche: vi.fn((_p: string, w: string) => { if (gesperrt) throw new Error("database is locked"); liste[0].gesendeteWoche = w; }) });
    expect((await wochenschritt(d)).stand).toBe("fehler");
    gesperrt = false;
    expect(await wochenschritt(d)).toEqual({ stand: "fertig", gesendet: 1, leer: 0, gescheitert: 0 });
    expect(d.senden).toHaveBeenCalledTimes(1);
    expect(liste[0].gesendeteWoche).toBe("2026-W28");
  });
});

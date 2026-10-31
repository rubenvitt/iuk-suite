import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Faelligkeit } from "@/core/faelligkeiten";
import {
  _warnsperreZuruecksetzen, FAELLIG_INTERN_ENV, FAELLIG_NTFY_ENV, FAELLIG_TOKEN_ENV, faelligkeitenAbo, sendeZiel,
} from "./konfiguration";
import { baueNachricht, ZEILEN_JE_MODUL } from "./nachricht";
import type { FaelligkeitsQuelle } from "./quellen";
import { sammle, sichtbareQuellen, zaehle, type FaelligkeitsGruppe } from "./sammeln";
import { sendeAnNtfy } from "./senden";
import { _meldesperreZuruecksetzen, sendefenster, wochenschritt, type SchrittAbhaengigkeiten } from "./takt";

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

  it("ist ohne Adresse aus, und zwar still", () => {
    const warnen = vi.fn();
    expect(faelligkeitenAbo({}, warnen)).toBeNull();
    expect(sendeZiel({ [FAELLIG_TOKEN_ENV]: TOKEN }, warnen)).toBeNull();
    expect(warnen).not.toHaveBeenCalled();
  });

  it("zeigt das Abo auch ohne Token, sendet aber nicht — und warnt, ohne Werte zu nennen", () => {
    const warnen = vi.fn();
    const env = { [FAELLIG_NTFY_ENV]: `https://ntfy.example.org/${THEMA}` };
    expect(faelligkeitenAbo(env, warnen)?.appLink).toBe(`ntfy://ntfy.example.org/${THEMA}?display=I%26K%20Was%20steht%20an`);
    expect(sendeZiel(env, warnen)).toBeNull();
    expect(warnen).toHaveBeenCalledTimes(1);
    expect(String(warnen.mock.calls[0][0])).not.toContain(THEMA);
  });

  it("sendet an den öffentlichen Server oder an die interne Adresse", () => {
    const env = { [FAELLIG_NTFY_ENV]: `https://ntfy.example.org/${THEMA}`, [FAELLIG_TOKEN_ENV]: ` ${TOKEN} ` };
    expect(sendeZiel(env)).toEqual({ basis: "https://ntfy.example.org", thema: THEMA, token: TOKEN });
    expect(sendeZiel({ ...env, [FAELLIG_INTERN_ENV]: "http://ntfy/" })).toEqual({ basis: "http://ntfy", thema: THEMA, token: TOKEN });
  });

  it("eine kaputte interne Adresse fällt auf den öffentlichen Server zurück", () => {
    const warnen = vi.fn();
    const env = { [FAELLIG_NTFY_ENV]: `https://ntfy.example.org/${THEMA}`, [FAELLIG_TOKEN_ENV]: TOKEN, [FAELLIG_INTERN_ENV]: "javascript:alert(1)" };
    expect(sendeZiel(env, warnen)?.basis).toBe("https://ntfy.example.org");
    expect(warnen).toHaveBeenCalledTimes(1);
  });
});

describe("sammeln", () => {
  const lager: FaelligkeitsQuelle = {
    modul: "lagerbuch", titel: "Lagerbuch", darfSehen: (g) => !!g?.includes("lager"),
    lesen: () => [f({ id: "b", dringlichkeit: "bald" }), f({ id: "a" })],
  };
  const kaputt: FaelligkeitsQuelle = {
    modul: "radio", titel: "Funkgeräte", darfSehen: (g) => !!g?.includes("funk"),
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

describe("wochenschritt", () => {
  const ZIEL = { basis: "http://ntfy", thema: THEMA, token: TOKEN };
  const MONTAG_8 = new Date("2026-07-06T06:00:00Z");

  function abh(teil: Partial<SchrittAbhaengigkeiten> = {}) {
    let gespeichert: string | null = null;
    const d: SchrittAbhaengigkeiten = {
      jetzt: MONTAG_8, zone: ZONE, ziel: ZIEL,
      leseWoche: () => gespeichert,
      schreibeWoche: vi.fn((w: string) => { gespeichert = w; }),
      gruppen: () => [gruppe({ eintraege: [f({ id: "a" })] })],
      seitenUrl: null,
      senden: vi.fn(async () => {}),
      melden: vi.fn(),
      ...teil,
    };
    return d;
  }

  beforeEach(() => _meldesperreZuruecksetzen());

  it("ohne Ziel aus, vor Montag 7 Uhr wartet er", async () => {
    expect(await wochenschritt(abh({ ziel: null }))).toBe("aus");
    expect(await wochenschritt(abh({ jetzt: new Date("2026-07-06T04:00:00Z") }))).toBe("wartet");
  });

  it("sendet einmal je Woche und vermerkt die Woche", async () => {
    const d = abh();
    expect(await wochenschritt(d)).toBe("gesendet");
    expect(d.schreibeWoche).toHaveBeenCalledWith("2026-W28");
    expect(await wochenschritt(d)).toBe("schon");
    expect(d.senden).toHaveBeenCalledTimes(1);
  });

  it("nichts fällig: nichts gesendet, Woche trotzdem erledigt", async () => {
    const d = abh({ gruppen: () => [gruppe({})] });
    expect(await wochenschritt(d)).toBe("leer");
    expect(d.senden).not.toHaveBeenCalled();
    expect(d.schreibeWoche).toHaveBeenCalledWith("2026-W28");
  });

  it("scheitert der Versand, bleibt die Woche offen, und das Log bekommt eine Zeile je Woche", async () => {
    const d = abh({ senden: vi.fn(async () => { throw new Error("HTTP 502"); }) });
    expect(await wochenschritt(d)).toBe("fehler");
    expect(await wochenschritt(d)).toBe("fehler");
    expect(d.schreibeWoche).not.toHaveBeenCalled();
    expect(d.melden).toHaveBeenCalledTimes(1);
  });
});

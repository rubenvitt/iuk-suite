import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * DIE ZAEHLER SIND MODUL-SINGLETONS. Ohne `vi.resetModules()` und ein frisches
 * `await import(...)` je Fall vergiftet der Fall, der einen Eimer leert, den
 * naechsten — und die Reihenfolge der Faelle entschiede ueber das Ergebnis.
 *
 * `vi.useFakeTimers()` steuert BEIDE Haelften zugleich: `gateSchranke.ts` liest
 * `Date.now()`, und `RateLimiter` benutzt per Vorgabe dieselbe Uhr
 * (`core/ratelimit.ts:22`). Nur so ist „nach Fensterende geht es weiter" ohne
 * echte Wartezeit pruefbar.
 */
type Schranke = typeof import("./gateSchranke");

async function frisch(env: Record<string, string> = {}): Promise<Schranke> {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  return import("./gateSchranke");
}

const ENV_NAMEN = [
  "LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN",
  "LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN",
  "LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE",
];
const alt: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_NAMEN) { alt[k] = process.env[k]; delete process.env[k]; }
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-03T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of ENV_NAMEN) {
    if (alt[k] === undefined) delete process.env[k];
    else process.env[k] = alt[k]!;
  }
});

describe("die Datei hat GENAU ZWEI Exporte", () => {
  it("gibt weder die Zaehler noch die Sperrzeit-Map heraus", async () => {
    /**
     * Ein vierter Aufrufer, der selbst buchen will, ist damit KONSTRUKTIV
     * ausgeschlossen — nicht durch eine Konvention. Die drei RateLimiter und die
     * Map bleiben modul-intern (§3.5.3).
     */
    const s = await frisch();
    expect(Object.keys(s).sort()).toEqual(["gateFehlversuchBuchen", "gateGesperrt"]);
  });
});

describe("EINE ERFOLGREICHE EINLOESUNG VERBRAUCHT KEIN BUDGET", () => {
  it("bleibt nach 100 Erfolgen in Folge offen", async () => {
    /**
     * DIE ZEILE, DIE DEN GANZEN ENTWURF TRAEGT. Genau das macht den modulweiten
     * Deckel vertretbar: wuerden Erfolge mitzaehlen, waere ein modulweites Limit
     * ein AUSFALL DER AUSGABE.
     *
     * Die Mutation, die ohne diesen Fall gruen bliebe: den Verbrauch vor die
     * Codepruefung ziehen — also das heutige Verhalten
     * (`lagerbuch/src/app/(gate)/actions.ts:19`). Genau dieser Fehler ist in
     * dieser Suite bereits produktiv eingetreten: feedback hat mit einem
     * IP-Limiter von 10/min „den Kernfall getoetet", 15 Ehrenamtliche aus einem
     * Vereins-WLAN.
     *
     * Der Test kann den Erfolgsfall nur so pruefen: er ruft
     * `gateFehlversuchBuchen` NICHT. Dass der Aufrufer das genauso haelt, ist
     * Aufgabe von Teil 4 — hier steht die Zusage, dass die Schranke selbst nichts
     * bucht, was ihr niemand meldet.
     */
    const s = await frisch();
    for (let i = 0; i < 100; i++) expect(s.gateGesperrt("cf:203.0.113.7")).toBeNull();
    expect(s.gateGesperrt("direkt")).toBeNull();
  });
});

describe("der Absender-Eimer", () => {
  it("weist den 6. Fehlversuch desselben Absenders ab", async () => {
    // 1:1 die heutige Zusage: 5 Fehlversuche je Absender und Minute
    // (`lagerbuch/src/lib/auth/rateLimit.ts:4-5`).
    const s = await frisch();
    for (let i = 0; i < 5; i++) {
      s.gateFehlversuchBuchen("cf:1.2.3.4");
      expect(s.gateGesperrt("cf:1.2.3.4"), `nach ${i + 1} Fehlversuchen`).toBeNull();
    }
    s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).not.toBeNull();
  });

  it("trifft NUR diesen Absender", async () => {
    const s = await frisch();
    for (let i = 0; i < 6; i++) s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).not.toBeNull();
    expect(s.gateGesperrt("cf:9.9.9.9")).toBeNull();
  });

  it("gibt nach Fensterende wieder frei", async () => {
    const s = await frisch();
    for (let i = 0; i < 6; i++) s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).not.toBeNull();
    vi.advanceTimersByTime(60_001);
    expect(s.gateGesperrt("cf:1.2.3.4")).toBeNull();
  });

  it("liefert Restsekunden — NIE 0, und aufgerundet", async () => {
    /**
     * Ein `if (gateGesperrt(...))` waere in der letzten Sekunde sonst STILL
     * falsch. Die Aufrufer pruefen trotzdem ausdruecklich gegen `null` — die
     * Zusage steht im Typ, nicht in der Wahrheitswertumwandlung.
     */
    const s = await frisch();
    for (let i = 0; i < 6; i++) s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).toBe(60);
    vi.advanceTimersByTime(59_500);
    expect(s.gateGesperrt("cf:1.2.3.4")).toBe(1);   // 500 ms → 1, nicht 0
    vi.advanceTimersByTime(600);
    expect(s.gateGesperrt("cf:1.2.3.4")).toBeNull();
  });
});

describe("die modulweiten Deckel", () => {
  it("greifen auch bei jedem Versuch von einem ANDEREN Absenderschluessel", async () => {
    /**
     * Der Absenderschluessel ist rotierbar (§3.5.2) — wer den Container direkt
     * erreicht, faelscht `cf-connecting-ip`. Deshalb tragen NUR diese beiden
     * Zaehler die eigentliche Abwehr: ihr Schluessel ist der einzige, den niemand
     * rotieren kann.
     */
    const s = await frisch({ LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "8" });
    for (let i = 0; i < 8; i++) s.gateFehlversuchBuchen(`cf:10.0.0.${i}`);
    expect(s.gateGesperrt("cf:10.0.0.0")).toBeNull();       // noch offen
    s.gateFehlversuchBuchen("cf:10.0.0.99");                // der 9. Versuch
    // Ab jetzt ist JEDER Absender gesperrt, auch ein voellig neuer.
    expect(s.gateGesperrt("cf:172.16.0.1")).not.toBeNull();
  });

  it("sperrt bei der Minutenbremse fuer 60 Sekunden", async () => {
    const s = await frisch({ LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "2" });
    for (let i = 0; i < 3; i++) s.gateFehlversuchBuchen(`cf:10.0.0.${i}`);
    expect(s.gateGesperrt("cf:neu")).toBe(60);
    vi.advanceTimersByTime(60_001);
    expect(s.gateGesperrt("cf:neu")).toBeNull();
  });

  it("sperrt bei der Stundenbremse fuer 3600 Sekunden", async () => {
    const s = await frisch({
      LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "60",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "600",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: "3",
    });
    for (let i = 0; i < 4; i++) s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:egal")).toBe(3600);
    vi.advanceTimersByTime(3_600_001);
    expect(s.gateGesperrt("cf:egal")).toBeNull();
  });

  it("liefert die GROESSTE der drei Restzeiten", async () => {
    // Wer den Stundendeckel gerissen hat, soll nicht „noch 12 Sekunden" lesen.
    const s = await frisch({
      LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "60",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "600",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: "2",
    });
    for (let i = 0; i < 3; i++) s.gateFehlversuchBuchen("cf:1.2.3.4");
    vi.advanceTimersByTime(59_000);
    expect(s.gateGesperrt("cf:1.2.3.4")).toBe(3600 - 59);
  });
});

describe("die Kette ist KURZSCHLIESSEND", () => {
  it("ein bereits gesperrter Absender verbraucht das modulweite Budget NICHT mit", async () => {
    /**
     * Sonst legte ein einzelner Klopfer die Ausgabe fuer ALLE lahm: er
     * verbrauchte mit seinen eigenen, laengst gesperrten Versuchen den
     * modulweiten Deckel.
     *
     * Aufbau: Absender-Eimer 2, modulweiter Minutendeckel 5. Nach 3 Versuchen
     * desselben Absenders ist ER gesperrt, aber der modulweite Zaehler steht erst
     * bei 2 — die weiteren 20 Versuche desselben Absenders duerfen ihn nicht
     * weitertreiben.
     */
    const s = await frisch({
      LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "2",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "5",
    });
    for (let i = 0; i < 23; i++) s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).not.toBeNull();     // er selbst: gesperrt
    expect(s.gateGesperrt("cf:9.9.9.9")).toBeNull();         // alle anderen: offen
  });
});

describe("gateGesperrt LIEST NUR", () => {
  it("bucht nichts — hundert Abfragen schliessen das Gate nicht", async () => {
    /**
     * `RateLimiter.check()` prueft UND bucht in einem Zug
     * (`core/ratelimit.ts:26-37`); ein reines Nachsehen gibt es dort nicht.
     * Deshalb merkt sich `gateSchranke.ts` jedes `false` selbst, und diese
     * Funktion liest nur noch die gemerkte Zahl.
     *
     * Die Mutation, die ohne diesen Fall gruen bliebe: `gateGesperrt` ruft
     * `check()`. Dann sperrte sich die Gate-SEITE selbst aus, weil sie die
     * Schranke bei jedem Rendern fragt (§7.2.4) — und niemand faende die Ursache.
     */
    const s = await frisch({ LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "5" });
    for (let i = 0; i < 100; i++) s.gateGesperrt("cf:1.2.3.4");
    for (let i = 0; i < 5; i++) s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).toBeNull();   // die 5 sind noch nicht ueberschritten
  });

  it("braucht KEINEN Datenbankzugriff — die Signatur nimmt nur einen String", async () => {
    // Schritt 2 der Reihenfolge laeuft VOR jedem DB-Zugriff, und genau das ist
    // der Grund, warum die modulweiten Deckel den Lookup ueberhaupt schuetzen
    // koennen. Ein `db`-Parameter hier waere die Verletzung der Zusage.
    const s = await frisch();
    expect(s.gateGesperrt.length).toBe(1);
  });
});

describe("die Env-Zahlen wirken", () => {
  it("liest die drei Grenzen aus der Umgebung, nicht aus dem Code", async () => {
    const s = await frisch({ LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "1" });
    s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).toBeNull();
    s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).not.toBeNull();
  });

  it("faellt ohne Umgebung auf 5 / 30 / 300", async () => {
    const s = await frisch();
    for (let i = 0; i < 5; i++) s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).toBeNull();
    s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).not.toBeNull();
  });
});

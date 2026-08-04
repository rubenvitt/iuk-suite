import { describe, it, expect } from "vitest";
import { grenzen, ZAHL_NAMEN, GrenzenUngueltig, helferSitzungGeheimnis } from "./grenzen";

/**
 * DIE UNABHAENGIGE ERWARTUNGSTABELLE (§10.8, Eigenschaft 2).
 *
 * Sie steht hier ausgeschrieben und wird NICHT aus `grenzen.ts` importiert. Wer
 * `ZAHLEN` exportierte und hier laese, machte aus diesem Test eine Tautologie:
 * er pruefte den Code gegen sich selbst und bliebe auch bei falscher Einheit,
 * falscher Vorbelegung und falscher Obergrenze gruen. Genau das ist bei `files`
 * passiert — dort stand „Anzahl" im Code, wo die Spec „Anzahl/10 min" verlangt,
 * und nur die unabhaengige Tabelle hat es gefunden.
 *
 * Deshalb traegt jede Zeile hier auch ihr eigenes `einheit`-Wort (analog zum
 * Vorbild `files/_lib/grenzen.test.ts`, `TABELLE` + `it.each`): der Namens-
 * Suffix-Test weiter unten prueft nur, dass der VARIABLENNAME eine Einheit
 * traegt (§10.1) — er kann nicht sehen, ob `ZAHLEN[name].einheit` in
 * `grenzen.ts` das RICHTIGE Wort traegt. Ohne eine eigene, unabhaengig
 * ausgeschriebene `einheit`-Spalte bliebe eine vertauschte Einheit (z. B.
 * "Anzahl/min" statt "Anzahl/h" bei `..._PRO_STUNDE`) unbemerkt gruen.
 *
 * Die Werte stammen Zeile fuer Zeile aus Spec §10.3.
 *
 * ⚠️ `LAGERBUCH_BACKUP_AUFBEWAHRUNG_TAGE` FEHLT hier mit Absicht (Annahme
 * A-T2-2, §0): Entscheidung 22 ist offen, und der Rueckfall A31 der Spec ist
 * „Variante (a), kein Hintergrund-Eintrag, Variable entfaellt". Faellt die
 * Betreiberantwort anders aus, ergaenzt TEIL 3 genau eine Zeile hier UND eine in
 * `ZAHLEN` — nicht eine von beiden, UND die neue Zeile hier braucht auch ihre
 * `einheit`.
 */
const ERWARTET = [
  { name: "LAGERBUCH_VERFALL_ROT_TAGE",                    einheit: "Tage",        vorgabe: 31,  min: 1, max: 3650 },
  { name: "LAGERBUCH_VERFALL_GELB_TAGE",                   einheit: "Tage",        vorgabe: 56,  min: 1, max: 3650 },
  { name: "LAGERBUCH_HELFER_SITZUNG_STUNDEN",              einheit: "Stunden",     vorgabe: 12,  min: 1, max: 24 },
  { name: "LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN",  einheit: "Anzahl/min",  vorgabe: 5,   min: 1, max: 60 },
  { name: "LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN",    einheit: "Anzahl/min",  vorgabe: 30,  min: 1, max: 600 },
  { name: "LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE", einheit: "Anzahl/h",    vorgabe: 300, min: 1, max: 3600 },
] as const;

/**
 * Wirft `grenzen(env)` und liefert die Fehlermeldung zurueck — oder wirft den
 * Testfehlschlag selbst, wenn `grenzen` ausnahmsweise NICHT wirft. Eigener
 * Helfer statt `expect(...).toThrow()`, weil die folgenden Tests den TEXT der
 * Meldung untersuchen, nicht nur, DASS geworfen wurde.
 */
function meldung(env: Record<string, string | undefined>): string {
  try {
    grenzen(env);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("grenzen() haette werfen muessen");
}

/** Eine leere Umgebung — NICHT `process.env`. Der Test darf nicht davon abhaengen,
 *  was in der Entwicklerumgebung zufaellig gesetzt ist. */
const LEER: Record<string, string | undefined> = {};

describe("ZAHL_NAMEN — die Namensliste gegen die unabhaengige Tabelle", () => {
  it("enthaelt genau die erwarteten Namen, in beiden Richtungen", () => {
    // Beide Richtungen: eine hier ergaenzte Zeile ohne Gegenstueck in `ZAHLEN`
    // faellt genauso auf wie eine dort ergaenzte ohne Gegenstueck hier.
    expect([...ZAHL_NAMEN].sort()).toEqual(ERWARTET.map((e) => e.name).sort());
  });

  it("traegt in JEDEM Namen die Einheit — kein nackter Zahlname", () => {
    // §10.1: „Warum die Einheit im Namen steht". Eine Grenze namens
    // LAGERBUCH_VERFALL laesst offen, ob Tage, Wochen oder Prozent gemeint sind,
    // und beide Zuweisungen waeren typkorrekt.
    for (const name of ZAHL_NAMEN) {
      expect(name).toMatch(/_(TAGE|STUNDEN|MIN|STUNDE|SEKUNDEN|BYTES)$/);
    }
  });
});

describe("ERWARTET Zeile fuer Zeile — das Einheitenwort in der Meldung, nicht nur im Namen", () => {
  // Anders als der Namens-Suffix-Test oben: der pruefte nur, dass der NAME eine
  // Einheit traegt. Hier geht es um `ZAHLEN[name].einheit` selbst — vertauschte
  // Einheitswoerter sind typkorrekt (`Einheit` ist eine Union aus vier
  // Woertern, jedes passt an jede Zeile) und faellt sonst durch KEIN Werkzeug
  // auf (Vorbild `files/_lib/grenzen.test.ts`, §9.3-Zeile-fuer-Zeile-Test).
  it.each(ERWARTET)(
    "$name — Meldungen nennen die Einheit „$einheit\"",
    ({ name, einheit, min, max }) => {
      const nichtGanzzahl = meldung({ [name]: "abc" });
      expect(nichtGanzzahl).toContain(name);
      expect(nichtGanzzahl).toContain(`(${einheit})`);

      const zuKlein = meldung({ [name]: String(min - 1) });
      expect(zuKlein).toContain(`(${einheit})`);

      const zuGross = meldung({ [name]: String(max + 1) });
      expect(zuGross).toContain(`(${einheit})`);
    },
  );
});

describe("grenzen() — Vorbelegungen", () => {
  it("liefert bei LEERER Umgebung jede Vorgabe aus der Tabelle", () => {
    // Das ist zugleich die Zusage, die `pnpm build` gruen haelt: `next build`
    // laeuft ohne .env, und `gateSchranke.ts` ruft `grenzen()` auf Modulebene.
    const g = grenzen(LEER);
    expect(g.verfallRotTage).toBe(31);
    expect(g.verfallGelbTage).toBe(56);
    expect(g.helferSitzungStunden).toBe(12);
    expect(g.gateProAbsenderProMin).toBe(5);
    expect(g.gateGesamtProMin).toBe(30);
    expect(g.gateGesamtProStunde).toBe(300);
  });

  it("LEER GESETZT gilt wie NICHT GESETZT", () => {
    // `LAGERBUCH_VERFALL_ROT_TAGE=` ist der haeufigere Fall als die fehlende
    // Zeile, und `Number("")` waere 0 — eine Ampel, die sofort rot ist.
    expect(grenzen({ LAGERBUCH_VERFALL_ROT_TAGE: "" }).verfallRotTage).toBe(31);
    expect(grenzen({ LAGERBUCH_VERFALL_ROT_TAGE: "   " }).verfallRotTage).toBe(31);
  });

  it("liest bei JEDEM Aufruf, nicht beim Import (§10.8, Eigenschaft 3)", () => {
    expect(grenzen({ LAGERBUCH_HELFER_SITZUNG_STUNDEN: "8" }).helferSitzungStunden).toBe(8);
    expect(grenzen({ LAGERBUCH_HELFER_SITZUNG_STUNDEN: "6" }).helferSitzungStunden).toBe(6);
  });
});

describe("grenzen() — die Ganzzahlpruefung ist NICHT Number()", () => {
  it("weist Hex ab, obwohl Number('0x10') ganzzahlig waere", () => {
    // Der ganze Grund fuer das eigene /^[+-]?\d+$/: `Number("0x10")` ist 16 und
    // `Number.isInteger(16)` wahr. Eine Pruefung ueber `Number` allein liesse Hex
    // und `1e7` durch, und die GELTENDE Grenze waere eine andere als die, die in
    // der .env steht.
    expect(() => grenzen({ LAGERBUCH_GATE_GESAMT_PLATZHALTER: "x" })).not.toThrow(); // unbekannte Namen ignoriert
    expect(() => grenzen({ LAGERBUCH_VERFALL_ROT_TAGE: "0x10" })).toThrow(GrenzenUngueltig);
    expect(() => grenzen({ LAGERBUCH_VERFALL_ROT_TAGE: "1e7" })).toThrow(GrenzenUngueltig);
    expect(() => grenzen({ LAGERBUCH_VERFALL_ROT_TAGE: "31.5" })).toThrow(GrenzenUngueltig);
    expect(() => grenzen({ LAGERBUCH_VERFALL_ROT_TAGE: "fuenf" })).toThrow(GrenzenUngueltig);
  });

  it("weist jeden Wert ausserhalb des Bereichs ab — an BEIDEN Raendern", () => {
    for (const e of ERWARTET) {
      expect(() => grenzen({ [e.name]: String(e.min - 1) })).toThrow(GrenzenUngueltig);
      expect(() => grenzen({ [e.name]: String(e.max + 1) })).toThrow(GrenzenUngueltig);
      expect(() => grenzen({ [e.name]: String(e.min) })).not.toThrow();
      expect(() => grenzen({ [e.name]: String(e.max) })).not.toThrow();
    }
  });

  it("nennt in der Meldung den NAMEN, den WERT und die EINHEIT", () => {
    // Diese Meldung liest der Betreiber, wenn der Container nicht startet. „Wert
    // ungueltig" ohne Namen ist eine Meldung, die eine Suche ausloest statt sie
    // zu beenden.
    try {
      grenzen({ LAGERBUCH_HELFER_SITZUNG_STUNDEN: "48" });
      expect.unreachable("haette werfen muessen");
    } catch (e) {
      const text = (e as Error).message;
      expect(text).toContain("LAGERBUCH_HELFER_SITZUNG_STUNDEN");
      expect(text).toContain("48");
      expect(text).toContain("Stunden");
      expect(text).toContain("24");
    }
  });

  it("GrenzenUngueltig ist ein EIGENER Typ, unterscheidbar vom Betriebsfehler", () => {
    const e = new GrenzenUngueltig("x");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("GrenzenUngueltig");
  });
});

describe("grenzen() prueft KEINE Kopplungen — die gehoeren Teil 3", () => {
  it("laesst ROT > GELB durch, weil das eine BOOT-Pruefung ist", () => {
    /**
     * §10.5, Pruefung 2 und 3 (Kopplungen) liegen in `grenzenFehler()`, und das
     * entsteht in TEIL 3. `grenzen()` liefert die GELTENDEN Werte, auch wenn sie
     * zueinander unsinnig stehen — sonst haette der Boot keine Chance, eine
     * BRAUCHBARE Sammelmeldung zu bauen: er will alle Fehler auf einmal nennen,
     * nicht den ersten.
     *
     * ⚠️ Diese Zeile ist die Stelle, an der jemand aus gutem Willen zu viel tut.
     * Wer die Kopplung hier ergaenzt, macht `grenzenFehler()` in Teil 3
     * unbrauchbar und bricht den Import von `gateSchranke.ts` bei einer
     * Fehlkonfiguration, die eine Meldung verdient hat.
     */
    expect(() => grenzen({
      LAGERBUCH_VERFALL_ROT_TAGE: "90", LAGERBUCH_VERFALL_GELB_TAGE: "56",
    })).not.toThrow();
    expect(() => grenzen({
      LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "60",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "1",
    })).not.toThrow();
  });
});

describe("helferSitzungGeheimnis — Pflicht, aber NICHT in ZAHLEN", () => {
  it("steht NICHT in ZAHL_NAMEN", () => {
    // Waere es eine Zahl-Zeile, laese `grenzen()` es mit — und `pnpm build`
    // braeche, weil `next build` ohne Secrets laeuft (§10.8, Eigenschaft 3).
    expect(ZAHL_NAMEN).not.toContain("LAGERBUCH_HELFER_SITZUNG_SECRET");
  });

  it("liefert den gesetzten Wert", () => {
    expect(helferSitzungGeheimnis({
      LAGERBUCH_HELFER_SITZUNG_SECRET: "e2e-helfer-secret-nicht-produktiv-32z",
    })).toBe("e2e-helfer-secret-nicht-produktiv-32z");
  });

  it("wirft, wenn die Variable fehlt oder LEER ist — und nennt den Namen", () => {
    // `${LAGERBUCH_HELFER_SITZUNG_SECRET}` ohne `:?` setzt in Compose den LEEREN
    // String, und leer greift keinen Default. `jose` verweigert danach einen
    // Nullschluessel („Zero-length key is not supported") — ohne diese Zeile
    // bootet der Container gruen und faellt erst beim ersten /t/<code>-Scan mit
    // 500 um. Das Scheitern waere von der Startzeit in die Nutzungszeit gewandert.
    for (const env of [{}, { LAGERBUCH_HELFER_SITZUNG_SECRET: "" },
                       { LAGERBUCH_HELFER_SITZUNG_SECRET: "   " }]) {
      expect(() => helferSitzungGeheimnis(env)).toThrow(GrenzenUngueltig);
      expect(() => helferSitzungGeheimnis(env)).toThrow(/LAGERBUCH_HELFER_SITZUNG_SECRET/);
    }
  });

  it("prueft an DIESER Stelle NICHT auf Laenge, Dev-Default oder AUTH_SECRET-Gleichheit", () => {
    /**
     * §10.5, Pruefung 4 verlangt zusaetzlich: mindestens 32 Zeichen, nicht
     * `dev-insecure-secret-change-me`, nicht identisch mit AUTH_SECRET. Das sind
     * BOOT-Pruefungen und gehoeren zu `grenzenFehler()` (Teil 3).
     *
     * Warum nicht hier: diese Funktion laeuft bei JEDEM Cookie-Vorgang. Ein
     * zu kurzes Geheimnis waehrend eines Cutover-Abends abzulehnen, machte aus
     * einer Konfigurationswarnung einen Ausfall JEDER laufenden Feld-Sitzung —
     * und das an einer Stelle, an der niemand die Meldung liest. Der Riegel
     * gehoert an den Start, nicht in den Sitzungspfad.
     */
    expect(() => helferSitzungGeheimnis({ LAGERBUCH_HELFER_SITZUNG_SECRET: "kurz" }))
      .not.toThrow();
  });
});

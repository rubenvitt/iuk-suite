import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  grenzen, ZAHL_NAMEN, GrenzenUngueltig, helferSitzungGeheimnis,
  grenzenFehler, JOURNAL_GRENZE, CHECK_GRENZE, BZ_LOGBUCH_GRENZE,
  ARTIKEL_VERLAUF_GRENZE,
} from "./grenzen";

/** Der Quelltext von `grenzen.ts` — die Ebene, auf der die
 *  „nicht konfigurierbar"-Zusage der reinen Deckel ueberhaupt lebt (I-6). */
const GRENZEN_QUELLE = readFileSync(
  join(process.cwd(), "src/app/m/lagerbuch/_lib/grenzen.ts"), "utf8",
);

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

/**
 * DIE UNABHAENGIGE TABELLE DER DREI REINEN DECKEL (§10.8, Eigenschaft 2).
 *
 * Auch hier gilt: die Werte stehen ausgeschrieben und werden NICHT aus dem Modul
 * abgeleitet. Ein Test wie `expect(JOURNAL_GRENZE).toBe(JOURNAL_GRENZE)` waere
 * kein Test; ein Test, der die Zahl aus einer exportierten Tabelle zieht, ist
 * derselbe Fehler eine Ebene tiefer.
 */
const DECKEL = [
  { name: "JOURNAL_GRENZE", wert: JOURNAL_GRENZE, erwartet: 100 },
  { name: "CHECK_GRENZE", wert: CHECK_GRENZE, erwartet: 50 },
  { name: "BZ_LOGBUCH_GRENZE", wert: BZ_LOGBUCH_GRENZE, erwartet: 100 },
  { name: "ARTIKEL_VERLAUF_GRENZE", wert: ARTIKEL_VERLAUF_GRENZE, erwartet: 8 },
] as const;

/** Eine Umgebung, unter der das Modul ERREICHBAR ist — sonst ist die Fehlerliste
 *  konstruktionsgemaess leer (§10.5, die Bedingtheit). */
const ERREICHBAR: Record<string, string | undefined> = {
  SUITE_HOST_LAGERBUCH: "lagerbuch.example.test",
  LAGERBUCH_HELFER_SITZUNG_SECRET: "ein-hinreichend-langes-geheimnis-32z",
  AUTH_SECRET: "ein-anderes-suite-geheimnis",
};

/**
 * JEDE `export const …_GRENZE`-Zeile aus `grenzen.ts`, roh zerlegt in Namen und
 * rechte Seite.
 *
 * ⚠️ DER QUELLTEXT-SCAN IST DIE EBENE, AUF DER DIE ZUSAGE LEBT — analog zu
 * `marke.test.ts`. Ein WERT-Test sieht den Rueckfall nicht: schriebe jemand
 * `export const JOURNAL_GRENZE = Number(process.env.LAGERBUCH_JOURNAL_GRENZE ?? 100)`,
 * bliebe `JOURNAL_GRENZE === 100` in der Testumgebung wahr, weil die Variable
 * dort schlicht nicht gesetzt ist. Der Regler waere da, und kein Lauf wuerde rot.
 */
function deckelZeilen(): { name: string; rechteSeite: string }[] {
  return [...GRENZEN_QUELLE.matchAll(/^export const (\w*GRENZE) = (.+);$/gm)]
    .map((m) => ({ name: m[1], rechteSeite: m[2] }));
}

describe("die reinen Deckel (§5.14.3, §10.3)", () => {
  it("tragen genau die Werte aus der Spec", () => {
    for (const d of DECKEL) expect(d.wert).toBe(d.erwartet);
  });

  it("stehen NICHT in ZAHL_NAMEN — sie sind Konstanten, keine Env-Variablen", () => {
    /**
     * §10.3: sie zur Env-Variablen zu machen hiesse, einen Regler anzubieten, der
     * bei 5000 die Journalseite bei realer Datenmenge stehen laesst — und
     * `better-sqlite3` ist SYNCHRON, die Seite blockierte dabei die GANZE Suite
     * (Falle 10).
     *
     * ⚠️ BEIDE SCHREIBWEISEN. Eine echte Regression hiesse nicht `JOURNAL_GRENZE`,
     * sondern `LAGERBUCH_JOURNAL_GRENZE` — jede andere Env-Variable dieses Moduls
     * traegt das Praefix. Ohne die zweite Zeile prueft dieser Fall den
     * unwahrscheinlicheren der beiden Namen.
     */
    for (const d of DECKEL) {
      expect(ZAHL_NAMEN).not.toContain(d.name);
      expect(ZAHL_NAMEN as readonly string[]).not.toContain(`LAGERBUCH_${d.name}`);
    }
  });

  it("die Quelle kennt GENAU die Deckel dieser Tabelle — in beide Richtungen", () => {
    // Ein hier ergaenzter Deckel ohne Zeile in DECKEL faellt auf (und umgekehrt),
    // ohne dass die Tabelle ihre Werte aus dem Modul zieht.
    expect(deckelZeilen().map((z) => z.name).sort())
      .toEqual(DECKEL.map((d) => d.name).slice().sort());
  });

  it("werden von keiner Umgebungsvariable beeinflusst — die rechte Seite ist eine ZAHL", () => {
    /**
     * Der Fall, den jemand aus gutem Willen baut: „ich mache es doch nur
     * ueberschreibbar". Frueher stand hier
     * `expect(grenzen({ JOURNAL_GRENZE: "5000" })).toBeTruthy()` — das liefert
     * IMMER ein Objekt — und `expect(JOURNAL_GRENZE).toBe(100)`, eine
     * Wiederholung der Wertetabelle. Beides konnte unter der Mutation, gegen die
     * es argumentiert, nicht rot werden.
     *
     * Diese Zeile kann es: die rechte Seite jeder Deckel-Zuweisung muss eine
     * nackte ganze Zahl sein. `Number(process.env…)`, `env[…]`, `?? 100` —
     * jede Form des Reglers faellt durch.
     */
    for (const z of deckelZeilen()) {
      expect(z.rechteSeite, `${z.name} rechte Seite`).toMatch(/^\d+$/);
    }
    // Und die Zahl im Quelltext ist dieselbe wie die exportierte — der Deckel
    // wird also nicht nachtraeglich woanders ueberschrieben.
    for (const d of DECKEL) {
      const z = deckelZeilen().find((x) => x.name === d.name)!;
      expect(Number(z.rechteSeite), d.name).toBe(d.erwartet);
    }
  });

  it("`grenzen()` kennt die Deckel gar nicht", () => {
    // Gegenprobe zum Scan: kein Feld von `Grenzen` traegt einen Deckelwert, und
    // eine gleichnamige Env-Variable aendert daran nichts.
    const g = grenzen({ JOURNAL_GRENZE: "5000", LAGERBUCH_JOURNAL_GRENZE: "5000" });
    expect(Object.values(g)).not.toContain(5000);
    expect(JOURNAL_GRENZE).toBe(100);
  });
});

describe("grenzenFehler — die Bedingtheit ist eine Notwendigkeit", () => {
  it("liefert OHNE Prod-Host eine LEERE Liste, auch wenn ALLES fehlt", () => {
    /**
     * §10.5: `assertHostConfig()` laeuft fuer die GANZE Suite. Eine unbedingte
     * Pflicht hiesse: sobald ein Image mit lagerbuch auf dem Server landet,
     * startet die Suite nicht mehr — portal, qr, feedback und files inklusive —,
     * bis der Betreiber die .env ergaenzt hat. Damit blockierte dieses Modul jeden
     * unbeteiligten Deploy im Fenster zwischen Merge und Cutover.
     */
    expect(grenzenFehler({})).toEqual([]);
    expect(grenzenFehler({ LAGERBUCH_VERFALL_ROT_TAGE: "9999999" })).toEqual([]);
  });

  it("liefert MIT Prod-Host und vollstaendiger Umgebung eine leere Liste", () => {
    expect(grenzenFehler(ERREICHBAR)).toEqual([]);
  });

  it("liest den Host ueber prodHostsFor, nicht ueber mod.prodHosts", () => {
    // Der Registry-Eintrag traegt prodHosts: []. Waere die Bedingung ein
    // Feldzugriff, waere SUITE_HOST_LAGERBUCH an dieser Stelle WIRKUNGSLOS und
    // alle vier Pruefungen liefen nie — zeichengleich die Falle, die Teil 2 fuer
    // adminGroupsFor(mod) gegen mod.adminGroups benannt hat.
    expect(grenzenFehler({ ...ERREICHBAR, LAGERBUCH_HELFER_SITZUNG_SECRET: "" }).length)
      .toBeGreaterThan(0);
  });
});

describe("grenzenFehler — Pruefung 1: ganzzahlig und im Bereich", () => {
  it("SAMMELT alle Fehler, statt beim ersten zu werfen", () => {
    /**
     * ⚠️ DIE STELLE, AN DER EIN NAIVER PORT FALSCH WIRD. `grenzen()` WIRFT bei
     * einem kaputten Wert (GrenzenUngueltig). `grenzenFehler` muss den Wurf
     * ABFANGEN und in eine Zeichenkette verwandeln — sonst meldet der Boot den
     * ERSTEN Fehler statt aller, und der Betreiber faehrt drei Deploys fuer drei
     * Tippfehler.
     */
    const fehler = grenzenFehler({
      ...ERREICHBAR,
      LAGERBUCH_VERFALL_ROT_TAGE: "fuenf",
      LAGERBUCH_HELFER_SITZUNG_SECRET: "kurz",
    });
    expect(fehler.length).toBeGreaterThanOrEqual(2);
    expect(fehler.join("\n")).toContain("LAGERBUCH_VERFALL_ROT_TAGE");
    expect(fehler.join("\n")).toContain("LAGERBUCH_HELFER_SITZUNG_SECRET");
  });

  it("weist 0x10 und 1e7 ab, statt sie als 16 bzw. 10000000 zu lesen", () => {
    for (const roh of ["0x10", "1e7", "31.5", " "]) {
      const f = grenzenFehler({ ...ERREICHBAR, LAGERBUCH_VERFALL_ROT_TAGE: roh });
      if (roh === " ") {
        // LEER GESETZT GILT WIE NICHT GESETZT — das ist kein Fehler.
        expect(f).toEqual([]);
      } else {
        expect(f.join("\n")).toContain("LAGERBUCH_VERFALL_ROT_TAGE");
      }
    }
  });
});

describe("grenzenFehler — Pruefung 2: ROT <= GELB", () => {
  it("lehnt ROT > GELB ab und NENNT die Folge", () => {
    // §10.5, Pruefung 2: die Meldung nennt beide Namen, beide Werte und die Folge.
    // „Wert ungueltig" ohne Namen ist eine Meldung, die eine Suche ausloest statt
    // sie zu beenden.
    const f = grenzenFehler({
      ...ERREICHBAR, LAGERBUCH_VERFALL_ROT_TAGE: "90", LAGERBUCH_VERFALL_GELB_TAGE: "56",
    });
    const text = f.join("\n");
    expect(text).toContain("LAGERBUCH_VERFALL_ROT_TAGE");
    expect(text).toContain("LAGERBUCH_VERFALL_GELB_TAGE");
    expect(text).toContain("90");
    expect(text).toContain("56");
    expect(text).toContain("Gelb-Zweig");
  });

  it("ERLAUBT ROT === GELB", () => {
    // Die Kopplung ist `<=`, nicht `<`. Bei Gleichstand hat die Ampel zwei
    // Zustaende, aber der Betreiber hat das dann GEWOLLT — es ist kein Tippfehler
    // in der Rangfolge.
    expect(grenzenFehler({
      ...ERREICHBAR, LAGERBUCH_VERFALL_ROT_TAGE: "40", LAGERBUCH_VERFALL_GELB_TAGE: "40",
    })).toEqual([]);
  });
});

describe("grenzenFehler — Pruefung 3: die Gate-Kette, in BEIDE Richtungen", () => {
  it("lehnt ABSENDER > GESAMT_PRO_MIN ab", () => {
    // Bricht die erste Ungleichung, fuellt ein einzelner Absender die
    // Gesamtbremse, bevor sein eigener Eimer leer ist — die Reihenfolge der
    // Bremsen waere umgekehrt zur Absicht.
    const f = grenzenFehler({
      ...ERREICHBAR,
      LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "40",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "30",
    });
    expect(f.join("\n")).toContain("LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN");
  });

  it("lehnt GESAMT_PRO_MIN > GESAMT_PRO_STUNDE ab", () => {
    // Bricht die zweite, ist der Stundendeckel wirkungslos.
    const f = grenzenFehler({
      ...ERREICHBAR,
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "600",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: "300",
    });
    expect(f.join("\n")).toContain("LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE");
  });

  it("erlaubt Gleichstand an BEIDEN Gliedern der Kette", () => {
    expect(grenzenFehler({
      ...ERREICHBAR,
      LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "30",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "30",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: "30",
    })).toEqual([]);
  });
});

describe("grenzenFehler — Pruefung 4: das Sitzungsgeheimnis, fuenf Bedingungen", () => {
  it("meldet ein FEHLENDES Geheimnis", () => {
    const { LAGERBUCH_HELFER_SITZUNG_SECRET: _weg, ...ohne } = ERREICHBAR;
    expect(grenzenFehler(ohne).join("\n")).toContain("LAGERBUCH_HELFER_SITZUNG_SECRET");
  });

  it("meldet ein LEER GESETZTES Geheimnis", () => {
    // `${LAGERBUCH_HELFER_SITZUNG_SECRET}` ohne `:?` setzt in Compose den LEEREN
    // String, und leer greift keinen Default. Ohne diese Zeile bootet der
    // Container gruen und faellt erst beim ersten /t/<code>-Scan mit 500 um — das
    // Scheitern waere von der Startzeit in die Nutzungszeit gewandert (Falle 23).
    for (const wert of ["", "   "]) {
      expect(grenzenFehler({ ...ERREICHBAR, LAGERBUCH_HELFER_SITZUNG_SECRET: wert }).join("\n"))
        .toContain("LAGERBUCH_HELFER_SITZUNG_SECRET");
    }
  });

  it("meldet ein ZU KURZES Geheimnis und nennt die Mindestlaenge", () => {
    const f = grenzenFehler({ ...ERREICHBAR, LAGERBUCH_HELFER_SITZUNG_SECRET: "x".repeat(31) });
    expect(f.join("\n")).toContain("32");
    expect(grenzenFehler({ ...ERREICHBAR, LAGERBUCH_HELFER_SITZUNG_SECRET: "x".repeat(32) }))
      .toEqual([]);
  });

  it("meldet den DEV-VORGABEWERT", () => {
    expect(grenzenFehler({
      ...ERREICHBAR, LAGERBUCH_HELFER_SITZUNG_SECRET: "dev-insecure-secret-change-me",
    }).join("\n")).toContain("dev-insecure-secret-change-me");
  });

  it("meldet GLEICHHEIT mit AUTH_SECRET", () => {
    /**
     * Die fuenfte Bedingung ist NEU gegenueber `assertProductionSecrets`
     * (`config.ts:104-113`) und kostet eine Zeile: dieselbe Signatur fuer
     * Suite-Sitzung und Helfer-Sitzung hebt die Domaenentrennung auf, die das
     * eigene Geheimnis ueberhaupt erst begruendet (§3.4.1).
     */
    const gleich = "dasselbe-geheimnis-fuer-beide-32-zeichen";
    const f = grenzenFehler({
      SUITE_HOST_LAGERBUCH: "lagerbuch.example.test",
      LAGERBUCH_HELFER_SITZUNG_SECRET: gleich,
      AUTH_SECRET: gleich,
    });
    expect(f.join("\n")).toContain("AUTH_SECRET");
  });

  it("meldet KEINE Gleichheit, wenn AUTH_SECRET gar nicht gesetzt ist", () => {
    // Sonst waere „beide fehlen" ein Gleichheitsfehler — eine Meldung, die in die
    // falsche Richtung zeigt. `AUTH_SECRET` ist Sache der Suite
    // (`compose.yaml:23` mit `${AUTH_SECRET:?…}`), nicht dieses Moduls.
    expect(grenzenFehler({
      SUITE_HOST_LAGERBUCH: "lagerbuch.example.test",
      LAGERBUCH_HELFER_SITZUNG_SECRET: "ein-hinreichend-langes-geheimnis-32z",
    })).toEqual([]);
  });
});

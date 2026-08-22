// src/app/m/radio/_lib/grenzen.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * DIE DOPPELFUEHRUNG (Vorbild `src/app/m/lagerbuch/_lib/grenzen.test.ts`).
 *
 * ⛔ DIESER TEST FUEHRT SEINE EIGENE TABELLE UND ZIEHT SIE NICHT AUS DER IMPLEMENTIERUNG.
 * `_lib/grenzen.ts` exportiert `ZAHLEN` deshalb ausdruecklich NICHT — nur die NAMEN.
 * Wer `ZAHLEN` exportierte, machte aus diesem Test eine Tautologie: er pruefte den Code
 * gegen sich selbst und bliebe auch bei falscher Einheit gruen
 * (`lagerbuch/_lib/grenzen.ts:88-100`, Spec 1 §10.8 Eigenschaft 2).
 *
 * ⚠️ ES SIND VIER ZAHLEN, NICHT FUENF: `RADIO_AUSLEIH_SITZUNG_SECRET` ist eine
 * PFLICHTZEICHENKETTE ohne Vorgabe und steht deshalb nicht in dieser Tabelle. Sie wird
 * im Thunk gelesen (Spec:2042-2047) und hat hier eigene Faelle.
 */
const SOLL = {
  RADIO_AUSLEIH_SITZUNG_STUNDEN: { feld: "ausleihSitzungStunden", einheit: "Stunden", min: 1, max: 24, vorgabe: 12 },
  RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: { feld: "gateProAbsenderProMin", einheit: "Anzahl/min", min: 1, max: 60, vorgabe: 5 },
  RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: { feld: "gateGesamtProMin", einheit: "Anzahl/min", min: 1, max: 600, vorgabe: 30 },
  RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: { feld: "gateGesamtProStunde", einheit: "Anzahl/h", min: 1, max: 3600, vorgabe: 300 },
} as const;

const UMGEBUNG = { ...process.env };
beforeEach(() => { process.env = { ...UMGEBUNG }; });
afterEach(() => { process.env = { ...UMGEBUNG }; });

/**
 * Ein frischer Modulzustand je Fall — `grenzen()` liest die Umgebung beim Aufruf, aber ein
 * spaeterer Umbau auf einen Modulebenen-Cache liefe sonst still an diesem Test vorbei.
 *
 * ⛔ `vi.resetModules()` UND NICHT `import(`./grenzen?t=${Math.random()}`)`. Der
 * Query-String-Trick loest fuer `.ts`-Dateien nicht unter jeder Vite-Aufloesung auf, und
 * DIESE Datei ist die erste, die ein Ausfuehrender ueberhaupt anfasst — ein Fehlschlag
 * hier kostet ihn eine Stunde an der falschen Stelle. Dieselbe Form benutzt A3.
 */
const frisch = async () => { vi.resetModules(); return import("./grenzen"); };

describe("radio-Grenzen: die Namensliste ist vollzaehlig", () => {
  it("genau vier Zahlen, und zwar diese vier", async () => {
    /*
     * ⛔ `toEqual` auf die SORTIERTE Liste, nicht `toContain` je Name. Ein `toContain`
     * bliebe gruen, wenn jemand eine fuenfte Variable ergaenzt, die in SOLL fehlt — und
     * genau diese Richtung ist die gefaehrliche: eine Zahl ohne Gegenprobe hier.
     *
     * ⛔ Die drei GATE-Namen sind in B18 (Spec:118) verbindlich gesetzt. Kapitel 7 nannte
     * nur das Praefix `RADIO_GATE_*`; wer sich darauf beruft, baut andere Namen, und der
     * Boot-Helfer aus Kapitel 7 (Planteil 5) prueft dann drei Variablen, die es nicht gibt.
     *
     * ⛔ `RADIO_AUSLEIH_SITZUNG_STUNDEN` und NICHT `RADIO_ZUGANG_SITZUNG_STUNDEN` — B1
     * (Spec:90): „Ausleih" ist die Rolle, „Zugang" die Mechanik.
     */
    const { ZAHL_NAMEN } = await frisch();
    expect([...ZAHL_NAMEN].sort()).toEqual(Object.keys(SOLL).sort());
  });
});

describe("radio-Grenzen: jede Zahl haelt ihre Vorgabe, ihre Unter- und ihre Obergrenze", () => {
  it.each(Object.entries(SOLL))("%s", async (name, regel) => {
    /*
     * Drei Zusicherungen je Zahl, und jede hat ihre eigene Mutation:
     *   leere Umgebung -> `vorgabe`            (Mutation: andere Vorgabe eintragen)
     *   ein Wert UNTER `min` -> Wurf           (Mutation: `min` senken oder Pruefung streichen)
     *   ein Wert UEBER `max` -> Wurf           (Mutation: `max` heben oder Pruefung streichen)
     *
     * ⚠️ EIN UNGUELTIGER WERT WIRFT, ER FAELLT NICHT AUF DIE VORGABE ZURUECK. Das ist
     * gewollt (`lagerbuch/_lib/gateSchranke.ts:12-14`): „ein Modul, das mit einer kaputten Zahl
     * gar nicht erst startet, ist richtiger als eines, das still eine andere Grenze faehrt
     * als die, die in der .env steht."
     *
     * ⛔ `regel.feld` STEHT ALS EXPLIZITE TABELLENSPALTE OBEN, NICHT ALS UMFORMUNG DES
     * NAMENS. Eine generische Umformung (`RADIO_GATE_…` -> camelCase) waere ein zweites
     * Stueck Logik neben der Implementierung; machen beide denselben Fehler, ist der Test
     * gruen und bewacht nichts.
     *
     * ⛔ ABWEICHUNG VOM BRIEF (A1.md), GEMESSEN, NICHT ERWOGEN. Der Brief fuehrt in `SOLL`
     * eine Spalte `einheit` und LIEST SIE NIRGENDS. Die Mutationssonde S-einheit
     * (`einheit` von `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE` auf "Anzahl/min"
     * gesetzt) ergab in der Briefform **0 rot** — die Spalte war Zierde. Deshalb pruefen
     * die beiden Wurf-Faelle jetzt den EINHEITENTEXT der Meldung mit.
     *
     * Warum genau das noetig ist: `Einheit` in `grenzen.ts` ist eine Union aus drei
     * austauschbaren Woertern, jedes passt an jede Zeile — eine vertauschte Einheit ist
     * typkorrekt, lint-sauber und faellt durch KEIN Werkzeug auf. Der Namenstest sieht
     * nur den VARIABLENNAMEN, nicht `ZAHLEN[name].einheit`. Bei `files` stand genau so
     * „Anzahl" im Code, wo die Spec „Anzahl/10 min" verlangte, und nur die unabhaengige
     * Tabelle hat es gefunden (`src/app/m/lagerbuch/_lib/grenzen.test.ts:18-31`, dort
     * ausgeschrieben).
     */
    delete process.env[name];
    expect((await frisch()).grenzen()[regel.feld]).toBe(regel.vorgabe);

    process.env[name] = String(regel.min - 1);
    await expect(frisch().then((m) => m.grenzen())).rejects.toThrow(`(${regel.einheit})`);

    process.env[name] = String(regel.max + 1);
    await expect(frisch().then((m) => m.grenzen())).rejects.toThrow(`(${regel.einheit})`);
  });
});

describe("radio-Grenzen: das Sitzungsgeheimnis", () => {
  it("heisst RADIO_AUSLEIH_SITZUNG_SECRET und wirft, wenn es fehlt", async () => {
    /*
     * ⛔ B2 (Spec:91) gegen den Kapiteltext (Spec:2042). Der Kapiteltext schreibt
     * `RADIO_AUSLEIH_SITZUNG_GEHEIMNIS` — das ist der aeltere, ueberholte Wortlaut.
     * Bauverbindlich ist `RADIO_AUSLEIH_SITZUNG_SECRET`. Dieser Fall ist der einzige Ort,
     * an dem der Name als Zeichenkette festgehalten ist; ohne ihn liefe eine Umbenennung
     * still durch — der Leser bekaeme `undefined` und die Sitzung waere unsignierbar.
     */
    delete process.env.RADIO_AUSLEIH_SITZUNG_SECRET;
    const { ausleihSitzungGeheimnis } = await frisch();
    expect(() => ausleihSitzungGeheimnis()).toThrow(/RADIO_AUSLEIH_SITZUNG_SECRET/);
  });

  it("wird NICHT auf Modulebene gelesen — der Import gelingt ohne gesetzte Umgebung", async () => {
    /*
     * ⛔ DIE ZUSICHERUNG, DIE `pnpm build` RETTET (Spec:2042-2047, Bestand
     * `lagerbuch/_lib/helferSitzung.ts:39-49`). `next build` laeuft mit
     * NODE_ENV=production und OHNE Secrets und wertet Modulebene aus.
     *
     * ⚠️ DIESER FALL PRUEFT `grenzen.ts` SELBST, NICHT `ausleihSitzung.ts`. Die
     * Gegenprobe fuer den Thunk in `ausleihSitzung.ts` steht in A4; sie kann hier noch
     * nicht stehen, weil es die Datei noch nicht gibt.
     */
    delete process.env.RADIO_AUSLEIH_SITZUNG_SECRET;
    await expect(frisch()).resolves.toBeTruthy();
  });
});

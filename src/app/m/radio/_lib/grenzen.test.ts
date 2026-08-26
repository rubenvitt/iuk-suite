// src/app/m/radio/_lib/grenzen.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { grenzen, grenzenFehler, ausleihSitzungGeheimnis, GrenzenUngueltig } from "./grenzen";

/**
 * ZWEI ZUGAENGE ZU DERSELBEN DATEI, UND BEIDE WERDEN GEBRAUCHT.
 *
 * `frisch()` unten laedt das Modul je Fall NEU und laesst es `process.env` lesen — das ist
 * der Waechter gegen einen spaeteren Modulebenen-Cache und gegen ein Lesen des Geheimnisses
 * beim Import. Der STATISCHE Import hier reicht `grenzen()` und `ausleihSitzungGeheimnis()`
 * dagegen eine eigene Umgebung als Parameter (`grenzen.ts:172`, `:234`); das erlaubt
 * synchrone Faelle ohne `await`, und vor allem: die geworfene Klasse stammt aus DERSELBEN
 * Modulinstanz wie das hier importierte `GrenzenUngueltig`.
 *
 * ⛔ DAS IST DER GRUND, WARUM `toThrow(GrenzenUngueltig)` NUR AUF DIESEM WEG GEHT. Nach
 * `vi.resetModules()` ist die Klasse aus einem `frisch()`-Import ein ANDERES Objekt als die
 * hier gebundene; `toThrow(Klasse)` prueft `instanceof` und waere dann immer rot.
 *
 * ⚠️ Der statische Import kann nicht werfen, solange `grenzen.ts` auf Modulebene nichts
 * liest — und wuerde jemand das aendern, faellt die GANZE Datei beim Laden aus. Lauter als
 * ein einzelner roter Fall, nicht leiser.
 */

/**
 * DIE DOPPELFUEHRUNG (Vorbild `src/app/m/lagerbuch/_lib/grenzen.test.ts`).
 *
 * ⛔ DIESER TEST FUEHRT SEINE EIGENE TABELLE UND ZIEHT SIE NICHT AUS DER IMPLEMENTIERUNG.
 * `_lib/grenzen.ts` exportiert `ZAHLEN` deshalb ausdruecklich NICHT — nur die NAMEN.
 * Wer `ZAHLEN` exportierte, machte aus diesem Test eine Tautologie: er pruefte den Code
 * gegen sich selbst und bliebe auch bei falscher Einheit gruen
 * (`lagerbuch/_lib/grenzen.ts:91-102`, Spec 1 §10.8 Eigenschaft 2).
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

/**
 * Der Meldungstext EINES Wurfs, einmal eingefangen — Bauform woertlich aus dem Vorbild
 * (`src/app/m/lagerbuch/_lib/grenzen.test.ts:58-65`).
 *
 * ⛔ DIE LETZTE ZEILE IST TRAGEND UND KEINE HOEFLICHKEIT. Ohne sie liefe der Helfer bei
 * einem AUSBLEIBENDEN Wurf durch und gaebe `undefined` zurueck; jedes `toContain` darauf
 * waere rot — aber aus dem falschen Grund, und ein `?? ""` an der Stelle machte den Fall
 * still gruen. Das ist genau die Fehlerform, die dieses Repo schon einmal bezahlt hat
 * (eine Abschlusszeile meldete „Paritaet gruen" als konstanten Text).
 */
function meldung(env: Record<string, string | undefined>): string {
  try {
    grenzen(env);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("grenzen() haette werfen muessen");
}

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

    /*
     * ⛔ ZWEITE ABWEICHUNG VOM BRIEF, EBENFALLS GEMESSEN. Der Brief kennt drei
     * Zusicherungen je Zahl, und keine davon erreicht die GANZZAHL-Pruefung: `min - 1`
     * und `max + 1` sind beide ganze Zahlen und fallen durch bis zur Bereichspruefung.
     * Die Sonde S-ganzzahl (den ganzen `if (!GANZZAHL.test(roh))`-Block entfernt) ergab
     * in der Briefform **0 rot** — ein Zweig ohne jeden Waechter.
     *
     * ⚠️ WARUM "1e7" UND NICHT "abc": ohne die Pruefung liefert
     * `Number.parseInt("1e7", 10)` die Zahl **1** — es hoert am `e` auf. Eine .env-Zeile
     * `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE=1e3` faehrt die modulweite Stundenkappe
     * dann bei EINEM Fehlversuch pro Stunde statt bei tausend: das Gate sperrt jeden aus,
     * ohne Wurf und ohne Meldung. `"abc"` machte den Fall zwar auch rot, aber aus einem
     * ANDEREN Grund: `Number.parseInt("abc", 10)` ist `NaN`, und die Bereichspruefung
     * faengt `NaN` gerade NICHT — gemessen, ausgeschrieben in DIESER Datei an `:273-277`.
     *
     * Der Einheitentext wird hier mitgeprueft, weil die NICHT-GANZZAHL-Meldung eine
     * zweite, eigene Textstelle ist (`grenzen.ts:143-144`) — die Bereichsmeldung darunter
     * (`:150`) deckt sie nicht mit ab.
     */
    process.env[name] = "1e7";
    await expect(frisch().then((m) => m.grenzen())).rejects.toThrow(`(${regel.einheit})`);

    process.env[name] = String(regel.min - 1);
    await expect(frisch().then((m) => m.grenzen())).rejects.toThrow(`(${regel.einheit})`);

    process.env[name] = String(regel.max + 1);
    await expect(frisch().then((m) => m.grenzen())).rejects.toThrow(`(${regel.einheit})`);
  });
});

/**
 * ── FIX-RUNDE 1 (REVIEW-A1.md, Funde 1, 3, 4, 5, 7, 8) ───────────────────────────────────
 *
 * Alle sechs Funde sind dieselbe Klasse: ein ZWEIG DER IMPLEMENTIERUNG, den KEIN Fall
 * nennt. Die Auflage „entferne je Test die eine tragende Zeile" kann so etwas strukturell
 * nicht finden — sie prueft nur Tests, die es gibt. Selbst nachgemessen: elf Mutationen an
 * `grenzen.ts` liefen gegen die Fassung vor dieser Runde saemtlich mit **7 passed (7)**
 * durch. Jeder Block unten nennt die Sonde, die ihn rot macht.
 *
 * Die sechs Faelle stehen im Vorbild namentlich und waren im Brief-Testgeruest nicht
 * enthalten: `src/app/m/lagerbuch/_lib/grenzen.test.ts:130-132` (liest bei JEDEM Aufruf),
 * `:153-154` (beide Raender gueltig), `:123-127` (leer gilt wie nicht gesetzt),
 * `:143-146` (die Ganzzahlpruefung), `:158-170` (Name, Wert und Einheit in der Meldung).
 */

describe("radio-Grenzen: ein gesetzter GUELTIGER Wert wird gelesen — an BEIDEN Raendern", () => {
  it.each(Object.entries(SOLL))("%s", (name, regel) => {
    /*
     * ⛔ DER RUECKGABEPFAD SELBST WAR UNBEWACHT (Fund 1). Die drei Zweige, die der Brief
     * prueft, sind: nicht gesetzt -> Vorgabe, ungueltig -> Wurf, ungueltig -> Wurf. Dass
     * ein gueltiger Wert ueberhaupt ANKOMMT, sicherte nichts zu. Sonde P1
     * (`grenzen.ts:153` `return wert;` -> `return regel.vorgabe;`): vorher 0 rot. Das
     * Modul haette damit JEDE `.env`-Zeile ignoriert, ohne dass ein Tor es meldet.
     *
     * ⛔ UND ES SIND BEIDE RAENDER, NICHT EINER (Fund 4). `min` und `max` selbst wurden nie
     * als gueltig zugesichert — geprueft waren nur `min - 1` und `max + 1`. Sonde P4a
     * (`wert < regel.min` -> `wert <= regel.min`) und P4b (`wert > regel.max` ->
     * `wert >= regel.max`): beide vorher 0 rot. Ein Off-by-one schloesse die dokumentierte
     * Spanne an beiden Raendern, und `.env.example` behauptet daneben woertlich „Erlaubt
     * sind 1 bis 24". Eine EINSEITIGE Zusicherung liesse die jeweils andere Haelfte der
     * Mutation ungedeckt — deshalb zwei Zeilen, nicht eine.
     *
     * ⚠️ Beide Zeilen decken zugleich Fund 1, weil `min` und `max` in ALLEN VIER Zeilen von
     * `SOLL` ungleich `vorgabe` sind (24/12, 60/5, 600/30, 3600/300; `min` ist ueberall 1).
     * Nachgerechnet, nicht angenommen — bei Gleichheit waere die Zusicherung stumm.
     */
    expect(grenzen({ [name]: String(regel.min) })[regel.feld]).toBe(regel.min);
    expect(grenzen({ [name]: String(regel.max) })[regel.feld]).toBe(regel.max);
  });
});

describe("radio-Grenzen: jede Wurfmeldung nennt den NAMEN und die EINHEIT", () => {
  it.each(Object.entries(SOLL))("%s", (name, regel) => {
    /*
     * ⛔ DER VARIABLENNAME WAR IN BEIDEN ZAHL-MELDUNGEN UNBEWACHT (Fund 3), und zwar
     * asymmetrisch: der Einheitentext war es nicht (Abweichung 1 der ersten Runde), der
     * Name daneben schon. Sonde P11a (Name aus der Ganzzahl-Meldung, `grenzen.ts:143`) und
     * P11b (Name aus der Bereichs-Meldung, `:150`): beide vorher 0 rot. Zwei Sonden, weil
     * es zwei getrennte Textstellen sind — eine einzige Zusicherung ueberkreditierte sich.
     *
     * Der Betriebsfall: bei VIER Variablen sagt eine Meldung sonst nur
     * `="1e7" ist keine ganze Zahl. Erwartet: 1 bis 3600 (Anzahl/h).` — der Betreiber weiss
     * dann nicht, welche `.env`-Zeile er anfassen muss. Diese Meldung liest er, wenn der
     * Container nicht startet; eine Meldung ohne Namen loest eine Suche aus, statt sie zu
     * beenden (Vorbild `src/app/m/lagerbuch/_lib/grenzen.test.ts:158-170`).
     *
     * ⚠️ `toContain` und NICHT ein zusammengesetzter regulaerer Ausdruck: `toThrow(regex)`
     * laesse `(Anzahl/h)` als GRUPPE durch, nicht als Klammerpaar — der Fall bliebe gruen,
     * ohne die Form der Meldung noch zu belegen.
     */
    const nichtGanzzahl = meldung({ [name]: "1e7" });
    expect(nichtGanzzahl).toContain(name);
    expect(nichtGanzzahl).toContain(`(${regel.einheit})`);

    const zuKlein = meldung({ [name]: String(regel.min - 1) });
    expect(zuKlein).toContain(name);
    expect(zuKlein).toContain(`(${regel.einheit})`);

    const zuGross = meldung({ [name]: String(regel.max + 1) });
    expect(zuGross).toContain(name);
    expect(zuGross).toContain(`(${regel.einheit})`);
  });
});

describe("radio-Grenzen: LEER GESETZT gilt wie NICHT GESETZT", () => {
  it.each(Object.entries(SOLL))("%s", (name, regel) => {
    /*
     * ⛔ DIE REGEL WAR UEBER VIER ZEILEN BEGRUENDET UND VON KEINEM FALL BEWACHT (Fund 5).
     * `grenzen.ts:127-130` schreibt sie aus: `RADIO_AUSLEIH_SITZUNG_STUNDEN=` nach einem
     * `.env`-Aufraeumen ist der haeufigere Fall als die fehlende Zeile, und `Number("")`
     * waere 0 — „eine Sitzung, die sofort abgelaufen ist, oder ein Gate-Limit, das jeden
     * abweist". Ohne Fall darunter faellt genau dieser Betriebsfall in den WURF.
     *
     * ⚠️ ZWEI WERTE, WEIL SIE ZWEI VERSCHIEDENE ZEILEN BEWACHEN — nachgemessen, nicht
     * vermutet: `""` gehoert zu `|| roh === ""` (`grenzen.ts:140`, Sonde P6a), `"   "`
     * gehoert zum `.trim()` eine Zeile darueber (`:139`, Sonde P6b). Beide vorher 0 rot.
     * Eine der beiden Zeilen allein liesse die andere Mutation durch.
     */
    expect(grenzen({ [name]: "" })[regel.feld]).toBe(regel.vorgabe);
    expect(grenzen({ [name]: "   " })[regel.feld]).toBe(regel.vorgabe);
  });
});

describe("radio-Grenzen: die Ganzzahlpruefung ist NICHT Number()", () => {
  it.each(Object.entries(SOLL))("%s", (name, regel) => {
    /*
     * ⛔ DIE DEZIMALLUECKE (Fund 8) UND DER EIGENE FEHLERTYP (Fund 7) IN EINEM FALL.
     *
     * Sonde P10 (`grenzen.ts:122` `/^[+-]?\d+$/` -> `/^[+-]?\d*\.?\d+$/`): vorher 0 rot.
     * Der einzige Wert des Briefs, `"1e7"`, faengt diese Mutation NICHT — beide Ausdruecke
     * weisen ihn ab. Der Wert, der sie faengt, ist eine Dezimalzahl, die IN DEN BEREICH
     * faellt; sonst schluege stattdessen die Bereichspruefung zu und der Fall bliebe aus
     * dem falschen Grund gruen. `${regel.vorgabe}.9` ist je Zeile genau das:
     * `Number.parseInt("12.9", 10)` ist 12 und liegt in 1 bis 24. Selbst nachgerechnet
     * fuer alle vier Zeilen (12.9->12, 5.9->5, 30.9->30, 300.9->300).
     *
     * ⚠️ `"0x10"` STEHT HIER ALS BELEG, NICHT ALS WAECHTER — und das ist der Unterschied,
     * den die Kritik selbst benennt: `Number.parseInt("0x10", 10)` ist 0, und alle vier
     * `min` sind 1, also faengt ihn die BEREICHSPRUEFUNG. Er belegt den Kommentar in
     * `grenzen.ts:117-121`, bewacht den Regex aber nicht.
     *
     * ⚠️ `"fuenf"` IST DAGEGEN SCHARF, und der Grund steht so weder im Bericht noch in der
     * Kritik: `Number.parseInt("fuenf", 10)` ist `NaN`, und `NaN < 1` wie `NaN > 24` sind
     * BEIDE falsch — die Bereichspruefung faengt `NaN` also gerade NICHT durch, sondern
     * gibt ihn zurueck. Selbst gemessen in Node 26. Ohne den `GANZZAHL`-Block liefe das
     * Gate mit `NaN` als Grenze, und jeder Vergleich dagegen ist falsch.
     *
     * ⛔ `toThrow(GrenzenUngueltig)` UND NICHT `toThrow(/text/)` (Fund 7). Sonde P8 (alle
     * drei `throw new GrenzenUngueltig(` -> `throw new Error(`): vorher 0 rot. Der eigene
     * Typ traegt seinen Zweck als Begruendung im Quelltext (`grenzen.ts:22-27`: „damit ein
     * Aufrufer ihn von einem Betriebsfehler unterscheiden kann") und hatte keinen Waechter.
     * ⚠️ Ein `new GrenzenUngueltig("x")` mit `toBeInstanceOf(Error)`, wie das Vorbild es an
     * `:174-177` fuehrt, waere hier die SCHWACHE Form: er ruft `grenzen()` gar nicht und
     * bliebe unter P8 gruen. Bewacht wird der Typ nur AN DER WURFSTELLE.
     */
    for (const roh of ["1e7", "0x10", "fuenf", `${regel.vorgabe}.9`]) {
      expect(() => grenzen({ [name]: roh })).toThrow(GrenzenUngueltig);
    }
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

  it("liefert den gesetzten Wert — und schneidet Leerraum ab", () => {
    /*
     * ⛔ WAS DIE FUNKTION ZURUECKGIBT, PRUEFTE NICHTS (Fund 2). Die beiden Faelle darueber
     * pruefen nur, DASS sie wirft und dass der Import gelingt. Sonde P2a (`grenzen.ts:239`
     * `return wert;` -> `return "SONDE-P2";`): vorher 0 rot. Ein fest verdrahteter, in
     * diesem Repository nachlesbarer HMAC-Schluessel fuer JEDE Ausleih-Sitzung passierte
     * damit Test, Typecheck und Lint (Vorbild
     * `src/app/m/lagerbuch/_lib/grenzen.test.ts:212-215`).
     *
     * ⛔ DIE ZWEITE ZEILE IST DER WAECHTER FUER DAS `?.trim()` (Fund 6, Sonde P7 an
     * `grenzen.ts:235`: vorher 0 rot) — und sie ist die schaerfere Haelfte, weil sie die
     * WIRKUNG des Abschnitts belegt und nicht nur seine Torwaechterrolle.
     */
    expect(ausleihSitzungGeheimnis({ RADIO_AUSLEIH_SITZUNG_SECRET: "sonde-wert-1" })).toBe(
      "sonde-wert-1",
    );
    expect(ausleihSitzungGeheimnis({ RADIO_AUSLEIH_SITZUNG_SECRET: "  sonde-wert-2  " })).toBe(
      "sonde-wert-2",
    );
  });

  it("wirft bei FEHLT, LEER und reinem Leerraum — als GrenzenUngueltig, mit dem Namen", () => {
    /*
     * ⛔ REINER LEERRAUM WAR DIE STILLE LUECKE (Fund 6). `RADIO_AUSLEIH_SITZUNG_SECRET=" "`
     * in einer `env_file` ergaebe ohne das `?.trim()` einen Ein-Zeichen-HMAC-Schluessel —
     * ohne Wurf und ohne Meldung. ⚠️ Und es faengt ihn heute AM START noch nichts:
     * `grenzenFehler()` ist seit G1 gebaut, aber bis G2 ungerufen — `radioBootFehler()`
     * haengt sie erst dort ein (⬜ A-L7, `grenzen.ts:228-232`).
     *
     * ⛔ `toThrow(GrenzenUngueltig)` deckt hier zusaetzlich die dritte Wurfstelle der Datei
     * (`grenzen.ts:237`) gegen Sonde P8 ab; die beiden anderen deckt der Ganzzahl-Block
     * weiter oben. Vorbild: `src/app/m/lagerbuch/_lib/grenzen.test.ts:218-227`.
     */
    for (const env of [
      {},
      { RADIO_AUSLEIH_SITZUNG_SECRET: "" },
      { RADIO_AUSLEIH_SITZUNG_SECRET: "   " },
    ]) {
      expect(() => ausleihSitzungGeheimnis(env)).toThrow(GrenzenUngueltig);
      expect(() => ausleihSitzungGeheimnis(env)).toThrow(/RADIO_AUSLEIH_SITZUNG_SECRET/);
    }
  });
});

/**
 * ── PLANTEIL 5, AUFGABE G1: `grenzenFehler()` ─────────────────────────────────────────────
 *
 * Die Sammelform derselben Tabelle. `grenzen()` wirft beim ERSTEN ungueltigen Wert;
 * `grenzenFehler()` will ALLE Fehler auf einmal, weil der Betreiber sonst vier Neustarts
 * fahren muss (`grenzen.ts:166-170`, dort ausgeschrieben).
 *
 * ⛔ JEDER FALL REICHT SEINE UMGEBUNG ALS PARAMETER — NIE `process.env`. Sonst entschiede
 * ein gesetztes `AUTH_SECRET` der Entwicklungsmaschine ueber den Vergleichsfall (Teil 4),
 * und jede ZAEHLZUSAGE haenge an einer Datei ausserhalb dieses Repos.
 *
 * ⛔ UND JEDER ZAEHLFALL SETZT DAS GEHEIMNIS. Es ist PFLICHT und hat keine Vorbelegung
 * (`grenzen.ts:58-60`, `:204-205`): eine Umgebung ohne `RADIO_AUSLEIH_SITZUNG_SECRET`
 * traegt IMMER eine Meldung mehr, als der Fall meint. Wer das vergisst, misst 2 statt 1
 * und richtet dann die Implementierung nach dem falschen Messwert.
 */

/** 40 Zeichen — ueber der Mindestlaenge 32, damit die Zaehlfaelle nur zaehlen, was sie meinen. */
const GEHEIM_GUELTIG = "g".repeat(40);
/** 31 Zeichen — genau EINS unter der Mindestlaenge. Der Randwert, nicht irgendein kurzer Wert. */
const GEHEIM_ZU_KURZ = "k".repeat(31);

describe("radio-Grenzen: grenzenFehler sammelt, statt zu werfen", () => {
  it("ohne jede RADIO_-Variable meldet grenzenFehler NUR das fehlende Geheimnis", () => {
    /*
     * ⛔ DIESER FALL HEISST NICHT „meldet nichts", UND DAS IST DER PUNKT. Alle vier Zahlen
     * haben eine Vorbelegung (`grenzen.ts:76`, `:82`, `:86`, `:91`) und laufen auf einer
     * leeren Umgebung klaglos durch — das Geheimnis hat keine und wird VERLANGT
     * (`grenzen.ts:204-205`). Genau EINE Meldung ist die Zusage.
     *
     * ⛔ EINE BAUFORM MACHT DARAUS STILL ZWEI MELDUNGEN, und sie ist naheliegend: eine
     * Laengenpruefung AUSSERHALB des `else`-Zweigs (die leere Zeichenkette ist auch
     * „kuerzer als 32"). Beim `AUTH_SECRET`-Vergleich braeuchte es BEIDES — ihn aus dem
     * `else` zu ziehen UND die Wache `authSecret !== ""` zu streichen; solange er im
     * `else` steht, ist sie redundant (nachgemessen, `grenzen.ts:311-313`). Das Vorbild
     * traegt beides: `src/app/m/lagerbuch/_lib/grenzen.ts:334-365` (Datei 368 Zeilen).
     *
     * ⛔ UND DIE GATING-FRAGE GEHOERT NICHT HIERHER. `lagerbuch` beginnt seine Entsprechung
     * mit `if (prodHostsFor(...).length === 0) return [];` (`lagerbuch/_lib/grenzen.ts:283`);
     * fuer `radio` steht dieser Schalter in `radioBootFehler()` (G2). Zoege ihn jemand
     * hierher, liefe dieser Fall auf `[]` — und `grenzenFehler()` waere fuer jeden zweiten
     * Aufrufer unbrauchbar.
     */
    const fehler = grenzenFehler({});
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain("RADIO_AUSLEIH_SITZUNG_SECRET");
  });

  it("eine ungueltige Zahl meldet genau eine Zeile mit Name und Bereich", () => {
    /*
     * Die Meldung kommt WOERTLICH aus `zahl()` (`grenzen.ts:142-145`) — sie wird nicht
     * zweitgeschrieben. Deshalb traegt sie Name, gelesenen Wert, Bereich und Einheit,
     * ohne dass `grenzenFehler()` davon etwas wissen muss.
     */
    const fehler = grenzenFehler({
      RADIO_AUSLEIH_SITZUNG_SECRET: GEHEIM_GUELTIG,
      RADIO_AUSLEIH_SITZUNG_STUNDEN: "abc",
    });
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain("RADIO_AUSLEIH_SITZUNG_STUNDEN");
    expect(fehler[0]).toContain("1 bis 24");
  });

  it("RADIO_AUSLEIH_SITZUNG_STUNDEN=25 wird abgewiesen", () => {
    /*
     * ⛔ EIGENER FALL, KEINE RANDNOTIZ — er ist die Sonde fuer Entscheidung E-G2.
     * Kapitel 7 §7.3.3 Nr. 5 schrieb `1..168` aus; gebaut und ausgeliefert ist `1..24`
     * (`grenzen.ts:76`, Begruendung `:63`: „eine Feldsitzung darf nie laenger dauern als
     * eine Schicht plus Puffer"). E-G2 haelt 24 fest, weil das die STRENGERE, bereits
     * geltende Zusage ist und ein Boot-Bereich neben einem Laufzeit-Bereich genau die zwei
     * Wahrheiten waeren, die `grenzen.ts:53-56` verbietet.
     *
     * Ohne diesen Fall stuende die Entscheidung nur im Kommentar. Sonde S-G1e (`max: 24`
     * auf `168` gehoben) macht ihn rot — und nur ihn.
     */
    const fehler = grenzenFehler({
      RADIO_AUSLEIH_SITZUNG_SECRET: GEHEIM_GUELTIG,
      RADIO_AUSLEIH_SITZUNG_STUNDEN: "25",
    });
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain("RADIO_AUSLEIH_SITZUNG_STUNDEN");
    expect(fehler[0]).toContain("25");
    expect(fehler[0]).toContain("1 bis 24");
  });

  it("vier ungueltige Zahlen ergeben VIER Zeilen, nicht eine", () => {
    /*
     * ⛔ DER GRUND, WARUM EIN EINZELNES `try { grenzen(env) } catch` NICHT GENUEGT.
     * `grenzen()` wertet alle vier Namen in EINEM Objektliteral aus (`grenzen.ts:173-178`),
     * und der erste Wurf aus `zahl()` (`:142`, `:149`) beendet den Aufruf — die drei
     * uebrigen Fehler saehe der Betreiber erst nach dem naechsten Neustart. Vier kaputte
     * Zeilen kosteten ihn vier Neustarts.
     *
     * Sonde S-G1a (die Schleife ueber `ZAHL_NAMEN` durch ein einzelnes
     * `try { grenzen(env) }` ersetzt) macht genau diesen Fall rot.
     */
    const fehler = grenzenFehler({
      RADIO_AUSLEIH_SITZUNG_SECRET: GEHEIM_GUELTIG,
      RADIO_AUSLEIH_SITZUNG_STUNDEN: "abc",
      RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "abc",
      RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "abc",
      RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: "abc",
    });
    expect(fehler).toHaveLength(4);
  });

  it("fehlendes Sitzungsgeheimnis ist eine Meldung", () => {
    /*
     * ⬜ A-L7 ABGELESEN. Der Absatz `grenzen.ts:228-232` hielt bis zu dieser Aufgabe fest:
     * „ES GIBT FUER DIESES MODUL HEUTE KEINE BOOT-PRUEFUNG AUF DAS GEHEIMNIS" — mit
     * Planteil 5 namentlich als Eigentuemer. Hier ist sie.
     *
     * ⛔ DER WORTLAUT WIRD UEBERNOMMEN, NICHT NEU FORMULIERT: derselbe Text traegt den Wurf
     * aus `ausleihSitzungGeheimnis()` — genauer: aus der Konstanten `GEHEIMNIS_FEHLT`
     * (`grenzen.ts:189-192`), die dort geworfen (`:237`) und hier gemeldet wird. Zwei
     * Formulierungen fuer denselben Betriebsfall waeren zwei Wahrheiten, und der Betreiber
     * suchte je nach Weg nach einem anderen Satz.
     */
    const fehler = grenzenFehler({});
    expect(fehler[0]).toContain("RADIO_AUSLEIH_SITZUNG_SECRET");
    expect(fehler[0]).toContain("nicht gesetzt oder leer");
  });

  it("nur Leerraum im Sitzungsgeheimnis gilt als LEER, nicht als zu kurz", () => {
    /*
     * ⛔ DIE TRAGENDE ZUSAGE IST DIE ZWEITE, NICHT DIE ERSTE. Ohne das `?.trim()`
     * (`grenzen.ts:296`) meldete diese Umgebung EBENFALLS genau eine Zeile — nur eben
     * „ist 3 Zeichen lang". `toHaveLength(1)` bliebe gruen; rot wird erst
     * `toContain("nicht gesetzt oder leer")`. Gemessen, nicht erwogen.
     *
     * ⛔ WARUM DAS ZAEHLT: `ausleihSitzungGeheimnis()` trimmt und wirft bei reinem
     * Leerraum „nicht gesetzt oder leer" (`grenzen.ts:235-238`). Liefen die zwei Wege
     * auseinander, meldete der Start eine LAENGE und das erste Einloesen ein FEHLEN —
     * zwei Wahrheiten ueber dieselbe `.env`-Zeile, genau die Klasse, gegen die die
     * geteilte Konstante `GEHEIMNIS_FEHLT` (`grenzen.ts:189-192`) gebaut ist.
     *
     * Reiner Leerraum war fuer den Wurfweg „DIE STILLE LUECKE" (Fund 6, Sonde P7,
     * Testfall bei `:344`); der Boot-Weg hatte sie bis zu diesem Fund noch.
     */
    const fehler = grenzenFehler({ RADIO_AUSLEIH_SITZUNG_SECRET: "   " });
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain("nicht gesetzt oder leer");
  });

  it("die Boot-Meldung und der Wurf tragen DENSELBEN Satz", () => {
    /*
     * ⛔ GEPRUEFT WIRD WEG GEGEN WEG, NICHT WEG GEGEN LITERAL. Ein Literal hier waere eine
     * DRITTE Kopie desselben Satzes und damit selbst das Problem. Zerfiele die geteilte
     * Konstante `GEHEIMNIS_FEHLT` (`grenzen.ts:189-192`, geworfen `:237`, gemeldet `:299`)
     * spaeter in zwei Absaetze, bliebe jeder Literal-Test gruen — und der Betreiber suchte
     * je nach Weg (Startprotokoll oder 500 beim Einloesen) nach einem anderen Satz. Genau
     * den Betriebsfall verhindert die Konstante, und bis zu diesem Fund war sie eine
     * Bauentscheidung ohne Zusage: ein zweiter Wortlaut in `:299` blieb gruen (gemessen).
     *
     * ⛔ FUND N2: `toThrow(<string>)` PRUEFT AUF TEILZEICHENKETTE, NICHT AUF GLEICHHEIT.
     * Die fruehere Fassung dieses Kommentars behauptete das Gegenteil („so scharf wie eine
     * Gleichheit") und war damit selbst die Klasse Fehler, gegen die K1 dieser Aufgabe
     * antrat. Gemessen (Sonde M12): haengt man dem WURFWEG (`grenzen.ts:237`) einen Zusatz
     * an und laesst die Boot-Zeile stehen, blieb `toThrow(...)` GRUEN — der laengere
     * Wurftext enthaelt den kuerzeren Boot-Text. Die eine Zerfallsrichtung war bewacht
     * (Sonde M4, Boot-Text weicht ab), die andere nicht, und der Betreiber laese wieder
     * je nach Weg einen anderen Satz.
     *
     * Deshalb `toBe` auf die ABGEFANGENE Meldung statt `toThrow`. Eine zusaetzliche Zusage
     * „es wurde ueberhaupt geworfen" steht bewusst NICHT hier: sie koennte nie allein rot
     * werden, weil `grenzenFehler({})[0]` ein nicht-leerer Satz ist und ein ausbleibender
     * Wurf `""` gegen ihn stellte — also schon am `toBe` scheiterte.
     */
    let geworfen = "";
    try {
      ausleihSitzungGeheimnis({});
    } catch (e) {
      geworfen = (e as Error).message;
    }
    expect(geworfen).toBe(grenzenFehler({})[0]);
  });

  it("zu kurzes Sitzungsgeheimnis nennt die LAENGE, nicht den Wert", () => {
    /*
     * ⛔ NIE DER WERT SELBST. Diese Meldung landet im Docker-Protokoll, und das Protokoll
     * liest beim Cutover mehr als eine Person. Eine Meldung, die das halbe Geheimnis
     * mitliefert, macht aus einem Konfigurationsfehler einen Geheimnisverlust.
     *
     * ⚠️ 31 IST DER RANDWERT, nicht irgendein kurzer Wert: die zweite Zeile unten waere
     * bei einem beliebigen kurzen Wert genauso gruen, die ERSTE nur bei genau 31.
     * Sonde S-G1b (Mindestlaenge von 32 auf 8 gesenkt) macht den Fall rot.
     */
    const fehler = grenzenFehler({ RADIO_AUSLEIH_SITZUNG_SECRET: GEHEIM_ZU_KURZ });
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain("RADIO_AUSLEIH_SITZUNG_SECRET");
    expect(fehler[0]).toContain("31");
    // ⛔ Fund G2: die geforderte Mindestlaenge braucht eine EIGENE Zusage. Ohne sie ritte
    // die 32 im `openssl rand -base64 32` mit, und ein Streichen von
    // „${GEHEIMNIS_MINDESTLAENGE} sind gefordert" bliebe gruen (gemessen).
    expect(fehler[0]).toContain("mindestens 32 sind gefordert");
    expect(fehler[0]).not.toContain(GEHEIM_ZU_KURZ);
    // ⛔ Fund G3: die Zeile darueber faengt nur den GANZEN Wert. Die Zusage des Codes ist
    // aber „kein PRAEFIX" (`grenzen.ts:302-304`) — ein `geheim.slice(0, 8)` in der Meldung
    // passierte sie. Das Muster wird AUS der Konstanten abgeleitet und nicht abgeschrieben:
    // ein Literal `/k{4}/` waere eine zweite Wahrheit ueber GEHEIM_ZU_KURZ.
    expect(fehler[0]).not.toMatch(new RegExp(GEHEIM_ZU_KURZ.slice(0, 4)));
    expect(fehler[0]).toContain("openssl rand -base64 32");
  });

  it("Sitzungsgeheimnis gleich AUTH_SECRET nennt BEIDE Namen", () => {
    /*
     * ⛔ BEIDE NAMEN, weil der Betreiber sonst nicht weiss, WELCHE der beiden Zeilen er
     * aendern soll — und die falsche Antwort („`AUTH_SECRET` neu setzen") wirft jede
     * angemeldete Person der ganzen Suite aus ihrer Sitzung.
     *
     * Ein geteiltes Geheimnis hoebe die Domaenentrennung auf: dieselbe Signatur truege
     * zwei Bedeutungen, und aus einer Ausleih-Sitzung waere eine Suite-Sitzung
     * (Vorbild `src/app/m/lagerbuch/_lib/grenzen.ts:357-364`).
     *
     * Sonde S-G1c (den `AUTH_SECRET`-Vergleich entfernt) macht ihn rot.
     */
    const fehler = grenzenFehler({
      RADIO_AUSLEIH_SITZUNG_SECRET: GEHEIM_GUELTIG,
      AUTH_SECRET: GEHEIM_GUELTIG,
    });
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain("RADIO_AUSLEIH_SITZUNG_SECRET");
    expect(fehler[0]).toContain("AUTH_SECRET");
  });

  it("die Gate-Kette Absender <= gesamt pro min wird geprueft", () => {
    /*
     * Bricht das erste Glied, fuellt ein einzelner Absender die modulweite Bremse, bevor
     * sein eigener Eimer leer ist — die Reihenfolge der Bremsen waere umgekehrt zur
     * Absicht. Beide Werte sind fuer sich GUELTIG (40 <= 60, 30 <= 600); erst ihr
     * Verhaeltnis ist falsch, und genau deshalb kann `zahl()` das nicht sehen.
     */
    const fehler = grenzenFehler({
      RADIO_AUSLEIH_SITZUNG_SECRET: GEHEIM_GUELTIG,
      RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "40",
      RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "30",
    });
    expect(fehler).toHaveLength(1);
    /*
     * ⛔ FUND W4, NACHGEZAEHLT (Fund N1): UNTER DIESEM BLOCK STEHEN SECHS `toContain`.
     * ⛔ Die VIER LETZTEN pruefen sich selbst — gemessen (Sonde P1b): loescht man sie alle
     * vier, bleiben 39 gruen. Die Schluss-Kette jeder Meldung (`KETTE`,
     * `grenzen.ts:339-343`) nennt ohnehin alle drei Namen mit Wert, und kuerzte man die
     * Meldung auf `KETTE` allein, blieben sie gruen.
     * ⛔ Die ZWEI ERSTEN sind TRAGEND und duerfen nicht als Vakuum mitgestrichen werden —
     * jede ist einzeln gemessen: `…GESAMT_PRO_STUNDE=300` (Zusage A8) faellt mit Sonde
     * P1a (dritter Name aus `KETTE` entfernt → 2 rot), der Erklaersatz mit Sonde M9/P1c
     * (Begruendung der zwei Glieder vertauscht, Kopf bleibt → 1 rot). Hier stand vor N1
     * „DIE VIER `toContain`", waehrend der W4-Fix bereits sechs daraus gemacht hatte.
     *
     * Die ANKERNDE Zusage ist die erste (`toMatch(/^…/)`) — sie unterscheidet die zwei
     * Glieder am Satzanfang. ⚠️ Sie allein genuegt nicht: M9 ist genau die Mutation, die
     * unter richtigem Kopf die falsche Begruendung stehen laesst.
     */
    expect(fehler[0]).toMatch(
      /^RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN=40 ist groesser als RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN=30\./,
    );
    // Der DRITTE Name mit seiner Vorbelegung — die Zusage aus Bericht A8, dass jede
    // Kettenmeldung alle drei Zahlen traegt und nicht nur die zwei verglichenen.
    expect(fehler[0]).toContain("RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE=300");
    // ⛔ UND DER ERKLAERSATZ, nicht nur der Satzanfang: gemessen (Sonde M9) blieb ein
    // Vertauschen der beiden BEGRUENDUNGEN unter richtigem Kopf gruen. Der Betreiber laese
    // dann den richtigen Namen mit dem falschen Grund.
    expect(fehler[0]).toContain("fuellt ein einzelner Absender die modulweite Bremse");
    expect(fehler[0]).toContain("RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN");
    expect(fehler[0]).toContain("RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN");
    expect(fehler[0]).toContain("40");
    expect(fehler[0]).toContain("30");
  });

  it("die Gate-Kette gesamt pro min <= gesamt pro Stunde wird geprueft", () => {
    /*
     * Bricht das zweite Glied, ist der Stundendeckel wirkungslos — und er ist der
     * tragende Zaehler (`grenzen.ts:88-91`).
     */
    const fehler = grenzenFehler({
      RADIO_AUSLEIH_SITZUNG_SECRET: GEHEIM_GUELTIG,
      RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "100",
      RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: "50",
    });
    expect(fehler).toHaveLength(1);
    // ⛔ Fund W4, zweite Haelfte: ohne diese Zusage waere ein Vertauschen der beiden
    // Meldungstexte gruen geblieben.
    expect(fehler[0]).toMatch(
      /^RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN=100 ist groesser als RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE=50\./,
    );
    expect(fehler[0]).toContain("RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN=5");
    expect(fehler[0]).toContain("Stundendeckel wirkungslos");
    expect(fehler[0]).toContain("RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN");
    expect(fehler[0]).toContain("RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE");
    expect(fehler[0]).toContain("100");
    expect(fehler[0]).toContain("50");
  });

  it("eine Kettenmeldung nennt einen unlesbaren Wert als <nicht lesbar>", () => {
    /*
     * ⛔ DIE BENANNTE LEERSTELLE, UND SIE WAR BIS ZU DIESEM FUND UNERREICHT. Der Ternaer
     * (`grenzen.ts:337-338`) auf `${name}=${werte[name]}` reduziert blieb gruen — kein
     * Fall liess eine Kettenmeldung entstehen, WAEHREND eine der drei Zahlen unlesbar war.
     * Ohne ihn stuende `...GESAMT_PRO_STUNDE=undefined` im Startprotokoll: eine Zahl, die
     * niemand gesetzt hat, und der Betreiber suchte die falsche `.env`-Zeile.
     *
     * Die Umgebung ist so gewaehlt, dass beides zugleich gilt: 40/30 bricht Glied 1
     * (beide Werte fuer sich gueltig), "abc" macht die dritte Zahl unlesbar.
     *
     * ⚠️ UND WAS DIESER FALL NICHT DECKT: die `!== undefined`-Waechter selbst
     * (`grenzen.ts:349`, `:357`) bleiben durch KEINE Mutation beobachtbar — `undefined > 30`
     * und `30 > undefined` sind beide `false`, ein Weglassen aendert also kein Verhalten.
     * Sie sind vom Typsystem erzwungen, nicht vom Verhalten. Dieser Fall macht nur die
     * WIRKUNG des Zustands sichtbar (die Leerstelle in der Meldung), nicht die Waechter.
     *
     * Die zwei Zeilen unten sichern nebenbei die Reihenfolge Teil 1 vor Teil 5 zu.
     */
    const fehler = grenzenFehler({
      RADIO_AUSLEIH_SITZUNG_SECRET: GEHEIM_GUELTIG,
      RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "40",
      RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "30",
      RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: "abc",
    });
    expect(fehler).toHaveLength(2);
    expect(fehler[0]).toContain("RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE");
    expect(fehler[1]).toContain("RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE=<nicht lesbar>");
  });

  it("eine gueltige Kette meldet nichts", () => {
    /*
     * ⛔ DIE ERSTE ZEILE IST DIE TRAGENDE, UND DIE ZWEITE IST ES NICHT. Nachgemessen,
     * nicht vermutet: Sonde S-G1d (`<=` in der Kette auf `<` verschaerft, also die
     * Bedingung von `>` auf `>=`) laesst 5/30/300 voellig unberuehrt — `5 >= 30` und
     * `30 >= 300` sind beide falsch, der Fall bliebe gruen, und die Sonde ergaebe 0 rot.
     * Nur der GLEICHHEITSRAND unterscheidet die beiden Fassungen: 30/30/30 ist unter
     * `<=` erlaubt und unter `<` ein Fehler.
     *
     * 30 liegt in allen drei Bereichen (max 60, 600, 3600), der Fall misst also
     * ausschliesslich die Kette und nicht nebenbei eine Bereichsgrenze.
     *
     * Die zweite Zeile steht trotzdem: sie sichert zu, dass die AUSGELIEFERTEN
     * Vorbelegungen (5/30/300, `grenzen.ts:82`, `:86`, `:91`) die eigene Kette einhalten.
     */
    expect(
      grenzenFehler({
        RADIO_AUSLEIH_SITZUNG_SECRET: GEHEIM_GUELTIG,
        RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "30",
        RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "30",
        RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: "30",
      }),
    ).toEqual([]);
    expect(
      grenzenFehler({
        RADIO_AUSLEIH_SITZUNG_SECRET: GEHEIM_GUELTIG,
        RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "5",
        RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "30",
        RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: "300",
      }),
    ).toEqual([]);
  });

  it("grenzenFehler wirft nie", () => {
    /*
     * ⛔ SIE DARF NICHT WERFEN, UND ZWAR AUS EINEM GRUND AUSSERHALB DIESER DATEI:
     * `radioBootFehler()` (G2) haengt als `...(await radioBootFehler())` in
     * `assertHostConfig` (`src/core/bootstrap.ts:90-103`). Ein Wurf von hier naehme den
     * GANZEN PROZESS mit — alle elf Eintraege in `src/core/registry.ts:53-213` (selbst
     * gezaehlt, nicht uebernommen) faenden ihr Ende in einer radio-Konfigurationszeile
     * (Bauform-Tafel Nr. 3).
     *
     * Nachgezaehlt: vier kaputte Zahlen + das fehlende Geheimnis = FUENF. Die Kette
     * schweigt, weil keiner ihrer drei Werte gelesen werden konnte — genau die Zusage von
     * Teil 5, dass eine Ketten-Meldung nie einen Wert vergleicht, den `zahl()` gerade
     * abgelehnt hat.
     */
    const kaputt = {
      RADIO_AUSLEIH_SITZUNG_STUNDEN: "abc",
      RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "-1",
      RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "1e7",
      RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: "99999",
    };
    expect(() => grenzenFehler(kaputt)).not.toThrow();
    const fehler = grenzenFehler(kaputt);
    expect(fehler).toHaveLength(5);
    /*
     * ⛔ FUND G1 (gering): DIE REIHENFOLGE DER TEILE IST EINE ZUSAGE DER VERTRAGSTAFEL
     * („Sie liefert, in dieser Reihenfolge"), und bis hierhin bewachte sie nichts —
     * `return fehler.reverse()` blieb gruen (gemessen). Die vier Zahlmeldungen kommen aus
     * Teil 1, die Geheimnismeldung aus Teil 2; sie steht also HINTER ihnen.
     */
    expect(fehler[4]).toContain("nicht gesetzt oder leer");
  });
});

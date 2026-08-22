// src/app/m/radio/_lib/grenzen.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { grenzen, ausleihSitzungGeheimnis, GrenzenUngueltig } from "./grenzen";

/**
 * ZWEI ZUGAENGE ZU DERSELBEN DATEI, UND BEIDE WERDEN GEBRAUCHT.
 *
 * `frisch()` unten laedt das Modul je Fall NEU und laesst es `process.env` lesen — das ist
 * der Waechter gegen einen spaeteren Modulebenen-Cache und gegen ein Lesen des Geheimnisses
 * beim Import. Der STATISCHE Import hier reicht `grenzen()` und `ausleihSitzungGeheimnis()`
 * dagegen eine eigene Umgebung als Parameter (`grenzen.ts:172`, `:212`); das erlaubt
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
     * pruefen nur, DASS sie wirft und dass der Import gelingt. Sonde P2a (`grenzen.ts:221`
     * `return wert;` -> `return "SONDE-P2";`): vorher 0 rot. Ein fest verdrahteter, in
     * diesem Repository nachlesbarer HMAC-Schluessel fuer JEDE Ausleih-Sitzung passierte
     * damit Test, Typecheck und Lint (Vorbild
     * `src/app/m/lagerbuch/_lib/grenzen.test.ts:212-215`).
     *
     * ⛔ DIE ZWEITE ZEILE IST DER WAECHTER FUER DAS `?.trim()` (Fund 6, Sonde P7 an
     * `grenzen.ts:213`: vorher 0 rot) — und sie ist die schaerfere Haelfte, weil sie die
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
     * ohne Wurf und ohne Meldung. ⚠️ Und es gibt fuer `radio` heute KEINE Boot-Pruefung,
     * die es spaeter faenge: `radioBootFehler()` ist Planteil 5 (⬜ A-L7,
     * `grenzen.ts:206-210`). Der Fall faellt also nirgends sonst auf.
     *
     * ⛔ `toThrow(GrenzenUngueltig)` deckt hier zusaetzlich die dritte Wurfstelle der Datei
     * (`grenzen.ts:215`) gegen Sonde P8 ab; die beiden anderen deckt der Ganzzahl-Block
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
